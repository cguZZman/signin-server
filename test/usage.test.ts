import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGNIN_COOKIE } from '../src/app';
import { SigninState } from '../src/state';
import { BLOBS, clientInfo } from '../src/usage';
import { basic, cookieValue, MockTokenEndpoint, Server, testEnv } from './helpers';

/** Stands in for the Analytics Engine dataset: keeps the data points as objects keyed by column name. */
class MockDataset {
	points: Record<string, string | number>[] = [];

	writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void {
		const row: Record<string, string | number> = Object.fromEntries(BLOBS.map((name, i) => [name, point.blobs?.[i] ?? '']));
		row.count = point.doubles?.[0] ?? 0;
		this.points.push(row);
	}

	events(event: string): Record<string, string | number>[] {
		return this.points.filter((p) => p.event === event);
	}
}

const KODI_AGENT = 'plugin.googledrive/1.6.3 clouddrive.common/1.5.5 Kodi/21.2 Python/3.11';
let dataset: MockDataset;
let server: Server;

beforeEach(() => {
	new MockTokenEndpoint().install();
	dataset = new MockDataset();
	server = new Server(
		testEnv({
			USAGE: dataset as unknown as AnalyticsEngineDataset,
			USAGE_REPORT_TOKEN: 'report-token',
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('usage events', () => {
	it('follow a sign-in, without IP addresses or tokens', async () => {
		const kodi = { headers: { 'User-Agent': KODI_AGENT } };
		const { pin, password } = (await (await server.post('/pin', { provider: 'googledrive' }, kodi)).json()) as { pin: string; password: string };
		expect((await server.get(`/pin/${pin}`, { headers: { ...basic(password), ...kodi.headers } })).status).toBe(202);
		const signin = await server.get(`/signin/${pin}`, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' } });
		const browser = cookieValue(signin.headers.get('Set-Cookie') ?? '');
		await server.get(`/callback?code=good-code&state=${pin}`, { headers: { Cookie: `${SIGNIN_COOKIE}=${browser}` } });
		expect((await server.get(`/pin/${pin}`, { headers: { ...basic(password), ...kodi.headers } })).status).toBe(200);
		await server.get('/signin/ABCDEF');

		expect(dataset.events('pin')).toEqual([
			expect.objectContaining({ provider: 'googledrive', outcome: 'created', client: 'kodi', addon: 'plugin.googledrive', addon_version: '1.6.3', common_version: '1.5.5', kodi_version: '21.2', source: 'worker' }),
		]);
		expect(dataset.events('signin_start').map((p) => [p.provider, p.outcome, p.client])).toEqual([
			['googledrive', 'redirected', 'browser'],
			['', 'invalid_code', 'other'],
		]);
		expect(dataset.events('signin')).toEqual([expect.objectContaining({ provider: 'googledrive', outcome: 'completed' })]);
		// The "still waiting" answer isn't recorded, the delivery is.
		expect(dataset.events('collect').map((p) => p.outcome)).toEqual(['delivered']);
		const everything = JSON.stringify(dataset.points);
		for (const secret of ['203.0.113.10', password, pin, 'good-code', 'AT', 'RT']) {
			expect(everything).not.toContain(`"${secret}"`);
		}
		expect(everything).not.toContain(password);
	});

	it('record sign-in failures', async () => {
		await server.get('/callback?error=access_denied&state=ABCDEF');
		await server.get('/callback?error=invalid_scope&state=ABCDEF');
		await server.get('/callback?state=ABCDEF');
		await server.get('/callback?code=c&state=ABCDEF');
		expect(dataset.events('signin').map((p) => [p.outcome, p.error])).toEqual([
			['denied', 'access_denied'],
			['provider_error', 'invalid_scope'],
			['missing_code', ''],
			['expired', ''],
		]);
	});

	it('record refreshes with the app that answered, and each active account once a day', async () => {
		await server.post('/refresh', { provider: 'onedrive', refresh_token: 'current-token' });
		await server.post('/refresh', { provider: 'onedrive', refresh_token: 'current-token' });
		await server.post('/refresh', { provider: 'googledrive', refresh_token: 'current-token' });
		await server.post('/refresh', { provider: 'onedrive', refresh_token: 'legacy-token' });
		await server.post('/refresh', { provider: 'onedrive', refresh_token: 'bad-token' });
		expect(dataset.events('refresh').map((p) => [p.provider, p.app, p.outcome, p.error])).toEqual([
			['onedrive', 'current', 'ok', ''],
			['onedrive', 'current', 'ok', ''],
			['googledrive', 'current', 'ok', ''],
			['onedrive', 'legacy', 'ok', ''],
			['onedrive', '', 'failed', 'invalid_grant'],
		]);
		expect(dataset.events('active_account').map((p) => [p.provider, p.app, p.count])).toEqual([
			['onedrive', 'current', 1],
			['googledrive', 'current', 1],
			['onedrive', 'legacy', 1],
		]);
		expect(JSON.stringify(dataset.points)).not.toContain('token');
	});

	it('record rate limits', async () => {
		server = new Server(testEnv({ USAGE: dataset as unknown as AnalyticsEngineDataset, RATE_LIMIT_PIN: '1' }));
		await server.post('/pin', { provider: 'dropbox' });
		expect((await server.post('/pin', { provider: 'dropbox' })).status).toBe(429);
		expect(dataset.events('rate_limited')).toEqual([expect.objectContaining({ outcome: 'rejected', error: 'pin' })]);
	});

	it('are not recorded without the dataset', async () => {
		server = new Server();
		expect((await server.post('/refresh', { provider: 'onedrive', refresh_token: 'current-token' })).status).toBe(200);
	});
});

describe('active accounts', () => {
	it('are new once per UTC day', () => {
		let now = Date.parse('2026-10-12T00:01:00Z');
		const state = new SigninState(() => now);
		expect(state.firstToday('googledrive:a')).toBe(true);
		expect(state.firstToday('googledrive:a')).toBe(false);
		expect(state.firstToday('googledrive:b')).toBe(true);
		now = Date.parse('2026-10-12T23:59:00Z');
		expect(state.firstToday('googledrive:a')).toBe(false);
		now = Date.parse('2026-10-13T00:00:00Z');
		expect(state.firstToday('googledrive:a')).toBe(true);
	});
});

describe('client info', () => {
	it('reads the add-on User-Agent', () => {
		expect(clientInfo(KODI_AGENT)).toEqual({ kind: 'kodi', addon: 'plugin.googledrive', addonVersion: '1.6.3', commonVersion: '1.5.5', kodiVersion: '21.2', pythonVersion: '3.11' });
		expect(clientInfo('Python-urllib/3.8')).toMatchObject({ kind: 'kodi', addon: '', pythonVersion: '3.8' });
		expect(clientInfo('Python-urllib/3.8', 'plugin.onedrive 2.4.2/1.5.2')).toEqual({ kind: 'kodi', addon: 'plugin.onedrive', addonVersion: '2.4.2', commonVersion: '1.5.2', kodiVersion: '', pythonVersion: '3.8' });
		expect(clientInfo(KODI_AGENT, 'plugin.googledrive 1.6.3/1.5.5')).toEqual(clientInfo(KODI_AGENT));
		expect(clientInfo('Python-urllib/3.8', 'not a version')).toMatchObject({ addon: '' });
		expect(clientInfo('Mozilla/5.0 (iPhone)').kind).toBe('browser');
		expect(clientInfo(null).kind).toBe('other');
		expect(clientInfo(`plugin.${'x'.repeat(100)}/1`).addon.length).toBe(40);
	});
});

describe('drive-login summaries', () => {
	const report = (body: unknown, token = 'report-token') =>
		server.request('/usage/report', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

	it('are written with source heroku', async () => {
		const response = await report({
			events: [
				{ event: 'active_account', provider: 'googledrive', outcome: 'ok', count: 3 },
				{ event: 'refresh', provider: 'googledrive', outcome: 'failed', error: 'invalid_grant', addon: 'plugin.googledrive', addon_version: '1.5.6', common_version: '1.4.0', count: 120 },
				{ event: 'bogus', count: 1 },
			],
		});
		expect(await response.json()).toEqual({ written: 2 });
		expect(dataset.points).toEqual([
			expect.objectContaining({ event: 'active_account', outcome: 'ok', source: 'heroku', count: 3, country: '', client: '' }),
			expect.objectContaining({ event: 'refresh', outcome: 'failed', error: 'invalid_grant', source: 'heroku', client: 'kodi', addon: 'plugin.googledrive', addon_version: '1.5.6', common_version: '1.4.0', count: 120 }),
		]);
	});

	it('need the token', async () => {
		expect((await report({ events: [{ event: 'refresh', outcome: 'ok', count: 1 }] }, 'wrong')).status).toBe(401);
		server = new Server(testEnv({ USAGE: dataset as unknown as AnalyticsEngineDataset }));
		expect((await report({ events: [{ event: 'refresh', outcome: 'ok', count: 1 }] })).status).toBe(401);
		expect(dataset.points).toEqual([]);
	});

	it('reject bad bodies', async () => {
		expect((await report({ events: [] })).status).toBe(400);
		expect((await report({ events: Array(201).fill({ event: 'refresh', outcome: 'ok', count: 1 }) })).status).toBe(400);
		expect((await server.request('/usage/report', { method: 'POST', headers: { Authorization: 'Bearer report-token' }, body: 'nope' })).status).toBe(400);
	});
});
