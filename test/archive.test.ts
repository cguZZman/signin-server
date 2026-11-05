import { describe, expect, it } from 'vitest';
import { archiveUsage, UsageArchive } from '../src/archive';
import type { Row } from '../src/report';
import { memorySql } from './helpers';

const OWN_ID = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';

describe('own app users', () => {
	it('counts each app once, by a hash that is not the client ID', async () => {
		const sql = memorySql();
		const archive = new UsageArchive(sql);
		expect(archive.ownApps('2026-11-01')).toEqual({ users: 0, newUsers: 0, signins: 0, since: null });
		await archive.countOwnApp('googledrive', OWN_ID, '2026-10-20');
		await archive.countOwnApp('googledrive', OWN_ID, '2026-11-02');
		await archive.countOwnApp('googledrive', `other-${OWN_ID}`, '2026-11-03');
		expect(archive.ownApps('2026-11-01')).toEqual({ users: 2, newUsers: 1, signins: 3, since: '2026-10-20' });

		const stored = JSON.stringify(sql.exec('SELECT * FROM own_apps').toArray());
		expect(stored).not.toContain('123456789012');
		expect(stored).toMatch(/"app":"[0-9a-f]{64}"/);
	});

	it('keeps its hash key in the storage, so restarts count the same app once', async () => {
		const sql = memorySql();
		await new UsageArchive(sql).countOwnApp('googledrive', OWN_ID, '2026-11-02');
		await new UsageArchive(sql).countOwnApp('googledrive', OWN_ID, '2026-11-03');
		expect(new UsageArchive(sql).ownApps('2026-11-01')).toMatchObject({ users: 1, signins: 2 });
		const other = memorySql();
		await new UsageArchive(other).countOwnApp('googledrive', OWN_ID, '2026-11-02');
		expect(other.exec('SELECT app FROM own_apps').toArray()[0]?.app, 'another server, another key').not.toBe(sql.exec('SELECT app FROM own_apps').toArray()[0]?.app);
	});
});

describe('archiving Analytics Engine', () => {
	const NOW = new Date('2026-11-05T09:15:00Z');

	/** Canned answers for the days the query asks for: two active accounts, a code and a sign-in per day. */
	function analytics(queries: string[]) {
		return async (sql: string): Promise<Row[]> => {
			queries.push(sql);
			// The days listed in "formatDateTime(...) IN (...)".
			const listed = /%d'\) IN \(([^)]*)\)/.exec(sql)?.[1] ?? '';
			const days = [...listed.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1] ?? '');
			if (sql.includes('blob7 AS country')) {
				return days.map((day) => ({ day, country: 'MX', n: 4 }));
			}
			if (sql.includes('blob12 AS kodi')) {
				return days.map((day) => ({ day, source: 'worker', addon: 'plugin.googledrive', version: '1.6.14', common: '1.5.21', kodi: '21.2', n: 5 }));
			}
			return days.flatMap((day) => [
				{ day, event: 'active_account', provider: 'googledrive', app: 'current', outcome: 'ok', error: '', source: 'worker', n: day === '2026-10-20' ? 9 : 2 },
				{ day, event: 'pin', provider: 'googledrive', app: '', outcome: 'created', error: '', source: 'worker', n: 1 },
				{ day, event: 'signin', provider: 'googledrive', app: 'own', outcome: 'completed', error: '', source: 'worker', n: 1 },
				{ day, event: 'refresh', provider: 'googledrive', app: 'legacy', outcome: 'failed', error: 'unauthorized_client', source: 'worker', n: 3 },
			]);
		};
	}

	it('copies finished days, oldest first, a few per run, and each day once more after it ended', async () => {
		const archive = new UsageArchive(memorySql());
		const queries: string[] = [];
		const runs: string[][] = [];
		for (let i = 0; i < 10; i++) {
			runs.push(await archiveUsage(analytics(queries), archive, NOW));
		}
		expect(runs[0]).toHaveLength(10);
		expect(runs[0]?.[0], 'the oldest day Analytics Engine still has in full').toBe('2026-08-09');
		const archived = runs.flat();
		expect(archived).toHaveLength(88);
		expect(archived.at(-1), 'not today').toBe('2026-11-04');
		expect(new Set(archived).size, 'each day once').toBe(88);
		expect(runs.at(-1)).toEqual([]);

		// Yesterday ended 9 hours before NOW but was archived then, so it isn't checked again; the day an hour after
		// it ended is.
		const later = new Date('2026-11-06T01:00:00Z');
		expect(await archiveUsage(analytics(queries), archive, later), 'yesterday, the first time').toEqual(['2026-11-05']);
		expect(await archiveUsage(analytics(queries), archive, new Date('2026-11-06T06:30:00Z')), 'once more').toEqual(['2026-11-05']);
		expect(await archiveUsage(analytics(queries), archive, new Date('2026-11-06T09:30:00Z'))).toEqual([]);
		expect(queries.every((q) => q.includes("timestamp >= toDateTime('"))).toBe(true);
	});

	it('replaces a day archived again, and totals the months', async () => {
		const archive = new UsageArchive(memorySql());
		const queries: string[] = [];
		for (let i = 0; i < 10; i++) {
			await archiveUsage(analytics(queries), archive, NOW);
		}
		archive.saveDay('2026-11-04', { events: [{ event: 'signin', provider: 'googledrive', app: 'own', outcome: 'completed', error: '', source: 'worker', n: 7 }], versions: [], countries: [] }, NOW.getTime());
		const [november, october] = archive.history();
		expect(november).toEqual({ month: '2026-11', activePeak: 2, codes: 3, signins: 10, ownAppSignins: 10, refreshOk: 0, refreshFailed: 9 });
		expect(october).toMatchObject({ month: '2026-10', activePeak: 9, codes: 31, signins: 31, refreshFailed: 93 });
		expect(archive.history().map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09', '2026-08']);
	});
});
