// Usage history kept for good. Analytics Engine deletes its data after three months, so an hourly job (index.ts,
// scheduled) copies the counts of each finished UTC day into the Durable Object's SQLite storage, and sign-ins with
// the user's own OAuth app are counted there as they happen, by a keyed one-way hash of the app's client ID: each
// user creates their own app, so its hash counts one user. Only counts and hashes are stored: no tokens, secrets,
// client IDs or IP addresses.
import { dayList, type Query, type Row } from './report';

export type SqlValue = string | number | null;

/** The part of the Durable Object's SqlStorage used here (node:sqlite in tests). One statement per call. */
export interface Sql {
	exec(query: string, ...bindings: SqlValue[]): { toArray(): Record<string, SqlValue | ArrayBuffer>[] };
}

export interface EventCount {
	event: string;
	provider: string;
	app: string;
	outcome: string;
	error: string;
	source: string;
	n: number;
}

export interface VersionCount {
	source: string;
	addon: string;
	version: string;
	common: string;
	kodi: string;
	n: number;
}

export interface CountryCount {
	country: string;
	n: number;
}

/** One UTC day of usage counts, as the /usage report reads them from Analytics Engine. */
export interface DayCounts {
	events: EventCount[];
	versions: VersionCount[];
	countries: CountryCount[];
}

export interface MonthTotals {
	month: string;
	// The day of the month with the most active accounts, and how many.
	activePeak: number;
	codes: number;
	signins: number;
	ownAppSignins: number;
	refreshOk: number;
	refreshFailed: number;
}

export interface OwnAppTotals {
	// Different own apps (users) that signed in, ever, and since the given day.
	users: number;
	newUsers: number;
	signins: number;
	// The first day counted, or null before the first own-app sign-in.
	since: string | null;
}

// Analytics Engine keeps about three months; older days may be partly deleted already.
const WINDOW_DAYS = 88;
// Days are archived again once this long after they end, for counts that arrived late.
const RECHECK_MS = 6 * 60 * 60 * 1000;
// Days archived per run at most, so a run stays short (the first run catches up on the whole window).
const DAYS_PER_RUN = 10;
const COUNT = 'SUM(_sample_interval * double1)';
const DAY = "formatDateTime(timestamp, '%Y-%m-%d')";

export class UsageArchive {
	private hashKey: Promise<CryptoKey> | null = null;

	constructor(private readonly sql: Sql) {
		for (const statement of [
			'CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)',
			'CREATE TABLE IF NOT EXISTS own_apps (provider TEXT NOT NULL, app TEXT NOT NULL, first_day TEXT NOT NULL, last_day TEXT NOT NULL, signins INTEGER NOT NULL, PRIMARY KEY (provider, app))',
			'CREATE TABLE IF NOT EXISTS archived_days (day TEXT PRIMARY KEY, archived_at INTEGER NOT NULL)',
			'CREATE TABLE IF NOT EXISTS daily_events (day TEXT NOT NULL, event TEXT NOT NULL, provider TEXT NOT NULL, app TEXT NOT NULL, outcome TEXT NOT NULL, error TEXT NOT NULL, source TEXT NOT NULL, n REAL NOT NULL)',
			'CREATE INDEX IF NOT EXISTS daily_events_day ON daily_events (day)',
			'CREATE TABLE IF NOT EXISTS daily_versions (day TEXT NOT NULL, source TEXT NOT NULL, addon TEXT NOT NULL, version TEXT NOT NULL, common TEXT NOT NULL, kodi TEXT NOT NULL, n REAL NOT NULL)',
			'CREATE INDEX IF NOT EXISTS daily_versions_day ON daily_versions (day)',
			'CREATE TABLE IF NOT EXISTS daily_countries (day TEXT NOT NULL, country TEXT NOT NULL, n REAL NOT NULL)',
			'CREATE INDEX IF NOT EXISTS daily_countries_day ON daily_countries (day)',
		]) {
			this.sql.exec(statement);
		}
	}

