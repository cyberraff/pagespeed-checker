if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const tableBody = document.querySelector('#history-table tbody');
const loading = document.querySelector('#loading');
const results = document.querySelector('#results');
const emptyState = document.querySelector('#empty-state');
const countEl = document.querySelector('#result-count');
const historyCount = document.querySelector('#history-count');
const pagination = document.querySelector('#pagination');
const prevBtn = document.querySelector('#prev-page');
const nextBtn = document.querySelector('#next-page');
const pageInfo = document.querySelector('#page-info');
const refreshBtn = document.querySelector('#refresh-btn');
const clearBtn = document.querySelector('#clear-btn');

let currentPage = 0;
const PAGE_SIZE = 20;

function scoreClass(score) {
	return score < 50 ? 'score-low' : score < 90 ? 'score-warn' : '';
}

function formatDate(iso) {
	const d = new Date(iso);
	return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreBadge(score, label) {
	if (score == null) return `<span class="score-badge failed">${label}: Failed</span>`;
	const cls = scoreClass(score);
	return `<span class="score-badge ${cls}">${label}: ${score}/100</span>`;
}

function renderRow(run) {
	const mobile = run.reports.find((r) => r.strategy === 'mobile');
	const desktop = run.reports.find((r) => r.strategy === 'desktop');
	const mobilePerf = mobile?.scores?.performance ?? null;
	const desktopPerf = desktop?.scores?.performance ?? null;
	const hasError = run.reports.some((r) => r.error);

	const tr = document.createElement('tr');
	if (hasError) tr.classList.add('has-error');
	tr.innerHTML = `
		<td>${formatDate(run.generatedAt)}</td>
		<td><a href="${run.url}" target="_blank" rel="noreferrer">${new URL(run.url).hostname}</a></td>
		<td>${scoreBadge(mobilePerf, 'M')}</td>
		<td>${scoreBadge(desktopPerf, 'D')}</td>
		<td>
			<button class="view-btn" data-id="${run.id}" aria-label="View report">View</button>
			<button class="delete-btn" data-id="${run.id}" aria-label="Delete report" style="margin-left: 6px; background: var(--orange-pale); color: var(--orange); border: 1px solid var(--orange);">🗑</button>
		</td>
	`;
	return tr;
}

async function loadHistory() {
	loading.hidden = false;
	results.hidden = true;
	emptyState.hidden = true;
	pagination.hidden = true;
	try {
		const res = await fetch(`/api/history?limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`);
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || 'Failed to load history');

		tableBody.innerHTML = '';
		if (data.history.length === 0) {
			if (currentPage === 0) {
				emptyState.hidden = false;
				countEl.textContent = '0 inspections';
				historyCount.textContent = '0 total';
			} else {
				currentPage--;
				await loadHistory();
			}
			return;
		}

		for (const run of data.history) {
			tableBody.append(renderRow(run));
		}

		countEl.textContent = `${data.history.length} inspection${data.history.length !== 1 ? 's' : ''} on this page`;
		historyCount.textContent = `Page ${currentPage + 1}`;

		results.hidden = false;
		pagination.hidden = false;
		prevBtn.disabled = currentPage === 0;
		nextBtn.disabled = data.history.length < PAGE_SIZE;
		pageInfo.textContent = `Page ${currentPage + 1}`;
	} catch (error) {
		console.error(error);
		tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--orange);">Failed to load: ${error.message}</td></tr>`;
		results.hidden = false;
	} finally {
		loading.hidden = true;
	}
}

tableBody.addEventListener('click', (e) => {
	const viewBtn = e.target.closest('.view-btn');
	if (viewBtn) {
		window.location.href = `/?history=${viewBtn.dataset.id}`;
		return;
	}
	const deleteBtn = e.target.closest('.delete-btn');
	if (deleteBtn) {
		const id = deleteBtn.dataset.id;
		if (confirm('Delete this inspection? This cannot be undone.')) {
			deleteRun(id);
		}
	}
});

async function deleteRun(id) {
	const btn = tableBody.querySelector(`.delete-btn[data-id="${id}"]`);
	if (btn) btn.disabled = true;
	try {
		const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
		if (!res.ok) throw new Error('Failed to delete');
		await loadHistory();
	} catch (error) {
		alert(error.message);
		if (btn) btn.disabled = false;
	}
}

prevBtn.addEventListener('click', () => {
	if (currentPage > 0) {
		currentPage--;
		loadHistory();
	}
});

nextBtn.addEventListener('click', () => {
	currentPage++;
	loadHistory();
});

refreshBtn.addEventListener('click', loadHistory);

clearBtn.addEventListener('click', async () => {
	if (!confirm('Delete all history? This cannot be undone.')) return;
	clearBtn.disabled = true;
	clearBtn.textContent = 'Deleting…';
	try {
		const res = await fetch('/api/history', { method: 'DELETE' });
		if (!res.ok) throw new Error('Failed to clear');
		currentPage = 0;
		await loadHistory();
	} catch (error) {
		alert(error.message);
	} finally {
		clearBtn.disabled = false;
		clearBtn.innerHTML = '<span>🗑</span> Clear All';
	}
});

loadHistory();