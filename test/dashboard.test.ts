import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessKeys } from '../src/access';
import { scale } from '../src/dashboard';
import { countryName, dayList, loadReport, type Row } from '../src/report';
import { Server, testEnv } from './helpers';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'audience-tag';
const NOW = new Date('2026-10-14T12:00:00Z');

let keys: CryptoKeyPair;
let queries: string[];

/** Canned Analytics Engine answers, picked by what the query asks for. */
function answer(sql: string): Row[] {
	if (sql.includes("blob1 = 'active_account'")) {
		return [
			{ day: '2026-10-14', source: 'worker', provider: 'googledrive', app: 'legacy', n: 40 },
			{ day: '2026-10-14', source: 'worker', provider: 'googledrive', app: 'current', n: 3 },
			{ day: '2026-10-13', source: 'worker', provider: 'onedrive', app: 'current', n: 20 },
			{ day: '2026-10-14', source: 'heroku', provider: 'googledrive', app: 'current', n: 14 },
			{ day: '2026-09-01', source: 'worker', provider: 'dropbox', app: 'current', n: 99 },
		];
	}
	if (sql.includes("blob1 IN ('pin', 'signin', 'collect') GROUP BY day")) {
		return [
			{ day: '2026-10-14', event: 'pin', outcome: 'created', n: 10 },
			{ day: '2026-10-14', event: 'signin', outcome: 'completed', n: 4 },
		];
	}
	if (sql.includes("blob1 = 'refresh' GROUP BY day")) {
		return [
			{ day: '2026-10-14', outcome: 'ok', n: 75 },
			{ day: '2026-10-14', outcome: 'failed', n: 25 },
		];
	}
	if (sql.includes('blob7 AS country')) {
		return [
			{ day: '2026-10-14', country: 'IL', n: 9 },
			{ day: '2026-10-13', country: '<script>', n: 3 },
		];
	}
	return [];
}

async function jwt(payload: Record<string, unknown>, kid = 'key-1'): Promise<string> {
	const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	const signed = `${encode({ alg: 'RS256', kid })}.${encode(payload)}`;
	const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(signed)));
	return `${signed}.${btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
	return { aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: 'owner@example.com', ...overrides };
}

let server: Server;

beforeEach(async () => {
	clearAccessKeys();
	queries = [];
	keys = (await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify'],
	)) as CryptoKeyPair;
	const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'key-1' };
	vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
		if (String(url) === `https://${TEAM}/cdn-cgi/access/certs`) {
			return Response.json({ keys: [jwk] });
		}
		if (String(url).endsWith('/accounts/account-id/analytics_engine/sql')) {
			expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer api-token');
			const sql = String(init?.body);
			queries.push(sql);
			return Response.json({ data: answer(sql) });
		}
		throw new Error(`Unexpected request to ${String(url)}`);
	});
	server = new Server(testEnv({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ANALYTICS_ACCOUNT_ID: 'account-id', USAGE_API_TOKEN: 'api-token' }));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const asUser = async (claims = validClaims(), kid?: string) => ({ headers: { 'Cf-Access-Jwt-Assertion': await jwt(claims, kid) } });