	/** Counts a completed sign-in with the user's own OAuth app of the provider, on the UTC day. */
	async countOwnApp(provider: string, clientId: string, day: string): Promise<void> {
		const app = await this.hash(`${provider}:${clientId}`);
		this.sql.exec(
			`INSERT INTO own_apps (provider, app, first_day, last_day, signins) VALUES (?, ?, ?, ?, 1)
			 ON CONFLICT (provider, app) DO UPDATE SET last_day = excluded.last_day, signins = signins + 1`,
			provider,
			app,
			day,
			day,
		);
	}

	ownApps(since: string): OwnAppTotals {
		const row = this.sql
			.exec(
				'SELECT COUNT(*) AS users, COALESCE(SUM(first_day >= ?), 0) AS new_users, COALESCE(SUM(signins), 0) AS signins, MIN(first_day) AS since FROM own_apps',
				since,
			)
			.toArray()[0];
		return {
			users: Number(row?.users ?? 0),
			newUsers: Number(row?.new_users ?? 0),
			signins: Number(row?.signins ?? 0),
			since: typeof row?.since === 'string' ? row.since : null,
		};
	}

	/** Replaces the day's counts. The statements run in one Durable Object call without awaits, so they apply together. */
	saveDay(day: string, counts: DayCounts, archivedAt: number): void {
		for (const table of ['daily_events', 'daily_versions', 'daily_countries']) {
			this.sql.exec(`DELETE FROM ${table} WHERE day = ?`, day);
		}
		for (const e of counts.events) {
			this.sql.exec('INSERT INTO daily_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)', day, e.event, e.provider, e.app, e.outcome, e.error, e.source, e.n);
		}
		for (const v of counts.versions) {
			this.sql.exec('INSERT INTO daily_versions VALUES (?, ?, ?, ?, ?, ?, ?)', day, v.source, v.addon, v.version, v.common, v.kodi, v.n);
		}
		for (const c of counts.countries) {
			this.sql.exec('INSERT INTO daily_countries VALUES (?, ?, ?)', day, c.country, c.n);
		}
		this.sql.exec(
			'INSERT INTO archived_days (day, archived_at) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET archived_at = excluded.archived_at',
			day,
			archivedAt,
		);
	}

	/** When each archived day was archived (milliseconds since the epoch). */
	archivedDays(): Record<string, number> {
		return Object.fromEntries(this.sql.exec('SELECT day, archived_at FROM archived_days').toArray().map((r) => [String(r.day), Number(r.archived_at)]));
	}

	/** Totals per month of the archived days, newest first. */
	history(): MonthTotals[] {
		const months = this.sql
			.exec(
				`SELECT substr(day, 1, 7) AS month,
					SUM(CASE WHEN event = 'pin' AND outcome = 'created' THEN n ELSE 0 END) AS codes,
					SUM(CASE WHEN event = 'signin' AND outcome = 'completed' THEN n ELSE 0 END) AS signins,
					SUM(CASE WHEN event = 'signin' AND outcome = 'completed' AND app = 'own' THEN n ELSE 0 END) AS own,
					SUM(CASE WHEN event = 'refresh' AND outcome = 'ok' THEN n ELSE 0 END) AS refresh_ok,
					SUM(CASE WHEN event = 'refresh' AND outcome = 'failed' THEN n ELSE 0 END) AS refresh_failed
				 FROM daily_events GROUP BY month ORDER BY month DESC`,
			)
			.toArray();
		const peaks = new Map<string, number>();
		for (const r of this.sql.exec("SELECT day, SUM(n) AS n FROM daily_events WHERE event = 'active_account' GROUP BY day").toArray()) {
			const month = String(r.day).slice(0, 7);
			peaks.set(month, Math.max(peaks.get(month) ?? 0, Number(r.n)));
		}
		return months.map((r) => ({
			month: String(r.month),
			activePeak: peaks.get(String(r.month)) ?? 0,
			codes: Number(r.codes),
			signins: Number(r.signins),
			ownAppSignins: Number(r.own),
			refreshOk: Number(r.refresh_ok),
			refreshFailed: Number(r.refresh_failed),
		}));
	}

