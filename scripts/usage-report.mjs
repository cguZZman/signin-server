#!/usr/bin/env node
// Prints the usage report (the same as the /usage page) for the last 7, 30 or 90 days.
//
//   node scripts/usage-report.mjs [days]          (default 7)
//
// Needs a Cloudflare API token with Account > Account Analytics > Read, in CLOUDFLARE_API_TOKEN or in
// ~/.config/cloudflare/usage-token (chmod 600), and the account ID in CLOUDFLARE_ACCOUNT_ID or in
// ~/.config/cloudflare/account-id. Node 22.18 or later (it loads src/report.ts directly).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { format, loadReport, PERIODS, sqlApi } from '../src/report.ts';

const days = Number.parseInt(process.argv[2] ?? '7', 10);
if (!PERIODS.includes(days)) {
	console.error(`Usage: node scripts/usage-report.mjs [${PERIODS.join('|')}]`);
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

function table(title, columns, rows) {
	console.log(`\n${title}`);
	if (rows.length === 0) {
		console.log('  (none)');
		return;
	}
	const cells = rows.map((row) => row.map((c) => (typeof c === 'number' ? format(c) : String(c))));
	const widths = columns.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i].length)));
	const line = (values) => `  ${values.map((v, i) => (i > 0 && /^[\d,]+$/.test(v) ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join('  ')}`.trimEnd();
	console.log(line(columns));
	for (const r of cells) {
		console.log(line(r));
	}
}

const report = await loadReport(sqlApi(account, token), days);
console.log(`Usage, last ${days} days (UTC)\n`);
for (const tile of report.tiles) {
	console.log(`  ${tile.label}: ${tile.value}  (${tile.detail})`);
}
for (const chart of report.charts) {
	// Days with no counts at all are left out.
	const rows = report.days
		.map((day, i) => [day, ...chart.series.map((s) => s.values[i] ?? 0)])
		.filter((row) => row.slice(1).some((v) => v > 0));
	table(chart.title, ['Day', ...chart.series.map((s) => s.name)], rows);
}
for (const t of report.tables) {
	table(t.title, t.columns, t.rows);
}
