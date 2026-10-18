import type { Env, Store } from './env';
import { type Messages, messages, negotiate } from './i18n';
import { authorizeUrl, exchangeCode, isProvider, refresh, TokenError } from './oauth';
import { accessUser } from './access';
import { usageErrorPage, usagePage } from './dashboard';
import { driveMetrics } from './google';
import { failurePage, indexPage, notFoundPage, privacyPage, successPage, tooManyPage } from './pages';
import { loadReport, PERIODS, sqlApi } from './report';
import { ipv6Groups, type Limit } from './state';
import { clientInfo, ingest, record, type UsageEvent } from './usage';

/** Records a usage event with the request's country and client. */
type Track = (event: UsageEvent) => void;

// Ties the browser that starts the sign-in to the one that finishes it, so a sign-in link cannot be sent to
// someone else to collect their tokens. SameSite=None because Microsoft returns with a cross-site form POST
// (response_mode=form_post), which would not carry a Lax cookie.
export const SIGNIN_COOKIE = '__Host-signin';
const SIGNIN_COOKIE_AGE_S = 5 * 60;
const RETRY_AFTER_S = 60;

// No inline scripts or styles anywhere. form-action allows https: because /authorize answers the code form
// with a redirect to the provider's sign-in page. public/_headers sets the same headers on static files.
const SECURITY_HEADERS: Record<string, string> = {
	'Content-Security-Policy': [
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self'",
		"img-src 'self' data:",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
		"form-action 'self' https:",
	].join('; '),
	'Strict-Transport-Security': 'max-age=31536000',
	'X-Content-Type-Options': 'nosniff',
	// Keeps the code in /signin/{code} out of the Referer sent to providers and donation sites.
	'Referrer-Policy': 'no-referrer',
};

