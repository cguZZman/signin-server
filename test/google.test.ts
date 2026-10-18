import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usagePage } from '../src/dashboard';
import { clearGoogleCaches, driveMetrics } from '../src/google';
import { type DriveCount, loadReport } from '../src/report';

const NOW = new Date('2026-10-14T12:00:00Z');
const PROJECTS = 'old:old-project,new:new-project';
const EMAIL = 'usage-metrics@new-project.iam.gserviceaccount.com';

let keys: CryptoKeyPair;
let keyJson: string;
let tokenRequests: URLSearchParams[];
let monitoringRequests: URL[];

const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
const bytes = (part: string) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Cloud Monitoring's answer for a project: two methods, a few days, split over two pages for the old project. */
function series(project: string, page: string | null) {
	const point = (day: string, n: number) => ({ interval: { startTime: `${day}T00:00:00Z`, endTime: 'x' }, value: { int64Value: String(n) } });
	const one = (method: string, code: string, points: ReturnType<typeof point>[]) => ({
		metric: { labels: { response_code: code } },
		resource: { labels: { method: `google.apps.drive.v3.${method}` } },
		points,
	});
	if (project === 'new-project') {
		return { timeSeries: [one('DriveFiles.Get', '200', [point('2026-10-14', 30), point('2026-10-13', 10)])] };
	}
	return page
		? { timeSeries: [one('DriveFiles.Get', '403', [point('2026-10-13', 4)])] }
		: {
				timeSeries: [one('DriveChanges.List', '200', [point('2026-10-14', 900), point('2026-10-13', 1000), point('2026-09-01', 5)])],
				nextPageToken: 'page-2',
			};
}

