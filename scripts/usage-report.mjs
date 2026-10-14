#!/usr/bin/env node
// Prints the usage counts recorded by the Worker (src/usage.ts) for the last days.
//
//   node scripts/usage-report.mjs [days]          (default 7)
//
// Needs a Cloudflare API token with Account > Account Analytics > Read, in CLOUDFLARE_API_TOKEN or in
// ~/.config/cloudflare/usage-token (chmod 600), and the account ID in CLOUDFLARE_ACCOUNT_ID or in
// ~/.config/cloudflare/account-id. Counts are sampling-aware: SUM(_sample_interval * double1).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const days = Number.parseInt(process.argv[2] ?? '7', 10);
if (!Number.isInteger(days) || days < 1 || days > 92) {
	console.error('Usage: node scripts/usage-report.mjs [days, 1-92]');
	process.exit(2);
}
const setting = (env, file) => {
	if (process.env[env]) {
		return process.env[env].trim();
	}
	const path = join(homedir(), '.config', 'cloudflare', file);
	return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
};
const token = setting('CLOUDFLARE_API_TOKEN', 'usage-token');
const account = setting('CLOUDFLARE_ACCOUNT_ID', 'account-id');
if (!token || !account) {
	console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or create ~/.config/cloudflare/usage-token and account-id.');
	process.exit(2);
}

const COUNT = 'SUM(_sample_interval * double1)';
const SINCE = `timestamp > NOW() - INTERVAL '${days}' DAY`;
const DAY = "formatDateTime(timestamp, '%Y-%m-%d')";

async function query(sql) {
	const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: `${sql} FORMAT JSON`,
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`${response.status}: ${text.slice(0, 500)}`);
	}
	return JSON.parse(text).data ?? [];
}

function table(title, rows, columns) {
	console.log(`\n${title}`);
	if (rows.length === 0) {
		console.log('  (none)');
		return;
	}
	const cells = rows.map((row) => columns.map((c) => (typeof row[c] === 'number' ? String(Math.round(row[c])) : String(row[c] ?? ''))));
	const widths = columns.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i].length)));
	const line = (values) => `  ${values.map((v, i) => v.padEnd(widths[i])).join('  ')}`.trimEnd();
	console.log(line(columns));
	for (const r of cells) {
		console.log(line(r));
	}
}

/** Pivots rows of (day, key, n) into one row per day with a column per key. */
function pivot(rows, keys) {
	const byDay = new Map();
	for (const r of rows) {
		const row = byDay.get(r.day) ?? { day: r.day };
		row[r.key] = (row[r.key] ?? 0) + Number(r.n);
		byDay.set(r.day, row);
	}
	return [...byDay.values()].map((row) => Object.fromEntries([['day', row.day], ...keys.map((k) => [k, row[k] ?? 0])]));
}

const funnelKeys = ['pin created', 'signin_start redirected', 'signin completed', 'signin denied', 'collect delivered', 'collect not_found'];
const funnel = await query(
	`SELECT ${DAY} AS day, concat(blob1, ' ', blob4) AS key, ${COUNT} AS n FROM signin_usage
	 WHERE ${SINCE} AND blob1 IN ('pin', 'signin_start', 'signin', 'collect') GROUP BY day, key ORDER BY day`,
);
table(`Sign-ins, last ${days} days (all providers)`, pivot(funnel, funnelKeys), ['day', ...funnelKeys]);

table(
	'Sign-ins by provider',
	await query(
		`SELECT blob2 AS provider, blob1 AS event, blob4 AS outcome, ${COUNT} AS n FROM signin_usage
		 WHERE ${SINCE} AND blob1 IN ('pin', 'signin') AND blob2 != '' GROUP BY provider, event, outcome ORDER BY provider, event, n DESC`,
	),
	['provider', 'event', 'outcome', 'n'],
);

table(
	'Other sign-in failures (no provider known)',
	await query(
		`SELECT blob1 AS event, blob4 AS outcome, blob5 AS error, ${COUNT} AS n FROM signin_usage
		 WHERE ${SINCE} AND blob1 IN ('signin', 'signin_start') AND blob2 = '' GROUP BY event, outcome, error ORDER BY n DESC`,
	),
	['event', 'outcome', 'error', 'n'],
);

const activeRows = await query(
	`SELECT ${DAY} AS day, concat(blob6, ' ', blob2, ' ', blob3) AS key, ${COUNT} AS n FROM signin_usage
	 WHERE ${SINCE} AND blob1 = 'active_account' GROUP BY day, key ORDER BY day`,
);
const activeKeys = [...new Set(activeRows.map((r) => r.key))].sort();
table('Active accounts per day (source provider app; overcounted on days with a deploy or restart)', pivot(activeRows, activeKeys), ['day', ...activeKeys]);

const refreshRows = await query(
	`SELECT ${DAY} AS day, concat(blob6, ' ', blob4) AS key, ${COUNT} AS n FROM signin_usage
	 WHERE ${SINCE} AND blob1 = 'refresh' GROUP BY day, key ORDER BY day`,
);
const refreshKeys = [...new Set(refreshRows.map((r) => r.key))].sort();
table('Token refreshes per day (source outcome)', pivot(refreshRows, refreshKeys), ['day', ...refreshKeys]);

table(
	'Refresh failures by error',
	await query(
		`SELECT blob6 AS source, blob2 AS provider, blob5 AS error, ${COUNT} AS n FROM signin_usage
		 WHERE ${SINCE} AND blob1 = 'refresh' AND blob4 = 'failed' GROUP BY source, provider, error ORDER BY n DESC LIMIT 15`,
	),
	['source', 'provider', 'error', 'n'],
);

table(
	'Kodi clients by version (refreshes and sign-ins)',
	await query(
		`SELECT blob9 AS addon, blob10 AS addon_version, blob11 AS common, blob12 AS kodi, ${COUNT} AS n FROM signin_usage
		 WHERE ${SINCE} AND blob8 = 'kodi' GROUP BY addon, addon_version, common, kodi ORDER BY n DESC LIMIT 20`,
	),
	['addon', 'addon_version', 'common', 'kodi', 'n'],
);

table(
	'Countries (Kodi requests)',
	await query(
		`SELECT blob7 AS country, ${COUNT} AS n FROM signin_usage
		 WHERE ${SINCE} AND blob8 = 'kodi' GROUP BY country ORDER BY n DESC LIMIT 15`,
	),
	['country', 'n'],
);

table(
	'Rate limits hit',
	await query(
		`SELECT blob5 AS limit_name, ${COUNT} AS n FROM signin_usage WHERE ${SINCE} AND blob1 = 'rate_limited' GROUP BY limit_name ORDER BY n DESC`,
	),
	['limit_name', 'n'],
);
