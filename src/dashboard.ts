// The private /usage page: the usage report (src/report.ts) as stat tiles, daily charts (inline SVG, hover layer in
// public/js/usage.js) and tables. Styles in public/css/usage.css; series colors are classes s1..s5, in a fixed order.
import { escape } from './pages';
import { type DailyChart, format, PERIODS, type Report, type Table } from './report';

const W = 720;
const H = 240;
const M = { top: 14, right: 16, bottom: 30, left: 48 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function usagePage(report: Report, period: number, user: string): string {
	return page(
		period,
		user,
		`<section class="tiles" aria-label="Summary">
			${report.tiles
				.map(
					(t) => `<div class="tile">
				<div class="tile-label">${escape(t.label)}</div>
				<div class="tile-value">${escape(t.value)}</div>
				<div class="tile-detail">${escape(t.detail)}</div>
			</div>`,
				)
				.join('')}
		</section>
		${report.charts.map((c, i) => chart(c, report.days, `chart-${i}`)).join('')}
		<section class="tables">
			${report.tables.map(table).join('')}
		</section>`,
	);
}

export function usageErrorPage(period: number, user: string, message: string): string {
	return page(period, user, `<section class="panel"><h2>The usage data could not be loaded</h2><p class="muted">${escape(message)}</p></section>`);
}

function page(period: number, user: string, content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8"/>
	<meta name="viewport" content="width=device-width, initial-scale=1"/>
	<meta name="color-scheme" content="light dark"/>
	<meta name="robots" content="noindex"/>
	<title>Usage · Cloud Drive Sign-in for Kodi</title>
	<link rel="icon" href="/favicon.ico"/>
	<link rel="stylesheet" href="/css/app.css"/>
	<link rel="stylesheet" href="/css/usage.css"/>
	<script src="/js/usage.js" defer></script>
</head>
<body class="usage">
	<main class="dash">
		<header class="dash-header">
			<div>
				<h1>Usage</h1>
				<p class="muted">Anonymous counts from both sign-in servers, by UTC day.${user ? ` Signed in as ${escape(user)}.` : ''}</p>
			</div>
			<nav class="periods" aria-label="Period">
				${PERIODS.map((p) => `<a href="/usage?days=${p}"${p === period ? ' aria-current="page"' : ''}>${p} days</a>`).join('')}
			</nav>
		</header>
		${content}
	</main>
</body>
</html>`;
}

function chart(c: DailyChart, days: string[], id: string): string {
	const n = days.length;
	const band = PLOT_W / n;
	const totals = days.map((_, i) => (c.form === 'stacked' ? c.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0) : Math.max(...c.series.map((s) => s.values[i] ?? 0))));
	const { max, ticks } = scale(Math.max(0, ...totals));
	const y = (value: number) => M.top + PLOT_H - (value / max) * PLOT_H;
	const x = (i: number) => M.left + band * (i + 0.5);

	const grid = ticks
		.map(
			(t) => `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${y(t)}" y2="${y(t)}"/>` +
				`<text class="tick" x="${M.left - 8}" y="${y(t)}" dy="0.32em" text-anchor="end">${format(t)}</text>`,
		)
		.join('');
	const every = Math.max(1, Math.ceil(n / 7));
	const labels = days
		.map((d, i) => ((n - 1 - i) % every === 0 ? `<text class="tick" x="${x(i)}" y="${H - 10}" text-anchor="middle">${dayLabel(d)}</text>` : ''))
		.join('');

	let marks = '';
	if (c.form === 'stacked') {
		const width = Math.min(24, Math.max(2, band * 0.62));
		days.forEach((_, i) => {
			let base = 0;
			const segments = c.series.map((s, k) => ({ k, value: s.values[i] ?? 0 })).filter((s) => s.value > 0);
			segments.forEach((s, j) => {
				const top = y(base + s.value);
				// A 2px surface gap separates a segment from the one below it.
				const bottom = y(base) - (j > 0 ? 2 : 0);
				base += s.value;
				const height = bottom - top;
				if (height <= 0) {
					return;
				}
				const left = x(i) - width / 2;
				marks +=
					j === segments.length - 1
						? `<path class="mark s${s.k + 1}" d="${roundedTop(left, top, width, height, Math.min(4, width / 2, height))}"/>`
						: `<rect class="mark s${s.k + 1}" x="${left}" y="${top}" width="${width}" height="${height}"/>`;
			});
		});
	} else {
		c.series.forEach((s, k) => {
			const points = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
			const lastValue = s.values[n - 1] ?? 0;
			marks +=
				`<polyline class="line s${k + 1}" points="${points}"/>` +
				`<circle class="dot s${k + 1}" cx="${x(n - 1)}" cy="${y(lastValue)}" r="4"/>`;
		});
	}
	const hits = days
		.map((d, i) => `<rect class="hit" x="${M.left + band * i}" y="${M.top}" width="${band}" height="${PLOT_H}" data-i="${i}" tabindex="0" aria-label="${escape(dayLabel(d))}"/>`)
		.join('');
	const data = JSON.stringify({ days: days.map(dayLabel), series: c.series }).replace(/</g, '\\u003c');
	const legend =
		c.series.length > 1
			? `<ul class="legend">${c.series
					.map((s, k) => `<li><svg class="key" viewBox="0 0 14 14" aria-hidden="true">${c.form === 'line' ? `<line class="line s${k + 1}" x1="1" x2="13" y1="7" y2="7"/>` : `<rect class="mark s${k + 1}" x="1" y="1" width="12" height="12" rx="3"/>`}</svg>${escape(s.name)}</li>`)
					.join('')}</ul>`
			: '';

	return `<section class="panel chart" id="${id}">
		<h2>${escape(c.title)}</h2>
		<p class="muted">${escape(c.description)}</p>
		${legend}
		<div class="plot">
			<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(c.title)}">
				${grid}
				<line class="axis" x1="${M.left}" x2="${W - M.right}" y1="${y(0)}" y2="${y(0)}"/>
				${labels}
				${marks}
				<line class="crosshair" x1="0" x2="0" y1="${M.top}" y2="${M.top + PLOT_H}" visibility="hidden"/>
				${hits}
			</svg>
			<div class="tooltip" role="status" hidden></div>
			<script type="application/json" class="chart-data">${data}</script>
		</div>
		<details class="table-view">
			<summary>Show as table</summary>
			${table({ title: '', columns: ['Day', ...c.series.map((s) => s.name)], rows: days.map((d, i) => [d, ...c.series.map((s) => s.values[i] ?? 0)]).reverse() })}
		</details>
	</section>`;
}

