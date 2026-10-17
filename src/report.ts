// The usage report: queries the Analytics Engine dataset written by src/usage.ts and shapes the results for the
// /usage page (src/dashboard.ts) and scripts/usage-report.mjs. No imports, so Node can load it directly.
// Counts are sampling-aware: SUM(_sample_interval * double1).

export type Row = Record<string, string | number>;
/** Runs one Analytics Engine SQL query (without FORMAT) and returns its rows. */
export type Query = (sql: string) => Promise<Row[]>;

export interface Series {
	name: string;
	values: number[];
}

export interface DailyChart {
	title: string;
	description: string;
	form: 'stacked' | 'line';
	series: Series[];
}

export interface Table {
	title: string;
	description?: string;
	columns: string[];
	rows: (string | number)[][];
}

export interface Tile {
	label: string;
	value: string;
	detail: string;
}

export interface Report {
	days: string[];
	/** The day the tables are for, or null for the whole period. */
	day: string | null;
	tiles: Tile[];
	charts: DailyChart[];
	tables: Table[];
}

export const PERIODS = [7, 30, 90];

const COUNT = 'SUM(_sample_interval * double1)';
const DAY = "formatDateTime(timestamp, '%Y-%m-%d')";

/** The last `period` UTC days, oldest first, ending today. */
export function dayList(period: number, now = new Date()): string[] {
	const days: string[] = [];
	for (let i = period - 1; i >= 0; i--) {
		days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
	}
	return days;
}

/**
 * The charts and tiles cover the whole period; the tables cover `day` when it is one of the period's days (only those
 * reach the SQL), or else the whole period.
 */
