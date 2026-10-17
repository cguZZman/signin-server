// Hover and focus layer of the /usage charts: a crosshair on the day under the pointer and one tooltip listing every
// series for that day. Values come from the chart's JSON data block; names are inserted with textContent only.
'use strict';

document.querySelectorAll('.chart').forEach((chart) => {
	const plot = chart.querySelector('.plot');
	const svg = plot.querySelector('svg');
	const crosshair = svg.querySelector('.crosshair');
	const tooltip = plot.querySelector('.tooltip');
	const data = JSON.parse(plot.querySelector('.chart-data').textContent);

	function show(hit) {
		const i = Number(hit.dataset.i);
		const x = Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2;
		crosshair.setAttribute('x1', x);
		crosshair.setAttribute('x2', x);
		crosshair.setAttribute('visibility', 'visible');

		tooltip.replaceChildren();
		const day = document.createElement('div');
		day.className = 'tooltip-day';
		day.textContent = data.days[i];
		tooltip.append(day);
		data.series.forEach((series, k) => {
			const row = document.createElement('div');
			row.className = 'tooltip-row';
			const key = document.createElement('span');
			key.className = `tooltip-key s${k + 1}`;
			const value = document.createElement('strong');
			value.textContent = Math.round(series.values[i] || 0).toLocaleString('en-US');
			const name = document.createElement('span');
			name.textContent = series.name;
			row.append(key, value, name);
			tooltip.append(row);
		});
		tooltip.hidden = false;

		// Beside the crosshair, flipped to the left near the right edge.
		const box = svg.getBoundingClientRect();
		const scale = box.width / svg.viewBox.baseVal.width;
		const px = x * scale;
		const width = tooltip.offsetWidth;
		const left = px + 12 + width > box.width ? px - 12 - width : px + 12;
		tooltip.style.left = `${Math.max(0, left)}px`;
	}

	function hide() {
		crosshair.setAttribute('visibility', 'hidden');
		tooltip.hidden = true;
	}

	svg.querySelectorAll('.hit').forEach((hit) => {
		hit.addEventListener('pointerenter', () => show(hit));
		hit.addEventListener('focus', () => show(hit));
		hit.addEventListener('blur', hide);
	});
	svg.addEventListener('pointerleave', hide);
});

// The tables' day filter applies as soon as a day is picked.
document.querySelectorAll('.day-filter').forEach((form) => {
	form.querySelector('button').hidden = true;
	form.querySelector('select').addEventListener('change', () => form.submit());
});
