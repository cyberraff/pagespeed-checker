import fetch from 'node-fetch';
import { readFileSync, writeFileSync } from 'fs';

// Replace with your API Key if needed
const API_KEY = process.env.PAGESPEED_API_KEY || '';

const sites = readFileSync('sites.txt', 'utf-8')
	.split('\n')
	.map((s) => s.trim())
	.filter((s) => s.length > 0);

function getReportFilename(url) {
	try {
		return `${new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_')}.txt`;
	} catch {
		return `${url.replace(/[^a-z0-9.-]/gi, '_')}.txt`;
	}
}

const strategies = [
	{ key: 'mobile', label: 'MOBILE' },
	{ key: 'desktop', label: 'DESKTOP' },
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

function formatAuditDetails(audit) {
	const details = audit.details;
	if (!details) return [];

	const lines = [];
	if (details.overallSavingsMs) {
		lines.push(`   Estimated time savings: ${details.overallSavingsMs} ms`);
	}
	if (details.overallSavingsBytes) {
		lines.push(
			`   Estimated byte savings: ${Math.round(details.overallSavingsBytes / 1024)} KiB`,
		);
	}
	if (Array.isArray(details.items)) {
		lines.push(`   Detail items: ${details.items.length}`);
		for (const item of details.items.slice(0, 10)) {
			const itemText =
				item.url || item.entity || item.node?.snippet || item.source;
			if (itemText) lines.push(`   - ${cleanText(itemText)}`);
		}
		if (details.items.length > 10)
			lines.push('   - Additional items omitted from report');
	}
	return lines;
}

for (const url of sites) {
	const report = [];
	const log = (message = '') => {
		console.log(message);
		report.push(message);
	};

	log(`\n${'='.repeat(70)}`);
	log(`🔍 ANALYZING SITE: ${url}`);
	log(`${'='.repeat(70)}`);

	for (const strategy of strategies) {
		try {
			const categories =
				'&category=performance&category=accessibility&category=best-practices&category=seo';
			const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy.key}${categories}${API_KEY ? '&key=' + API_KEY : ''}`;

			log(`\n${'─'.repeat(70)}`);
			log(`📱 ${strategy.label} REPORT`);
			log(`${'─'.repeat(70)}`);

			const startedAt = Date.now();
			const res = await fetch(apiUrl);
			const data = await res.json();

			if (!data.lighthouseResult) {
				log(
					`❌ SKIP — ${data.error?.message || 'No Lighthouse data returned.'}`,
				);
				continue;
			}

			const lh = data.lighthouseResult;
			const audits = lh.audits || {};
			const score = (category) =>
				Math.round((lh.categories?.[category]?.score ?? 0) * 100);
			const scores = {
				performance: score('performance'),
				accessibility: score('accessibility'),
				bestPractices: score('best-practices'),
				seo: score('seo'),
			};

			log(`URL tested: ${lh.finalUrl || url}`);
			log(`Fetch time: ${Date.now() - startedAt} ms`);
			log(`Lighthouse version: ${lh.lighthouseVersion || 'N/A'}`);
			log(`User agent: ${lh.environment?.hostUserAgent || 'N/A'}`);
			log(`\n📊 CATEGORY SCORES`);
			log(`   Performance:    ${scores.performance}/100`);
			log(`   Accessibility:  ${scores.accessibility}/100`);
			log(`   Best Practices: ${scores.bestPractices}/100`);
			log(`   SEO:            ${scores.seo}/100`);

			log(`\n⏱️ CORE WEB VITALS AND TIMING METRICS`);
			for (const [auditKey, label] of metricAudits) {
				const audit = audits[auditKey];
				log(`   ${label}: ${audit?.displayValue || 'N/A'}`);
				if (audit?.numericValue !== undefined) {
					log(
						`      Numeric value: ${audit.numericValue} ${audit.numericUnit || ''}`,
					);
				}
			}

			const flag =
				scores.performance < 50
					? '🔴 HOT LEAD'
					: scores.performance < 70
						? '🟡 WARM'
						: '🟢 GOOD';
			log(`\n${flag} — Performance score: ${scores.performance}/100`);

			const issues = Object.entries(audits)
				.filter(
					([, audit]) =>
						audit.score !== null &&
						audit.score !== undefined &&
						audit.score < 0.9 &&
						audit.scoreDisplayMode !== 'notApplicable',
				)
				.sort(
					([, left], [, right]) =>
						(left.score ?? 1) - (right.score ?? 1),
				);

			log(`\n📋 ACTIONABLE AUDITS (${issues.length})`);
			if (issues.length === 0) {
				log('   ✨ No audits below 90% were found.');
			}

			issues.forEach(([auditKey, audit], index) => {
				const severity = audit.score < 0.5 ? '🔴 HIGH' : '🟡 MEDIUM';
				log(`\n   ${index + 1}. ${audit.title || auditKey}`);
				log(`   Audit ID: ${auditKey}`);
				log(`   Severity: ${severity}`);
				log(`   Score: ${Math.round(audit.score * 100)}/100`);
				log(`   Display value: ${audit.displayValue || 'N/A'}`);
				log(`   Score mode: ${audit.scoreDisplayMode || 'N/A'}`);
				if (audit.numericValue !== undefined) {
					log(
						`   Numeric value: ${audit.numericValue} ${audit.numericUnit || ''}`,
					);
				}
				if (audit.description)
					log(`   Description: ${cleanText(audit.description)}`);
				if (audit.explanation)
					log(`   Explanation: ${cleanText(audit.explanation)}`);
				for (const detail of formatAuditDetails(audit)) log(detail);
			});

			if (lh.runWarnings?.length) {
				log(`\n⚠️ LIGHTHOUSE WARNINGS`);
				lh.runWarnings.forEach((warning) => log(`   - ${warning}`));
			}

			await new Promise((resolve) => setTimeout(resolve, 2000));
		} catch (err) {
			log(`💥 ERROR analyzing ${strategy.label}: ${err.message}`);
		}
	}

	writeFileSync(getReportFilename(url), `${report.join('\n')}\n`, 'utf-8');
	console.log(
		`💾 Combined mobile and desktop report saved to ${getReportFilename(url)}`,
	);
}