export async function loadReport(query: Query, period: number, now = new Date(), day: string | null = null): Promise<Report> {
	const days = dayList(period, now);
	const since = `timestamp >= toDateTime('${days[0]} 00:00:00')`;
	const selected = day && days.includes(day) ? day : null;
	const range = selected ? `timestamp >= toDateTime('${selected} 00:00:00') AND timestamp < toDateTime('${nextDay(selected)} 00:00:00')` : since;
	const index = new Map(days.map((d, i) => [d, i]));
	const daily = (names: string[], rows: Row[], seriesOf: (row: Row) => string | null): Series[] => {
		const series = names.map((name) => ({ name, values: days.map(() => 0) }));
		for (const row of rows) {
			const s = series.find((x) => x.name === seriesOf(row));
			const i = index.get(String(row.day));
			if (s && i !== undefined) {
				s.values[i] = (s.values[i] ?? 0) + Number(row.n);
			}
		}
		return series;
	};
	const [active, funnel, refreshes, byProvider, failures, signinProblems, versions, countries, reports, limits] = await Promise.all([
		query(
			`SELECT ${DAY} AS day, blob6 AS source, blob2 AS provider, blob3 AS app, ${COUNT} AS n FROM signin_usage
			 WHERE ${since} AND blob1 = 'active_account' GROUP BY day, source, provider, app`,
		),
		query(
			`SELECT ${DAY} AS day, blob1 AS event, blob4 AS outcome, ${COUNT} AS n FROM signin_usage
			 WHERE ${since} AND blob1 IN ('pin', 'signin', 'collect') GROUP BY day, event, outcome`,
		),
		query(
			`SELECT ${DAY} AS day, blob4 AS outcome, ${COUNT} AS n FROM signin_usage
			 WHERE ${since} AND blob1 = 'refresh' GROUP BY day, outcome`,
		),
		query(
			`SELECT blob2 AS provider, blob1 AS event, blob4 AS outcome, ${COUNT} AS n FROM signin_usage
			 WHERE ${range} AND blob1 IN ('pin', 'signin', 'collect') AND blob2 != '' GROUP BY provider, event, outcome ORDER BY provider, event, n DESC`,
		),
		query(
			`SELECT blob6 AS source, blob2 AS provider, blob3 AS app, blob5 AS error, ${COUNT} AS n FROM signin_usage
			 WHERE ${range} AND blob1 = 'refresh' AND blob4 = 'failed' GROUP BY source, provider, app, error ORDER BY n DESC LIMIT 200`,
		),
		query(
			`SELECT blob1 AS event, blob4 AS outcome, blob5 AS error, ${COUNT} AS n FROM signin_usage
			 WHERE ${range} AND blob1 IN ('signin', 'signin_start', 'collect') AND blob4 NOT IN ('completed', 'redirected', 'delivered')
			 GROUP BY event, outcome, error ORDER BY n DESC LIMIT 200`,
		),
		query(
			`SELECT blob6 AS source, blob9 AS addon, blob10 AS version, blob11 AS common, blob12 AS kodi, ${COUNT} AS n FROM signin_usage
			 WHERE ${range} AND blob8 = 'kodi' AND blob1 IN ('refresh', 'pin') GROUP BY source, addon, version, common, kodi ORDER BY n DESC LIMIT 200`,
		),
		query(
			`SELECT blob7 AS country, ${COUNT} AS n FROM signin_usage
			 WHERE ${range} AND blob8 = 'kodi' AND blob7 != '' GROUP BY country ORDER BY n DESC LIMIT 300`,
		),
		query(
			`SELECT ${DAY} AS day, ${COUNT} AS n FROM signin_usage WHERE ${range} AND blob1 = 'error_report' GROUP BY day ORDER BY day DESC`,
		),
		query(`SELECT blob5 AS name, ${COUNT} AS n FROM signin_usage WHERE ${range} AND blob1 = 'rate_limited' GROUP BY name ORDER BY n DESC`),
	]);

	// Fixed order: it is the order of the chart colors.
	const ACTIVE = ['Google Drive, old app', 'Google Drive, new app', 'OneDrive', 'Dropbox', 'Old server (Heroku)'];
	const activeSeries = daily(ACTIVE, active, (r) => {
		if (r.source === 'heroku') {
			return ACTIVE[4] ?? null;
		}
		if (r.provider === 'googledrive') {
			return r.app === 'legacy' ? (ACTIVE[0] ?? null) : (ACTIVE[1] ?? null);
		}
		return r.provider === 'onedrive' ? (ACTIVE[2] ?? null) : r.provider === 'dropbox' ? (ACTIVE[3] ?? null) : null;
	});
	const SIGNIN = ['Codes created', 'Sign-ins completed'];
	const signinSeries = daily(SIGNIN, funnel, (r) =>
		r.event === 'pin' && r.outcome === 'created' ? (SIGNIN[0] ?? null) : r.event === 'signin' && r.outcome === 'completed' ? (SIGNIN[1] ?? null) : null,
	);
	const REFRESH = ['Succeeded', 'Failed'];
	const refreshSeries = daily(REFRESH, refreshes, (r) => (r.outcome === 'ok' ? (REFRESH[0] ?? null) : r.outcome === 'failed' ? (REFRESH[1] ?? null) : null));

	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
	const total = (series: Series[], i: number) => sum(series.map((s) => s.values[i] ?? 0));
	const last = days.length - 1;
	const codes = sum(signinSeries[0]?.values ?? []);
	const completed = sum(signinSeries[1]?.values ?? []);
	const refreshOk = sum(refreshSeries[0]?.values ?? []);
	const refreshFailed = sum(refreshSeries[1]?.values ?? []);
	const lastDays = `last ${days.length} days`;
	const tiles: Tile[] = [
		{ label: 'Active accounts', value: format(total(activeSeries, last)), detail: `today so far (UTC), both servers` },
		{ label: 'Sign-ins completed', value: format(completed), detail: `${lastDays}, of ${format(codes)} codes created` },
		{ label: 'Sign-in completion', value: percent(completed, codes), detail: `completed ÷ codes created, ${lastDays}` },
		{ label: 'Refresh failures', value: percent(refreshFailed, refreshOk + refreshFailed), detail: `${format(refreshFailed)} of ${format(refreshOk + refreshFailed)}, ${lastDays}` },
	];

	const n = (row: Row) => Math.round(Number(row.n));
	const text = (value: unknown) => (value === '' || value === undefined ? '–' : String(value));
	const tables: Table[] = [
		{
			title: 'Sign-ins by provider',
			columns: ['Provider', 'Step', 'Outcome', 'Count'],
			rows: byProvider.map((r) => [text(r.provider), text(r.event), text(r.outcome), n(r)]),
		},
		{
			title: 'Sign-in problems',
			description: 'Codes that were wrong or expired, sign-ins denied or failed at the provider, and codes Kodi gave up on.',
			columns: ['Step', 'Outcome', 'Error', 'Count'],
			rows: signinProblems.map((r) => [text(r.event), text(r.outcome), text(r.error), n(r)]),
		},
		{
			title: 'Refresh failures',
			description: 'invalid_grant: access revoked or token expired; the user has to sign in again.',
			columns: ['Server', 'Provider', 'App', 'Error', 'Count'],
			rows: failures.map((r) => [text(r.source), text(r.provider), text(r.app), text(r.error), n(r)]),
		},
		{
			title: 'Add-on versions',
			description: 'Refreshes and codes created, by the versions Kodi reports. Kodi versions are sent from clouddrive.common 1.5.5.',
			columns: ['Server', 'Add-on', 'Version', 'Common', 'Kodi', 'Requests'],
			rows: versions.map((r) => [text(r.source), text(r.addon), text(r.version), text(r.common), text(r.kodi), n(r)]),
		},
		{
			title: 'Countries',
			description: 'Requests from Kodi, by the country Cloudflare reports. The old server sends no countries.',
			columns: ['Country', 'Requests'],
			rows: countries.map((r) => [countryName(String(r.country)), n(r)]),
		},
		{
			title: 'Ignored error reports (old server)',
			description: 'Older add-ons post error reports that are not accepted. Many in a day usually means one installation stuck in a loop.',
			columns: ['Day', 'Reports'],
			rows: reports.map((r) => [text(r.day), n(r)]),
		},
		{
			title: 'Rate limits hit',
			columns: ['Limit', 'Requests'],
			rows: limits.map((r) => [text(r.name), n(r)]),
		},
	];

	return {
		days,
		day: selected,
		tiles,
		charts: [
			{
				title: 'Active accounts per day',
				description: 'Accounts that refreshed a token at least once that day. Days with a deploy or restart count some accounts twice.',
				form: 'stacked',
				series: activeSeries,
			},
			{
				title: 'Sign-ins per day',
				description: 'Codes created in Kodi, and sign-ins completed in the browser. Both servers.',
				form: 'line',
				series: signinSeries,
			},
			{
				title: 'Token refreshes per day',
				description: 'Both servers.',
				form: 'stacked',
				series: refreshSeries,
			},
		],
		tables,
	};
}

// Cloudflare's own codes, besides ISO 3166 countries.
const SPECIAL_COUNTRIES: Record<string, string> = { T1: 'Tor network', XX: 'Unknown' };
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** The English name of a country code from Cloudflare, or the code itself when it has none. */
export function countryName(code: string): string {
	if (SPECIAL_COUNTRIES[code]) {
		return SPECIAL_COUNTRIES[code];
	}
	try {
		const name = regionNames.of(code);
		return name && name !== code ? name : code;
	} catch {
		return code;
	}
}

function nextDay(day: string): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function format(value: number): string {
	return Math.round(value).toLocaleString('en-US');
}

function percent(part: number, whole: number): string {
	return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–';
}

/** Runs queries against the Analytics Engine SQL API. */
export function sqlApi(accountId: string, token: string): Query {
	return async (sql) => {
		const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: `${sql} FORMAT JSON`,
		});
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`Analytics Engine query failed: ${response.status} ${text.slice(0, 300)}`);
		}
		return ((JSON.parse(text) as { data?: Row[] }).data ?? []) as Row[];
	};
}
