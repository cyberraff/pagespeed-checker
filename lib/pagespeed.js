const categories = [
	['performance', 'Performance'],
	['accessibility', 'Accessibility'],
	['best-practices', 'Best Practices'],
	['seo', 'SEO'],
];

const metricAudits = [
	['first-contentful-paint', 'First Contentful Paint'],
	['largest-contentful-paint', 'Largest Contentful Paint'],
	['speed-index', 'Speed Index'],
	['interactive', 'Time to Interactive'],
	['total-blocking-time', 'Total Blocking Time'],
	['cumulative-layout-shift', 'Cumulative Layout Shift'],
];

function cleanText(value = '') {
	return String(value).replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
}

function getAuditDetails(audit) {
	const details = audit.details || {};
	return {
		savingsMs: details.overallSavingsMs || 0,
		savingsBytes: details.overallSavingsBytes || 0,
		items: Array.isArray(details.items)
			? details.items.slice(0, 8).map((item) => ({
					label: cleanText(
						item.url ||
							item.entity ||
							item.node?.snippet ||
							item.source ||
							item.label ||
							'',
					),
					value:
						item.displayValue ||
						item.totalBytes ||
						item.wastedBytes ||
						'',
				}))
			: [],
	};
}

async function inspectStrategy(url, strategy, apiKey) {
	const params = new URLSearchParams({ url, strategy });
	for (const [key] of categories) params.append('category', key);
	if (apiKey) params.set('key', apiKey);

	const startedAt = Date.now();
	const response = await fetch(
		`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
		{ signal: AbortSignal.timeout(90000) },
	);
	const data = await response.json();
	if (!response.ok || !data.lighthouseResult) {
		throw new Error(
			data.error?.message ||
				`PageSpeed request failed (${response.status}).`,
		);
	}

	const lighthouse = data.lighthouseResult;
	const audits = lighthouse.audits || {};
	const scores = Object.fromEntries(
		categories.map(([key]) => [
			key,
			lighthouse.categories?.[key]?.score == null
				? null
				: Math.round(lighthouse.categories[key].score * 100),
		]),
	);
	const metrics = metricAudits.map(([key, label]) => {
		const audit = audits[key];
		return {
			key,
			label,
			displayValue: audit?.displayValue || 'Not available',
			numericValue: audit?.numericValue ?? null,
			numericUnit: audit?.numericUnit || '',
			score: audit?.score == null ? null : Math.round(audit.score * 100),
		};
	});
	const opportunities = Object.entries(audits)
		.filter(
			([, audit]) =>
				audit.score != null &&
				audit.score < 0.9 &&
				audit.scoreDisplayMode !== 'notApplicable',
		)
		.sort(([, left], [, right]) => left.score - right.score)
		.map(([key, audit]) => ({
			key,
			title: audit.title || key,
			score: Math.round(audit.score * 100),
			severity: audit.score < 0.5 ? 'High' : 'Moderate',
			displayValue: audit.displayValue || '',
			description: cleanText(audit.description || ''),
			explanation: cleanText(audit.explanation || ''),
			details: getAuditDetails(audit),
		}));

	return {
		strategy,
		finalUrl: lighthouse.finalUrl || url,
		fetchTimeMs: Date.now() - startedAt,
		lighthouseVersion: lighthouse.lighthouseVersion || 'Not available',
		hostUserAgent: lighthouse.environment?.hostUserAgent || 'Not available',
		scores,
		metrics,
		opportunities,
		warnings: lighthouse.runWarnings || [],
	};
}

function buildTextReport(result) {
	const lines = [
		'PAGESPEED INSIGHTS REPORT',
		'='.repeat(72),
		`Website: ${result.url}`,
		`Generated: ${result.generatedAt}`,
	];

	for (const report of result.reports) {
		lines.push(
			'',
			'-'.repeat(72),
			`${report.strategy.toUpperCase()} REPORT`,
			'-'.repeat(72),
		);
		if (report.error) {
			lines.push(`Inspection failed: ${report.error}`);
			continue;
		}
		lines.push(
			`Final URL: ${report.finalUrl}`,
			`Inspection time: ${report.fetchTimeMs} ms`,
			`Lighthouse version: ${report.lighthouseVersion}`,
			`User agent: ${report.hostUserAgent}`,
			'',
			'CATEGORY SCORES',
		);
		for (const [key, label] of categories)
			lines.push(`${label}: ${report.scores[key] ?? 'N/A'}/100`);
		lines.push('', 'CORE WEB VITALS AND TIMING');
		for (const metric of report.metrics) {
			const raw =
				metric.numericValue == null
					? ''
					: ` (raw: ${metric.numericValue} ${metric.numericUnit})`;
			lines.push(`${metric.label}: ${metric.displayValue}${raw}`);
		}
		lines.push('', `ACTIONABLE AUDITS (${report.opportunities.length})`);
		if (!report.opportunities.length)
			lines.push('No audits below 90% were found.');
		for (const [index, issue] of report.opportunities.entries()) {
			lines.push(
				'',
				`${index + 1}. ${issue.title}`,
				`   Audit ID: ${issue.key}`,
				`   Severity: ${issue.severity}`,
				`   Score: ${issue.score}/100`,
				`   Value: ${issue.displayValue || 'N/A'}`,
				`   Description: ${issue.description || 'Not provided'}`,
			);
			if (issue.explanation)
				lines.push(`   Explanation: ${issue.explanation}`);
			if (issue.details.savingsMs)
				lines.push(
					`   Potential time savings: ${issue.details.savingsMs} ms`,
				);
			if (issue.details.savingsBytes)
				lines.push(
					`   Potential byte savings: ${Math.round(issue.details.savingsBytes / 1024)} KiB`,
				);
			for (const item of issue.details.items)
				if (item.label)
					lines.push(
						`   Detail: ${item.label} ${item.value}`.trimEnd(),
					);
		}
		if (report.warnings.length)
			lines.push(
				'',
				'LIGHTHOUSE WARNINGS',
				...report.warnings.map((warning) => `- ${warning}`),
			);
	}
	return lines.join('\n');
}

export async function analyzeSite(inputUrl) {
	let url;
	try {
		url = new URL(
			/^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`,
		);
	} catch {
		throw new Error('Enter a valid website address, such as example.com.');
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		!url.hostname.includes('.')
	) {
		throw new Error('Enter a public website address using HTTP or HTTPS.');
	}
	if (
		url.username ||
		url.password ||
		url.hostname === 'localhost' ||
		url.hostname.endsWith('.localhost') ||
		url.hostname.endsWith('.local') ||
		/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(
			url.hostname,
		)
	) {
		throw new Error(
			'Enter a publicly accessible website, not a private address.',
		);
	}

	const apiKey = process.env.PAGESPEED_API_KEY || '';
	const reports = await Promise.all(
		['mobile', 'desktop'].map(async (strategy) => {
			try {
				return await inspectStrategy(url.href, strategy, apiKey);
			} catch (error) {
				return { strategy, error: error.message };
			}
		}),
	);
	if (reports.every((report) => report.error)) {
		throw new Error(
			reports
				.map((report) => `${report.strategy}: ${report.error}`)
				.join(' '),
		);
	}

	const result = {
		url: url.href,
		generatedAt: new Date().toISOString(),
		reports,
	};
	result.reportText = buildTextReport(result);
	return result;
}
