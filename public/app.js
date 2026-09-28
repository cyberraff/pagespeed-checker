if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const form = document.querySelector('#inspect-form');
const input = document.querySelector('#website-url');
const button = document.querySelector('#inspect-button');
const errorBox = document.querySelector('#form-error');
const loading = document.querySelector('#loading');
const results = document.querySelector('#results');
const emptyState = document.querySelector('#empty-state');
const reportPanel = document.querySelector('#device-report');
const partialWarning = document.querySelector('#partial-warning');
let currentResult;

async function loadHistoryRun(id) {
	loading.hidden = false;
	results.hidden = true;
	emptyState.hidden = true;
	try {
		const res = await fetch(`/api/history/${id}`);
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || 'Failed to load run');
		showResult(data);
	} catch (error) {
		errorBox.textContent = error.message;
		emptyState.hidden = false;
	} finally {
		loading.hidden = true;
	}
}

const urlParams = new URLSearchParams(window.location.search);
const historyId = urlParams.get('history');
if (historyId) {
	loadHistoryRun(historyId);
}

function element(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function scoreClass(score) {
	return score < 50 ? 'score-low' : score < 90 ? 'score-warn' : '';
}

function renderScores(report) {
	const labels = [
		['performance', 'Performance'],
		['accessibility', 'Accessibility'],
		['best-practices', 'Best Practices'],
		['seo', 'SEO'],
	];
	const grid = element('div', 'score-grid');
	for (const [key, label] of labels) {
		const value = report.scores[key];
		const cell = element('div', 'score-cell');
		cell.append(element('span', 'score-label', label));
		const number = element('div', 'score-value');
		number.append(
			element('span', '', value == null ? 'N/A' : String(value)),
		);
		if (value != null) number.append(element('small', '', '/ 100'));
		cell.append(number);
		if (value != null) {
			const track = element('div', 'score-track');
			const fill = element('i', scoreClass(value));
			fill.style.width = `${value}%`;
			track.append(fill);
			cell.append(track);
		}
		grid.append(cell);
	}
	return grid;
}

function renderMetrics(report) {
	const section = element('section', 'metric-section');
	const heading = element('div', 'section-heading');
	heading.append(element('h3', '', 'Core Web Vitals & timing'));
	heading.append(element('span', '', 'FIELD MEASUREMENTS'));
	section.append(heading);
	const grid = element('div', 'metric-grid');
	for (const metric of report.metrics) {
		const cell = element('div', 'metric-cell');
		cell.append(element('span', '', metric.label));
		cell.append(element('strong', '', metric.displayValue));
		if (metric.numericValue != null) {
			cell.append(
				element(
					'small',
					'',
					`${metric.numericValue} ${metric.numericUnit}`.trim(),
				),
			);
		}
		grid.append(cell);
	}
	section.append(grid);
	return section;
}

function renderIssues(report) {
	const section = element('section', 'audit-section');
	const heading = element('div', 'section-heading');
	heading.append(element('h3', '', 'Opportunities & diagnostics'));
	heading.append(
		element(
			'span',
			'audit-count',
			`${report.opportunities.length} NEED ATTENTION`,
		),
	);
	section.append(heading);
	if (!report.opportunities.length) {
		section.append(
			element(
				'p',
				'no-issues',
				'No scored audits below 90. Looking good.',
			),
		);
		return section;
	}

	const list = element('div', 'audit-list');
	for (const issue of report.opportunities) {
		const details = element('details', 'audit-item');
		const summary = element('summary');
		summary.append(
			element(
				'span',
				`audit-severity ${issue.severity === 'Moderate' ? 'moderate' : ''}`,
				issue.severity,
			),
		);
		summary.append(element('span', 'audit-title', issue.title));
		summary.append(element('span', 'audit-score', `${issue.score}/100`));
		details.append(summary);
		const body = element('div', 'audit-body');
		if (issue.displayValue)
			body.append(
				element('p', '', `Measured value: ${issue.displayValue}`),
			);
		if (issue.description) body.append(element('p', '', issue.description));
		if (issue.explanation) body.append(element('p', '', issue.explanation));
		const savings = element('div', 'audit-savings');
		if (issue.details.savingsMs)
			savings.append(
				element(
					'span',
					'',
					`~${issue.details.savingsMs} ms potential savings`,
				),
			);
		if (issue.details.savingsBytes)
			savings.append(
				element(
					'span',
					'',
					`~${Math.round(issue.details.savingsBytes / 1024)} KiB potential savings`,
				),
			);
		if (savings.childElementCount) body.append(savings);
		if (issue.details.items.length) {
			const itemList = element('ul', 'audit-detail-list');
			for (const item of issue.details.items) {
				const label = item.label || 'Page element';
				itemList.append(
					element(
						'li',
						'',
						item.value ? `${label} · ${item.value}` : label,
					),
				);
			}
			body.append(itemList);
		}
		details.append(body);
		list.append(details);
	}
	section.append(list);
	return section;
}

function renderStrategy(strategy) {
	const report = currentResult.reports.find(
		(item) => item.strategy === strategy,
	);
	const pane = element('div', 'device-pane');
	if (!report || report.error) {
		pane.append(
			element(
				'p',
				'partial-warning',
				report?.error || 'No report was returned for this device.',
			),
		);
		return pane;
	}
	const meta = element('div', 'device-meta');
	meta.append(element('span', '', `FINAL URL · ${report.finalUrl}`));
	meta.append(element('span', '', `LIGHTHOUSE ${report.lighthouseVersion}`));
	meta.append(element('span', '', `RUN ${report.fetchTimeMs} ms`));
	pane.append(
		meta,
		renderScores(report),
		renderMetrics(report),
		renderIssues(report),
	);
	if (report.warnings.length) {
		const warning = element('div', 'partial-warning');
		warning.textContent = `Lighthouse warnings: ${report.warnings.join(' · ')}`;
		pane.append(warning);
	}
	return pane;
}

function setActiveStrategy(strategy) {
	for (const tab of document.querySelectorAll('.device-tab')) {
		const selected = tab.dataset.strategy === strategy;
		tab.classList.toggle('is-active', selected);
		tab.setAttribute('aria-selected', String(selected));
		if (selected) reportPanel.setAttribute('aria-labelledby', tab.id);
	}
	reportPanel.replaceChildren(renderStrategy(strategy));
}

function showResult(result) {
	currentResult = result;
	const parsed = new URL(result.url);
	document.querySelector('#result-domain').textContent = parsed.hostname;
	const resultUrl = document.querySelector('#result-url');
	resultUrl.href = result.url;
	resultUrl.textContent = result.url;
	document.querySelector('#run-stamp').textContent = new Date(
		result.generatedAt,
	).toLocaleString();
	for (const strategy of ['mobile', 'desktop']) {
		const report = result.reports.find(
			(item) => item.strategy === strategy,
		);
		document.querySelector(`#${strategy}-score`).textContent =
			report?.scores?.performance == null
				? 'FAILED'
				: `${report.scores.performance}/100`;
	}
	const failures = result.reports.filter((report) => report.error);
	partialWarning.hidden = failures.length === 0;
	partialWarning.textContent = failures
		.map((report) => `${report.strategy}: ${report.error}`)
		.join(' ');
	const fileName = `${parsed.hostname.replace(/[^a-z0-9.-]/gi, '-')}-pagespeed-report.txt`;
	const link = document.querySelector('#download-report');
	if (link.dataset.objectUrl) URL.revokeObjectURL(link.dataset.objectUrl);
	const objectUrl = URL.createObjectURL(
		new Blob([result.reportText], { type: 'text/plain;charset=utf-8' }),
	);
	link.href = objectUrl;
	link.download = fileName;
	link.dataset.objectUrl = objectUrl;
	results.hidden = false;
	emptyState.hidden = true;
	setActiveStrategy('mobile');
	results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

for (const tab of document.querySelectorAll('.device-tab')) {
	tab.addEventListener('click', () =>
		setActiveStrategy(tab.dataset.strategy),
	);
}

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	errorBox.textContent = '';
	const url = input.value.trim();
	if (!url) {
		errorBox.textContent = 'Enter a website address to begin.';
		input.focus();
		return;
	}
	button.disabled = true;
	button.querySelector('span:first-child').textContent = 'Inspecting…';
	loading.hidden = false;
	results.hidden = true;
	emptyState.hidden = true;
	try {
		const response = await fetch('/api/analyze', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url }),
		});
		const data = await response.json();
		if (!response.ok)
			throw new Error(
				data.error || 'The inspection could not be completed.',
			);
		showResult(data);
	} catch (error) {
		errorBox.textContent = error.message;
		emptyState.hidden = false;
	} finally {
		loading.hidden = true;
		button.disabled = false;
		button.querySelector('span:first-child').textContent = 'Run inspection';
	}
});
