if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const form = document.querySelector('#batch-form');
const textarea = document.querySelector('#batch-urls');
const button = document.querySelector('#batch-button');
const errorBox = document.querySelector('#batch-error');
const countEl = document.querySelector('#batch-count');
const loading = document.querySelector('#batch-loading');
const loadingMsg = document.querySelector('#batch-loading-message');
const results = document.querySelector('#batch-results');
const emptyState = document.querySelector('#empty-state');
const completeCount = document.querySelector('#batch-complete-count');
const summaryEl = document.querySelector('#batch-summary');
const listEl = document.querySelector('#batch-list');

function scoreClass(score) {
	return score < 50 ? 'score-low' : score < 90 ? 'score-warn' : '';
}

function formatDate(iso) {
	const d = new Date(iso);
	return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreBadge(score, label) {
	if (score == null) return `<span class="score-badge failed">${label}: Failed</span>`;
	const cls = scoreClass(score);
	return `<span class="score-badge ${cls}">${label}: ${score}/100</span>`;
}

function parseUrls(text) {
	return text
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function updateCount() {
	const urls = parseUrls(textarea.value);
	countEl.textContent = `${urls.length} URL${urls.length !== 1 ? 's' : ''}`;
	button.disabled = urls.length === 0 || urls.length > 10;
}

textarea.addEventListener('input', updateCount);

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	errorBox.textContent = '';
	const urls = parseUrls(textarea.value);
	if (urls.length === 0) {
		errorBox.textContent = 'Enter at least one website address.';
		return;
	}
	if (urls.length > 10) {
		errorBox.textContent = 'Maximum 10 URLs per batch.';
		return;
	}

	button.disabled = true;
	button.querySelector('span:first-child').textContent = 'Inspecting…';
	loading.hidden = false;
	results.hidden = true;
	emptyState.hidden = true;

	try {
		const response = await fetch('/api/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ urls }),
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Batch inspection failed');

		renderResults(data.results);
	} catch (error) {
		errorBox.textContent = error.message;
		emptyState.hidden = false;
	} finally {
		loading.hidden = true;
		button.disabled = false;
		button.querySelector('span:first-child').textContent = 'Run batch inspection';
	}
});

function renderResults(results) {
	const successful = results.filter((r) => r.result);
	const failed = results.filter((r) => r.error);

	completeCount.textContent = `${successful.length} completed, ${failed.length} failed`;
	summaryEl.innerHTML = `
		<div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; padding: 16px; background: var(--white); border: 1px solid var(--line); border-radius: 2px;">
			<div><strong style="font: 700 24px var(--display);">${successful.length}</strong> <span style="color: var(--muted); font: 10px var(--mono);">Successful</span></div>
			<div><strong style="font: 700 24px var(--display); color: var(--orange);">${failed.length}</strong> <span style="color: var(--muted); font: 10px var(--mono);">Failed</span></div>
		</div>
	`;

	listEl.innerHTML = '';
	for (const { url, result, error } of results) {
		const hostname = new URL(url).hostname;
		const card = document.createElement('div');
		card.style.cssText = 'border: 1px solid var(--line); border-radius: 2px; overflow: hidden; margin-bottom: 16px; background: var(--white);';

		if (error) {
			card.innerHTML = `
				<div style="padding: 16px; border-bottom: 1px solid var(--line); background: #fff5f2;">
					<strong style="font: 600 14px var(--display);">${hostname}</strong>
					<span style="margin-left: 10px; color: var(--orange); font: 500 10px var(--mono);">FAILED</span>
				</div>
				<div style="padding: 16px; color: var(--orange); font-size: 13px;">${error}</div>
			`;
		} else {
			const mobile = result.reports.find((r) => r.strategy === 'mobile');
			const desktop = result.reports.find((r) => r.strategy === 'desktop');
			const mobilePerf = mobile?.scores?.performance ?? null;
			const desktopPerf = desktop?.scores?.performance ?? null;

			card.innerHTML = `
				<div style="padding: 16px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
					<div>
						<strong style="font: 600 14px var(--display);">${hostname}</strong>
						<a href="${url}" target="_blank" rel="noreferrer" class="result-url" style="margin-left: 10px;">${url}</a>
					</div>
					<div style="display: flex; gap: 8px;">
						${scoreBadge(mobilePerf, 'M')}
						${scoreBadge(desktopPerf, 'D')}
					</div>
				</div>
				<div style="padding: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
					<div>
						<div style="color: var(--muted); font: 10px var(--mono); margin-bottom: 4px;">MOBILE</div>
						<div style="font: 700 18px var(--display); color: ${mobilePerf != null ? (mobilePerf < 50 ? 'var(--orange)' : mobilePerf < 90 ? 'var(--yellow)' : 'var(--green)') : 'var(--muted)'};">
							${mobilePerf != null ? mobilePerf + '/100' : 'Failed'}
						</div>
						${mobile ? `<div style="color: var(--muted); font: 10px var(--mono); margin-top: 4px;">${formatDate(result.generatedAt)} · ${mobile.fetchTimeMs}ms</div>` : ''}
					</div>
					<div>
						<div style="color: var(--muted); font: 10px var(--mono); margin-bottom: 4px;">DESKTOP</div>
						<div style="font: 700 18px var(--display); color: ${desktopPerf != null ? (desktopPerf < 50 ? 'var(--orange)' : desktopPerf < 90 ? 'var(--yellow)' : 'var(--green)') : 'var(--muted)'};">
							${desktopPerf != null ? desktopPerf + '/100' : 'Failed'}
						</div>
						${desktop ? `<div style="color: var(--muted); font: 10px var(--mono); margin-top: 4px;">${formatDate(result.generatedAt)} · ${desktop.fetchTimeMs}ms</div>` : ''}
					</div>
				</div>
				<div style="padding: 0 16px 16px; display: flex; gap: 8px;">
					<a href="/?history=${result.id}" style="flex: 1; text-align: center; padding: 10px; border: 1px solid var(--line); border-radius: 2px; color: var(--ink); text-decoration: none; font: 500 11px var(--mono);">View Full Report</a>
				</div>
			`;
		}
		listEl.append(card);
	}

	results.hidden = false;
	results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

updateCount();