function table(t: Table): string {
	const body = t.rows.length
		? t.rows
				.map((r) => `<tr>${r.map((cell) => (typeof cell === 'number' ? `<td class="num">${format(cell)}</td>` : `<td>${escape(cell)}</td>`)).join('')}</tr>`)
				.join('')
		: `<tr><td colspan="${t.columns.length}" class="muted">None in this period</td></tr>`;
	const head = `<thead><tr>${t.columns.map((c, i) => `<th${i > 0 && typeof t.rows[0]?.[i] === 'number' ? ' class="num"' : ''}>${escape(c)}</th>`).join('')}</tr></thead>`;
	const titled = t.title ? `<h2>${escape(t.title)}</h2>${t.description ? `<p class="muted">${escape(t.description)}</p>` : ''}` : '';
	const wrapped = `<div class="table-scroll"><table>${head}<tbody>${body}</tbody></table></div>`;
	// Tables with many columns take a whole row of the grid.
	return t.title ? `<div class="panel${t.columns.length > 4 ? ' wide' : ''}">${titled}${wrapped}</div>` : wrapped;
}

/** A y scale from 0 with clean tick steps (1, 2 or 5 × 10^k), about four ticks. */
export function scale(maximum: number): { max: number; ticks: number[] } {
	const raw = Math.max(1, maximum) / 4;
	const power = 10 ** Math.floor(Math.log10(raw));
	const step = Math.max(1, ([1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power));
	const max = Math.max(step, Math.ceil(Math.max(1, maximum) / step) * step);
	const ticks: number[] = [];
	for (let t = 0; t <= max + step / 2; t += step) {
		ticks.push(t);
	}
	return { max, ticks };
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
	return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function dayLabel(day: string): string {
	const [, month, date] = day.split('-');
	return `${MONTHS[Number(month) - 1] ?? ''} ${Number(date)}`;
}
