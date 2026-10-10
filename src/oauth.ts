import type { Env } from './env';
import { toBase64url, type Tokens } from './state';

interface ProviderConfig {
	// Extra parameters of the authorization request.
	authorize: Record<string, string>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
	googledrive: {
		authorize: {
			scope: 'https://www.googleapis.com/auth/drive.readonly',
			access_type: 'offline',
			prompt: 'consent',
		},
	},
	onedrive: {
		authorize: {
			scope: 'offline_access sites.read.all files.read.all user.read',
			// Microsoft returns with a form POST, which keeps the code out of the browser history.
			response_mode: 'form_post',
		},
	},
};

export function isProvider(name: string | null): name is string {
	return name !== null && Object.hasOwn(PROVIDERS, name);
}

// The app used before the current one: refresh tokens it issued only refresh with its own credentials.
type App = '' | 'LEGACY_';

function setting(env: Env, provider: string, name: string): string | undefined {
	const value = env[`PROVIDER_${provider.toUpperCase()}_${name}`];
	return value ? value : undefined;
}

export function callbackUrl(env: Env): string {
	return new URL('/callback', env.SITE_URL).toString();
}

export async function pkceChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return toBase64url(new Uint8Array(digest));
}

export async function authorizeUrl(env: Env, provider: string, pin: string, codeVerifier: string): Promise<string> {
	const url = new URL(setting(env, provider, 'URL_AUTHORIZE') ?? '');
	const params = {
		client_id: setting(env, provider, 'CLIENT_ID') ?? '',
		redirect_uri: callbackUrl(env),
		state: pin,
		response_type: 'code',
		code_challenge: await pkceChallenge(codeVerifier),
		code_challenge_method: 'S256',
		...PROVIDERS[provider]?.authorize,
	};
	for (const [name, value] of Object.entries(params)) {
		url.searchParams.set(name, value);
	}
	return url.toString();
}

/** An error answer from the provider's token endpoint. */
export class TokenError extends Error {
	constructor(
		readonly status: number,
		readonly error: string | undefined,
		readonly description: string | undefined,
	) {
		super(`${error ?? status}: ${description ?? ''}`);
	}
}

export function exchangeCode(env: Env, provider: string, code: string, codeVerifier: string): Promise<Tokens> {
	return tokenRequest(env, provider, '', {
		grant_type: 'authorization_code',
		code,
		code_verifier: codeVerifier,
		redirect_uri: callbackUrl(env),
	});
}

/** Refreshes with the current app, and with the legacy app when the current one rejects the token. */
export async function refresh(env: Env, provider: string, refreshToken: string): Promise<Tokens> {
	const params = { grant_type: 'refresh_token', refresh_token: refreshToken };
	try {
		return await tokenRequest(env, provider, '', params);
	} catch (e) {
		if (!(e instanceof TokenError) || e.status < 400 || e.status >= 500 || !setting(env, provider, 'LEGACY_CLIENT_ID')) {
			throw e;
		}
		try {
			const tokens = await tokenRequest(env, provider, 'LEGACY_', params);
			console.log(`Token request succeeded with the legacy app: provider=${provider} grant_type=refresh_token`);
			return tokens;
		} catch {
			// Most likely a token of the current app that is no longer valid: report the current app's error.
			throw e;
		}
	}
}

async function tokenRequest(env: Env, provider: string, app: App, params: Record<string, string>): Promise<Tokens> {
	const body = new URLSearchParams({ client_id: setting(env, provider, `${app}CLIENT_ID`) ?? '' });
	const secret = setting(env, provider, `${app}CLIENT_SECRET`);
	if (secret) {
		body.set('client_secret', secret);
	}
	for (const [name, value] of Object.entries(params)) {
		body.set(name, value);
	}
	const response = await fetch(setting(env, provider, 'URL_TOKEN') ?? '', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		body,
	});
	if (response.ok) {
		return (await response.json()) as Tokens;
	}
	// Only the provider's error code and description: never the token or the raw response body.
	let error: { error?: unknown; error_description?: unknown } = {};
	try {
		error = (await response.json()) as typeof error;
	} catch {
		// Not JSON.
	}
	const code = typeof error.error === 'string' ? error.error : undefined;
	const description = typeof error.error_description === 'string' ? truncate(error.error_description) : undefined;
	console.warn(
		`Token request failed: provider=${provider} app=${app ? 'legacy' : 'current'} grant_type=${params.grant_type} ` +
			`status=${response.status} error=${code} description=${description}`,
	);
	throw new TokenError(response.status, code, description);
}

function truncate(text: string): string {
	return text.length > 200 ? `${text.slice(0, 200)}...` : text;
}