beforeEach(async () => {
	clearGoogleCaches();
	tokenRequests = [];
	monitoringRequests = [];
	keys = (await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify'],
	)) as CryptoKeyPair;
	const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', keys.privateKey)) as ArrayBuffer);
	const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
	keyJson = JSON.stringify({ type: 'service_account', client_email: EMAIL, private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' });
	vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		if (url.href === 'https://oauth2.googleapis.com/token') {
			tokenRequests.push(new URLSearchParams(String(init?.body)));
			return Response.json({ access_token: 'google-access', expires_in: 3600 });
		}
		if (url.hostname === 'monitoring.googleapis.com') {
			expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer google-access');
			monitoringRequests.push(url);
			const project = /projects\/([^/]+)\/timeSeries/.exec(url.pathname)?.[1] ?? '';
			return Response.json(series(project, url.searchParams.get('pageToken')));
		}
		throw new Error(`Unexpected request to ${url.href}`);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('driveMetrics', () => {
	it('signs in as the service account with a signed JWT', async () => {
		await driveMetrics(keyJson, PROJECTS, () => NOW.getTime())('2026-10-08', '2026-10-14');
		expect(tokenRequests).toHaveLength(1);
		const form = tokenRequests[0]!;
		expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
		const [header, claims, signature] = (form.get('assertion') ?? '').split('.') as [string, string, string];
		expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
		expect(decode(claims)).toEqual({
			iss: EMAIL,
			scope: 'https://www.googleapis.com/auth/monitoring.read',
			aud: 'https://oauth2.googleapis.com/token',
			iat: NOW.getTime() / 1000,
			exp: NOW.getTime() / 1000 + 3600,
		});
		const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, bytes(signature), new TextEncoder().encode(`${header}.${claims}`));
		expect(valid).toBe(true);
	});

	it('reads daily counts per project, by method and response code, over every page', async () => {
		const counts = await driveMetrics(keyJson, PROJECTS, () => NOW.getTime())('2026-10-08', '2026-10-14');
		expect(counts).toContainEqual({ app: 'old', day: '2026-10-13', method: 'google.apps.drive.v3.DriveFiles.Get', code: '403', n: 4 });
		expect(counts).toContainEqual({ app: 'new', day: '2026-10-14', method: 'google.apps.drive.v3.DriveFiles.Get', code: '200', n: 30 });
		expect(monitoringRequests).toHaveLength(3);
		const first = monitoringRequests[0]!;
		expect(first.searchParams.get('interval.startTime')).toBe('2026-10-08T00:00:00Z');
		expect(first.searchParams.get('interval.endTime'), 'buckets end at midnight UTC').toBe('2026-10-15T00:00:00Z');
		expect(first.searchParams.get('aggregation.alignmentPeriod')).toBe('86400s');
		expect(first.searchParams.getAll('aggregation.groupByFields')).toEqual(['resource.labels.method', 'metric.labels.response_code']);
		expect(first.searchParams.get('filter')).toContain('resource.labels.service="drive.googleapis.com"');
	});

	it('keeps the token and the results for a while', async () => {
		let now = NOW.getTime();
		const metrics = driveMetrics(keyJson, PROJECTS, () => now);
		await metrics('2026-10-08', '2026-10-14');
		await metrics('2026-10-08', '2026-10-14');
		expect(monitoringRequests).toHaveLength(3);
		now += 6 * 60 * 1000;
		await metrics('2026-10-08', '2026-10-14');
		expect(monitoringRequests, 'queried again after 5 minutes').toHaveLength(6);
		expect(tokenRequests, 'same token for an hour').toHaveLength(1);
	});

	it('reports what Google answered when it fails', async () => {
		vi.stubGlobal('fetch', async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
		await expect(driveMetrics(keyJson, PROJECTS)('2026-10-08', '2026-10-14')).rejects.toThrow('Google token request failed: 400 invalid_grant');
		await expect(driveMetrics('not json', PROJECTS)('2026-10-08', '2026-10-14')).rejects.toThrow();
	});
});

describe('report', () => {
	const drive = async (): Promise<DriveCount[]> => [
		{ app: 'old', day: '2026-10-14', method: 'google.apps.drive.v3.DriveChanges.List', code: '200', n: 900 },
		{ app: 'old', day: '2026-10-13', method: 'google.apps.drive.v3.DriveChanges.List', code: '200', n: 1000 },
		{ app: 'old', day: '2026-10-13', method: 'google.apps.drive.v3.DriveFiles.Get', code: '403', n: 4 },
		{ app: 'new', day: '2026-10-14', method: 'google.apps.drive.v3.DriveFiles.Get', code: '302', n: 30 },
		{ app: 'new', day: '2026-10-14', method: 'google.apps.drive.v3.DriveChanges.GetStartPageToken', code: '200', n: 2 },
	];
	const empty = async () => [];

	it('adds a daily chart by app and a table of calls for the period', async () => {
		const report = await loadReport(empty, 7, NOW, null, drive);
		const chart = report.charts.find((c) => c.title === 'Google Drive API requests per day');
		expect(chart?.series.map((s) => [s.name, s.values.at(-2), s.values.at(-1)])).toEqual([
			['Old Google app', 1004, 900],
			['New Google app', 0, 32],
		]);
		const table = report.tables.find((t) => t.title === 'Google Drive API calls');
		expect(table?.rows).toEqual([
			['Old Google app', 'changes.list', '200 OK', 1900],
			['New Google app', 'files.get', '302 redirected', 30],
			['Old Google app', 'files.get', '403 refused', 4],
			['New Google app', 'changes.getStartPageToken', '200 OK', 2],
		]);
	});

	it('narrows the table to the picked day', async () => {
		const report = await loadReport(empty, 7, NOW, '2026-10-13', drive);
		expect(report.tables.find((t) => t.title === 'Google Drive API calls')?.rows).toEqual([
			['Old Google app', 'changes.list', '200 OK', 1000],
			['Old Google app', 'files.get', '403 refused', 4],
		]);
	});

	it('says when Google fails, and keeps the rest of the report', async () => {
		const report = await loadReport(empty, 7, NOW, null, async () => {
			throw new Error('Cloud Monitoring answered 403');
		});
		expect(report.charts.find((c) => c.title === 'Google Drive API requests per day')?.description).toBe(
			"Google's monitoring data could not be loaded: Cloud Monitoring answered 403",
		);
		expect(report.charts).toHaveLength(4);
		expect(report.tiles).toHaveLength(4);
	});

	it('leaves Google out when it is not configured', async () => {
		const report = await loadReport(empty, 7, NOW);
		expect(report.charts.map((c) => c.title)).not.toContain('Google Drive API requests per day');
		expect(report.tables.map((t) => t.title)).not.toContain('Google Drive API calls');
		const page = usagePage(await loadReport(empty, 7, NOW, null, drive), 7, 'owner@example.com');
		expect(page).toContain('Google Drive API requests per day');
		expect(page).toContain('changes.getStartPageToken');
	});
});