	/**
	 * HMAC-SHA256 with a random key made on first use and kept only in this storage: a client ID can't be checked
	 * against the stored hashes without it.
	 */
	private async hash(value: string): Promise<string> {
		this.hashKey ??= this.loadHashKey();
		const mac = await crypto.subtle.sign('HMAC', await this.hashKey, new TextEncoder().encode(value));
		return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
	}

	private loadHashKey(): Promise<CryptoKey> {
		let stored = this.sql.exec("SELECT value FROM meta WHERE name = 'own_app_hash_key'").toArray()[0]?.value;
		if (typeof stored !== 'string') {
			stored = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
			this.sql.exec("INSERT INTO meta (name, value) VALUES ('own_app_hash_key', ?)", stored);
		}
		const bytes = new Uint8Array(stored.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
		return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	}
}

/** UsageArchive's methods, called on the Durable Object in production or directly in tests. */
export type Archive = {
	[K in 'countOwnApp' | 'ownApps' | 'saveDay' | 'archivedDays' | 'history']: (
		...args: Parameters<UsageArchive[K]>
	) => Promise<Awaited<ReturnType<UsageArchive[K]>>> | ReturnType<UsageArchive[K]>;
};

/**
 * Copies finished days from Analytics Engine into the archive: days not archived yet, oldest first, and each day once
 * more RECHECK_MS after it ended. Returns the days archived.
 */
export async function archiveUsage(query: Query, archive: Archive, now = new Date()): Promise<string[]> {
	const archived = await archive.archivedDays();
	const due = dayList(WINDOW_DAYS + 1, now)
		.slice(0, -1)
		.filter((day) => {
			const recheck = Date.parse(`${day}T00:00:00Z`) + 86_400_000 + RECHECK_MS;
			const at = archived[day];
			return at === undefined || (at < recheck && now.getTime() >= recheck);
		})
		.slice(0, DAYS_PER_RUN);
	if (!due.length) {
		return [];
	}
	const first = due[0] ?? '';
	const end = new Date(Date.parse(`${due.at(-1)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
	const where = `timestamp >= toDateTime('${first} 00:00:00') AND timestamp < toDateTime('${end} 00:00:00') AND ${DAY} IN (${due.map((d) => `'${d}'`).join(', ')})`;
	const [events, versions, countries] = await Promise.all([
		query(
			`SELECT ${DAY} AS day, blob1 AS event, blob2 AS provider, blob3 AS app, blob4 AS outcome, blob5 AS error, blob6 AS source, ${COUNT} AS n
			 FROM signin_usage WHERE ${where} GROUP BY day, event, provider, app, outcome, error, source LIMIT 100000`,
		),
		query(
			`SELECT ${DAY} AS day, blob6 AS source, blob9 AS addon, blob10 AS version, blob11 AS common, blob12 AS kodi, ${COUNT} AS n
			 FROM signin_usage WHERE ${where} AND blob8 = 'kodi' AND blob1 IN ('refresh', 'pin') GROUP BY day, source, addon, version, common, kodi LIMIT 100000`,
		),
		query(
			`SELECT ${DAY} AS day, blob7 AS country, ${COUNT} AS n
			 FROM signin_usage WHERE ${where} AND blob8 = 'kodi' AND blob7 != '' GROUP BY day, country LIMIT 100000`,
		),
	]);
	const of = (rows: Row[], day: string) => rows.filter((r) => r.day === day);
	const text = (value: unknown) => String(value ?? '');
	for (const day of due) {
		await archive.saveDay(
			day,
			{
				events: of(events, day).map((r) => ({
					event: text(r.event),
					provider: text(r.provider),
					app: text(r.app),
					outcome: text(r.outcome),
					error: text(r.error),
					source: text(r.source),
					n: Number(r.n),
				})),
				versions: of(versions, day).map((r) => ({
					source: text(r.source),
					addon: text(r.addon),
					version: text(r.version),
					common: text(r.common),
					kodi: text(r.kodi),
					n: Number(r.n),
				})),
				countries: of(countries, day).map((r) => ({ country: text(r.country), n: Number(r.n) })),
			},
			now.getTime(),
		);
	}
	return due;
}