export async function handle(request: Request, env: Env, store: Store): Promise<Response> {
	const lang = negotiate(request.headers.get('Accept-Language'), new URL(request.url).searchParams.get('lang'));
	const t = { ...messages(lang), supportUrl: env.FUNDING_URL || undefined };
	let response: Response;
	try {
		response = await route(request, env, store, t);
	} catch (e) {
		// Only the error's message: requests may contain tokens.
		console.error(`Request failed: ${request.method} ${new URL(request.url).pathname.replace(/^\/(pin|signin)\/.*/, '/$1/*')} ${e instanceof Error ? e.message : e}`);
		response = new Response(failurePage(t), { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	}
	const secured = new Response(response.body, response);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		secured.headers.set(name, value);
	}
	if ((secured.headers.get('Content-Type') ?? '').startsWith('text/html')) {
		secured.headers.set('Content-Language', t.tag);
		secured.headers.append('Vary', 'Accept-Language');
	}
	return secured;
}

async function route(request: Request, env: Env, store: Store, t: Messages): Promise<Response> {
	const url = new URL(request.url);
	const site = new URL(env.SITE_URL);
	const read = request.method === 'GET' || request.method === 'HEAD';
	// Plain HTTP, and other host names of this Worker (e.g. signin-server.com), go to the site address.
	if ((env.REQUIRE_HTTPS !== 'false' && url.protocol === 'http:') || url.host !== site.host) {
		// 308 keeps the method and body for POSTs.
		return redirect(new URL(url.pathname + url.search, site).toString(), read ? 301 : 308);
	}

	const client = clientAddress(request);
	const path = url.pathname;
	if (path === '/ingest/usage' && request.method === 'POST') {
		return ingest(env, request);
	}
	if (path === '/usage' && read) {
		return usage(env, request, t);
	}
	const country = (request as { cf?: { country?: string } }).cf?.country ?? '';
	const agent = clientInfo(request.headers.get('User-Agent'), request.headers.get('addon'));
	const track: Track = (event) => record(env, { country, client: agent, ...event });
	const tokenHash = await refreshTokenHash(request);
	const limited = await store.acquire(limits(env, request, path, client, tokenHash));
	if (limited) {
		console.warn(`Rate limit exceeded: ${limited}`);
		track({ event: 'rate_limited', outcome: 'rejected', error: limited });
		const html = (request.headers.get('Accept') ?? '').includes('text/html');
		return new Response(html ? tooManyPage(t) : 'Too many requests', {
			status: 429,
			headers: { 'Content-Type': html ? 'text/html; charset=utf-8' : 'text/plain', 'Retry-After': String(RETRY_AFTER_S) },
		});
	}

	if (path === '/' && read) {
		return html(indexPage(t, sourceId(client)));
	}
	if (path === '/authorize') {
		return signin(env, store, t, track, client, (await params(request)).get('pin') ?? '');
	}
	if (path.startsWith('/signin/')) {
		return signin(env, store, t, track, client, path.slice('/signin/'.length));
	}
	if (path === '/callback') {
		return callback(env, store, t, track, request, await params(request));
	}
	if (path === '/auth-success' && read) {
		return html(successPage(t, funding(env)));
	}
	if (path === '/failure' && read) {
		return html(failurePage(t));
	}
	if (path === '/privacypolicy' && read) {
		return html(privacyPage(t));
	}
	if (path === '/pin' && request.method === 'POST') {
		const provider = (await params(request)).get('provider');
		if (!isProvider(provider)) {
			track({ event: 'pin', outcome: 'invalid_provider' });
			return json({ status: 400, error: 'Invalid provider' }, 400);
		}
		track({ event: 'pin', provider, outcome: 'created' });
		return json(await store.createPin(provider, client));
	}
	if (path.startsWith('/pin/') && read) {
		const collected = await store.collect(path.slice('/pin/'.length), basicPassword(request), client);
		if (collected.status === 200) {
			track({ event: 'collect', outcome: 'delivered' });
			return json(collected.tokens);
		}
		if (collected.status !== 202) {
			// An expired or unknown code (the 202 "still waiting" answers are too many to count).
			track({ event: 'collect', outcome: 'not_found' });
		}
		return collected.status === 202 ? new Response(null, { status: 202 }) : json({ status: 404, error: 'Not Found' }, 404);
	}
	if (path === '/refresh' && request.method === 'POST') {
		const form = await params(request);
		const provider = form.get('provider');
		const refreshToken = form.get('refresh_token');
		if (!isProvider(provider) || !refreshToken) {
			return json({ status: 400, error: 'Provider and refresh token required' }, 400);
		}
		try {
			const refreshed = await refresh(env, provider, refreshToken);
			track({ event: 'refresh', provider, app: refreshed.app, outcome: 'ok' });
			await countActive(store, track, provider, refreshed.app, tokenHash);
			return json(refreshed.tokens);
		} catch (e) {
			track({
				event: 'refresh',
				provider,
				app: e instanceof TokenError ? e.app : '',
				outcome: 'failed',
				error: e instanceof TokenError ? (e.error ?? String(e.status)) : 'server_error',
			});
			if (e instanceof TokenError && e.status >= 400 && e.status < 500) {
				return json({ status: e.status, error: e.error ?? 'Token request failed' }, e.status);
			}
			throw e;
		}
	}
	if (path === '/ip' && read) {
		return new Response(client, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	}
	return new Response(notFoundPage(t), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** The private usage page, for the Cloudflare Access application's users only. */
async function usage(env: Env, request: Request, t: Messages): Promise<Response> {
	if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ANALYTICS_ACCOUNT_ID || !env.USAGE_API_TOKEN) {
		return new Response(notFoundPage(t), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	}
	const user = await accessUser(request, env);
	if (user === null) {
		return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
	}
	const search = new URL(request.url).searchParams;
	const requested = number(search.get('days') ?? undefined, 7);
	const period = PERIODS.includes(requested) ? requested : 7;
	let body: string;
	try {
		// loadReport only uses a day that is one of the period's days.
		const drive = env.GOOGLE_METRICS_KEY && env.GOOGLE_METRICS_PROJECTS ? driveMetrics(env.GOOGLE_METRICS_KEY, env.GOOGLE_METRICS_PROJECTS) : undefined;
		body = usagePage(await loadReport(sqlApi(env.ANALYTICS_ACCOUNT_ID, env.USAGE_API_TOKEN), period, new Date(), search.get('day'), drive), period, user);
	} catch (e) {
		console.error(`Usage page: ${e instanceof Error ? e.message : e}`);
		body = usageErrorPage(period, user, 'Analytics Engine did not answer. Try again in a minute.');
	}
	return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

/** Sends the browser to the provider when the code exists and was created from this network. */
async function signin(env: Env, store: Store, t: Messages, track: Track, client: string, pin: string): Promise<Response> {
	// The letter O is a common typo for zero: codes are hexadecimal.
	const code = pin.trim().toUpperCase().replace(/O/g, '0');
	const started = code ? await store.startSignin(code, client) : null;
	if (!started) {
		track({ event: 'signin_start', outcome: 'invalid_code' });
		return html(indexPage(t, sourceId(client), code.slice(0, 6), 'error.pin.invalid'));
	}
	track({ event: 'signin_start', provider: started.provider, outcome: 'redirected' });
	const response = redirect(await authorizeUrl(env, started.provider, code, started.codeVerifier), 302);
	response.headers.append('Set-Cookie', signinCookie(started.browserNonce, SIGNIN_COOKIE_AGE_S));
	return response;
}

async function callback(env: Env, store: Store, t: Messages, track: Track, request: Request, form: URLSearchParams): Promise<Response> {
	const error = form.get('error');
	const state = form.get('state');
	const code = form.get('code');
	if (error === 'access_denied') {
		track({ event: 'signin', outcome: 'denied', error });
		return html(failurePage(t, { message: 'failure.denied' }));
	}
	if (error) {
		track({ event: 'signin', outcome: 'provider_error', error });
		return html(failurePage(t, { text: `${error}: ${form.get('error_description') ?? ''}` }));
	}
	if (!state || !code) {
		track({ event: 'signin', outcome: 'missing_code' });
		return html(failurePage(t, { message: 'failure.code.3' }));
	}
	const finished = await store.finishSignin(state, cookie(request, SIGNIN_COOKIE));
	if (finished.status === 'expired') {
		track({ event: 'signin', outcome: 'expired' });
		return html(failurePage(t, { message: 'failure.code.1' }));
	}
	if (finished.status === 'other-browser') {
		console.warn('Sign-in callback rejected: not finished in the browser that started it');
		track({ event: 'signin', outcome: 'other_browser' });
		return html(failurePage(t, { message: 'failure.code.4' }));
	}
	const clearCookie = signinCookie('', 0);
	let page: Response;
	try {
		const tokens = await exchangeCode(env, finished.provider, code, finished.codeVerifier);
		const stored = await store.storeTokens(state, tokens);
		track({ event: 'signin', provider: finished.provider, outcome: stored ? 'completed' : 'expired' });
		page = stored ? redirect('/auth-success', 302) : html(failurePage(t, { message: 'failure.code.1' }));
	} catch (e) {
		if (!(e instanceof TokenError)) {
			throw e;
		}
		track({ event: 'signin', provider: finished.provider, outcome: 'exchange_failed', error: e.error ?? String(e.status) });
		page = html(failurePage(t, { message: 'failure.code.2', text: e.error ? `(${e.error})` : undefined }));
	}
	page.headers.append('Set-Cookie', clearCookie);
	return page;
}

/** Daily active accounts: the sum of these events per day. Only a count is recorded, never the hash. Never fails the request. */
async function countActive(store: Store, track: Track, provider: string, app: string, tokenHash: string | null): Promise<void> {
	if (!tokenHash) {
		return;
	}
	try {
		if (await store.firstToday(`${provider}:${tokenHash}`)) {
			track({ event: 'active_account', provider, app, outcome: 'ok' });
		}
	} catch (e) {
		console.error(`Active account not counted: ${e instanceof Error ? e.message : e}`);
	}
}

function limits(env: Env, request: Request, path: string, client: string, tokenHash: string | null): Limit[] {
	const post = request.method === 'POST';
	if (post && path === '/pin') {
		return [{ name: 'pin', key: `pin:${client}`, limit: number(env.RATE_LIMIT_PIN, 10) }];
	}
	if (path === '/authorize' || path.startsWith('/signin/')) {
		return [{ name: 'signin', key: `signin:${client}`, limit: number(env.RATE_LIMIT_SIGNIN, 20) }];
	}
	if (post && path === '/refresh') {
		const limits = [{ name: 'refresh per IP', key: `refresh-ip:${client}`, limit: number(env.RATE_LIMIT_REFRESH_IP, 60) }];
		if (tokenHash) {
			limits.push({ name: 'refresh per token', key: `refresh-token:${tokenHash}`, limit: number(env.RATE_LIMIT_REFRESH_TOKEN, 10) });
		}
		return limits;
	}
	return [];
}

/** Refresh tokens are counted by their SHA-256 hash, never kept as they are. */
async function refreshTokenHash(request: Request): Promise<string | null> {
	if (request.method !== 'POST' || new URL(request.url).pathname !== '/refresh') {
		return null;
	}
	const token = (await params(request)).get('refresh_token');
	if (!token) {
		return null;
	}
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The client's public IP address, used to pair the browser with the Kodi device and as the rate-limit key.
 * Cloudflare sets CF-Connecting-IP and overwrites any value the client sends.
 */
export function clientAddress(request: Request): string {
	const address = request.headers.get('CF-Connecting-IP') ?? '127.0.0.1';
	// IPv4 and IPv6 loopback are the same machine (local development); production never sees them.
	return address === '::1' || address.startsWith('127.') ? '127.0.0.1' : address;
}

/**
 * Shown to users so they can compare networks between Kodi and the browser: the sum of the parts of an IPv4
 * address, or of the four network groups (the /64) of an IPv6 address. The add-on computes the same.
 */
export function sourceId(address: string): string {
	const groups = ipv6Groups(address);
	if (groups) {
		return String(groups.slice(0, 4).reduce((sum, g) => sum + g, 0));
	}
	const parts = address.split('.');
	return parts.length === 4 && parts.every((p) => /^\d+$/.test(p)) ? String(parts.reduce((sum, p) => sum + Number(p), 0)) : '-1';
}

// Query string and form body parameters together, like a servlet's request parameters. Reads a clone,
// so the body can be read again.
async function params(request: Request): Promise<URLSearchParams> {
	const all = new URLSearchParams(new URL(request.url).search);
	if (request.method === 'POST' && (request.headers.get('Content-Type') ?? '').startsWith('application/x-www-form-urlencoded')) {
		for (const [name, value] of new URLSearchParams(await request.clone().text())) {
			all.append(name, value);
		}
	}
	return all;
}

function basicPassword(request: Request): string {
	const [scheme, value] = (request.headers.get('Authorization') ?? '').split(' ');
	if (scheme?.toLowerCase() !== 'basic' || !value) {
		return '';
	}
	try {
		const credentials = atob(value);
		return credentials.slice(credentials.indexOf(':') + 1);
	} catch {
		return '';
	}
}

function cookie(request: Request, name: string): string | null {
	for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
		const [key, ...value] = part.trim().split('=');
		if (key === name) {
			return value.join('=');
		}
	}
	return null;
}

function signinCookie(value: string, maxAge: number): string {
	return `${SIGNIN_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=None`;
}

function funding(env: Env) {
	return env.FUNDING_URL ? { url: env.FUNDING_URL, goal: number(env.FUNDING_GOAL, 0), raised: number(env.FUNDING_RAISED, 0) } : null;
}

function number(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function html(body: string): Response {
	return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function redirect(location: string, status: number): Response {
	return new Response(null, { status, headers: { Location: location } });
}
