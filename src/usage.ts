import type { Env } from './env';

/**
 * Anonymous usage counts, written to Workers Analytics Engine (dataset signin_usage, kept three months).
 * No IP addresses, tokens, or anything derived from them: daily active accounts are counted in memory
 * (SigninState.firstToday) and recorded as a count.
 *
 * Columns (blob1..blob12, double1): see BLOBS. Query with scripts/usage-report.mjs.
 */
export interface UsageEvent {
	// pin, signin_start, signin, collect, refresh, active_account, rate_limited
	event: string;
	provider?: string;
	// The OAuth app that answered a refresh: current or legacy.
	app?: string;
	// What happened, e.g. created, completed, denied, ok, failed.
	outcome: string;
	// The provider's error code, or the rate limit's name.
	error?: string;
	// worker, or heroku for the summaries drive-login sends.
	source?: string;
	country?: string;
	client?: ClientInfo;
	count?: number;
}

export interface ClientInfo {
	// kodi, browser or other.
	kind: string;
	addon: string;
	addonVersion: string;
	commonVersion: string;
	kodiVersion: string;
	pythonVersion: string;
}

export const BLOBS = [
	'event',
	'provider',
	'app',
	'outcome',
	'error',
	'source',
	'country',
	'client',
	'addon',
	'addon_version',
	'common_version',
	'kodi_version',
] as const;

// Analytics Engine accepts at most 250 data points per request.
export const MAX_POINTS_PER_REQUEST = 200;

/** Writes the event. Usage data must never break a request: failures are only logged. */
export function record(env: Env, event: UsageEvent): void {
	if (!env.USAGE) {
		return;
	}
	const client = event.client ?? { kind: '', addon: '', addonVersion: '', commonVersion: '', kodiVersion: '', pythonVersion: '' };
	try {
		env.USAGE.writeDataPoint({
			indexes: [event.event],
			blobs: [
				event.event,
				event.provider ?? '',
				event.app ?? '',
				event.outcome,
				clip(event.error ?? ''),
				event.source ?? 'worker',
				event.country ?? '',
				client.kind,
				client.addon,
				client.addonVersion,
				client.commonVersion,
				client.kodiVersion,
			],
			doubles: [event.count ?? 1],
		});
	} catch (e) {
		console.error(`Usage event not recorded: ${e instanceof Error ? e.message : e}`);
	}
}

/**
 * Who made the request. Every add-on version sends an "addon" header, "plugin.googledrive 1.6.3/1.5.4" (add-on
 * and common module versions), on its code, collect and refresh requests. From common 1.5.5 the User-Agent adds
 * Kodi's and Python's: "plugin.googledrive/1.6.3 clouddrive.common/1.5.5 Kodi/21.2 Python/3.11". Older versions
 * send Python-urllib's.
 */
export function clientInfo(userAgent: string | null, addonHeader: string | null = null): ClientInfo {
	const info: ClientInfo = { kind: 'other', addon: '', addonVersion: '', commonVersion: '', kodiVersion: '', pythonVersion: '' };
	const agent = userAgent ?? '';
	const legacy = /^(plugin\.[\w.-]+) ([\w.+-]+)\/([\w.+-]+)$/.exec((addonHeader ?? '').trim());
	if (legacy) {
		info.addon = clip(legacy[1] ?? '', 40);
		info.addonVersion = clip(legacy[2] ?? '', 20);
		info.commonVersion = clip(legacy[3] ?? '', 20);
	}
	for (const match of agent.matchAll(/([A-Za-z][\w.-]*)\/([\w.+-]+)/g)) {
		const name = match[1] ?? '';
		const version = match[2] ?? '';
		if (name.startsWith('plugin.') && !info.addon) {
			info.addon = clip(name, 40);
			info.addonVersion = clip(version, 20);
		} else if (name === 'clouddrive.common') {
			info.commonVersion = clip(version, 20);
		} else if (name === 'Kodi') {
			info.kodiVersion = clip(version, 20);
		} else if (name === 'Python' || name === 'Python-urllib') {
			info.pythonVersion = clip(version, 10);
		}
	}
	if (info.addon || info.kodiVersion || agent.startsWith('Python-urllib/')) {
		info.kind = 'kodi';
	} else if (agent.startsWith('Mozilla/')) {
		info.kind = 'browser';
	}
	return info;
}

/**
 * Usage summaries from the old sign-in server (drive-login), sent with the shared USAGE_REPORT_TOKEN.
 * Body: {"events": [{event, provider, app, outcome, error, addon, addon_version, common_version, count}]}.
 */
export async function ingest(env: Env, request: Request): Promise<Response> {
	if (!env.USAGE_REPORT_TOKEN || !(await sameSecret(request.headers.get('Authorization') ?? '', `Bearer ${env.USAGE_REPORT_TOKEN}`))) {
		return new Response('Unauthorized', { status: 401 });
	}
	let body: { events?: unknown };
	try {
		body = (await request.json()) as { events?: unknown };
	} catch {
		return new Response('Invalid JSON', { status: 400 });
	}
	const events = Array.isArray(body.events) ? body.events : null;
	if (!events || events.length === 0 || events.length > MAX_POINTS_PER_REQUEST) {
		return new Response(`Expected 1 to ${MAX_POINTS_PER_REQUEST} events`, { status: 400 });
	}
	let written = 0;
	for (const raw of events) {
		const e = (raw ?? {}) as Record<string, unknown>;
		const text = (name: string, max = 64) => (typeof e[name] === 'string' ? clip(e[name] as string, max) : '');
		const count = typeof e.count === 'number' && Number.isFinite(e.count) && e.count > 0 ? e.count : 0;
		if (!text('event') || !text('outcome') || !count) {
			continue;
		}
		const addon = text('addon', 40);
		record(env, {
			event: text('event'),
			provider: text('provider'),
			app: text('app'),
			outcome: text('outcome'),
			error: text('error'),
			source: 'heroku',
			client: addon
				? { kind: 'kodi', addon, addonVersion: text('addon_version', 20), commonVersion: text('common_version', 20), kodiVersion: '', pythonVersion: '' }
				: undefined,
			count,
		});
		written++;
	}
	return Response.json({ written });
}

async function sameSecret(a: string, b: string): Promise<boolean> {
	// Compares digests, so the time taken doesn't depend on where the strings differ.
	const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
	const [x, y] = await Promise.all([digest(a), digest(b)]);
	return x.every((byte, i) => byte === y[i]);
}

function clip(text: string, max = 200): string {
	return text.length > max ? text.slice(0, max) : text;
}