describe('/usage', () => {
	it('is not there until Access and the API token are configured', async () => {
		server = new Server(testEnv());
		expect((await server.get('/usage', await asUser())).status).toBe(404);
		server = new Server(testEnv({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ANALYTICS_ACCOUNT_ID: 'account-id' }));
		expect((await server.get('/usage', await asUser())).status).toBe(404);
	});

	it('needs a valid Access login', async () => {
		expect((await server.get('/usage')).status).toBe(403);
		expect((await server.get('/usage', { headers: { 'Cf-Access-Jwt-Assertion': 'not.a.token' } })).status).toBe(403);
		expect((await server.get('/usage', await asUser(validClaims({ aud: ['another-app'] })))).status).toBe(403);
		expect((await server.get('/usage', await asUser(validClaims({ iss: 'https://other.cloudflareaccess.com' })))).status).toBe(403);
		expect((await server.get('/usage', await asUser(validClaims({ exp: Math.floor(Date.now() / 1000) - 1 })))).status).toBe(403);
		expect((await server.get('/usage', await asUser(validClaims(), 'unknown-key'))).status).toBe(403);
		const forged = (await jwt(validClaims())).split('.');
		forged[1] = btoa(JSON.stringify(validClaims({ email: 'attacker@example.com' }))).replace(/=+$/, '');
		expect((await server.get('/usage', { headers: { 'Cf-Access-Jwt-Assertion': forged.join('.') } })).status).toBe(403);
		expect(queries).toEqual([]);
	});

	it('shows the report to the signed-in user', async () => {
		const response = await server.get('/usage?days=30', await asUser());
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
		expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
		const page = await response.text();
		expect(page).toContain('Signed in as owner@example.com');
		expect(page).toContain('<a href="/usage?days=30" aria-current="page">30 days</a>');
		expect(page).toContain('Active accounts per day');
		expect(page).toContain('Google Drive, old app');
		expect(page, 'completion tile').toContain('40%');
		expect(page, 'refresh failure tile').toContain('25%');
		expect(page, 'country names are escaped').toContain('&lt;script&gt;');
		expect(page).not.toContain('<script>"');
		expect(page.match(/class="hit"/g)?.length, 'one hover target per day and chart').toBe(30 * 3);
		expect(queries.every((q) => q.includes("timestamp >= toDateTime('") && q.endsWith('FORMAT JSON'))).toBe(true);
	});

	it('falls back to 7 days for other periods', async () => {
		const page = await (await server.get('/usage?days=365', await asUser())).text();
		expect(page).toContain('<a href="/usage?days=7" aria-current="page">7 days</a>');
	});

	it('says when Analytics Engine fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal('fetch', async (url: string | URL) =>
			String(url).includes('/certs')
				? Response.json({ keys: [{ ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'key-1' }] })
				: new Response('busy', { status: 503 }),
		);
		const response = await server.get('/usage', await asUser());
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('could not be loaded');
	});
});

describe('report', () => {
	it('fills every day of the period and groups the active accounts', async () => {
		const report = await loadReport(async (sql) => answer(sql), 7, NOW);
		expect(report.days).toEqual(dayList(7, NOW));
		expect(report.days.at(-1)).toBe('2026-10-14');
		const active = report.charts[0];
		expect(active?.series.map((s) => [s.name, s.values.at(-2), s.values.at(-1)])).toEqual([
			['Google Drive, old app', 0, 40],
			['Google Drive, new app', 0, 3],
			['OneDrive', 20, 0],
			['Dropbox', 0, 0],
			['Old server (Heroku)', 0, 14],
		]);
		expect(report.tiles[0]).toMatchObject({ label: 'Active accounts', value: '57' });
	});
});

describe('countries', () => {
	it('show their English names', () => {
		expect(countryName('IL')).toBe('Israel');
		expect(countryName('US')).toBe('United States');
		expect(countryName('T1')).toBe('Tor network');
		expect(countryName('XX')).toBe('Unknown');
		expect(countryName('<script>')).toBe('<script>');
	});

	it('are listed per day, newest first', async () => {
		const report = await loadReport(async (sql) => answer(sql), 7, NOW);
		const countries = report.tables.find((t) => t.title === 'Countries');
		expect(countries?.columns).toEqual(['Day', 'Country', 'Requests']);
		expect(countries?.rows).toEqual([['2026-10-14', 'Israel', 9], ['2026-10-13', '<script>', 3]]);
		expect(report.tables.filter((t) => t.columns[0] !== 'Day').map((t) => t.title)).toEqual([]);
	});
});

describe('queries', () => {
	it('select every column they group by', async () => {
		const sqls: string[] = [];
		await loadReport(async (sql) => {
			sqls.push(sql);
			return [];
		}, 7, NOW);
		for (const sql of sqls) {
			const grouped = (sql.match(/GROUP BY ([\w, ]+?)(?: ORDER BY| LIMIT|$)/) ?? ['', ''])[1].split(',').map((c) => c.trim()).filter(Boolean);
			for (const column of grouped) {
				expect(sql, `${column} in: ${sql.replace(/\s+/g, ' ').slice(0, 80)}`).toMatch(new RegExp(`AS ${column}\\b`));
			}
		}
	});
});

describe('scale', () => {
	it('uses clean ticks', () => {
		expect(scale(0)).toEqual({ max: 1, ticks: [0, 1] });
		expect(scale(57)).toEqual({ max: 60, ticks: [0, 20, 40, 60] });
		expect(scale(100)).toEqual({ max: 100, ticks: [0, 50, 100] });
		expect(scale(2433).ticks.at(-1)).toBeGreaterThanOrEqual(2433);
	});
});
