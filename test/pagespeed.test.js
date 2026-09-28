import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSite } from '../lib/pagespeed.js';

function mockResponse(strategy) {
	return {
		ok: true,
		json: async () => ({
			lighthouseResult: {
				finalUrl: 'https://example.com/',
				lighthouseVersion: '12.0.0',
				environment: { hostUserAgent: 'Test browser' },
				categories: {
					performance: { score: strategy === 'mobile' ? 0.72 : 0.94 },
					accessibility: { score: 0.91 },
					'best-practices': { score: 1 },
					seo: { score: 0.88 },
				},
				audits: {
					'first-contentful-paint': {
						displayValue: '1.2 s',
						numericValue: 1200,
						numericUnit: 'millisecond',
						score: 0.8,
					},
					'largest-contentful-paint': {
						displayValue: '2.1 s',
						numericValue: 2100,
						numericUnit: 'millisecond',
						score: 0.7,
					},
					'speed-index': {
						displayValue: '2.4 s',
						numericValue: 2400,
						numericUnit: 'millisecond',
						score: 0.75,
					},
					interactive: {
						displayValue: '3.0 s',
						numericValue: 3000,
						numericUnit: 'millisecond',
						score: 0.7,
					},
					'total-blocking-time': {
						displayValue: '100 ms',
						numericValue: 100,
						numericUnit: 'millisecond',
						score: 0.9,
					},
					'cumulative-layout-shift': {
						displayValue: '0.02',
						numericValue: 0.02,
						numericUnit: 'unitless',
						score: 1,
					},
					'image-delivery': {
						title: 'Improve image delivery',
						description: 'Serve smaller images.',
						explanation: 'An image could be compressed.',
						displayValue: 'Potential savings 22 KiB',
						score: 0.4,
						scoreDisplayMode: 'numeric',
						details: {
							overallSavingsBytes: 22000,
							items: [
								{
									url: 'https://example.com/image.jpg',
									totalBytes: 22000,
								},
							],
						},
					},
				},
				runWarnings: ['A test warning'],
			},
		}),
	};
}

test('rejects malformed and private website addresses', async () => {
	for (const url of ['not a URL', 'localhost', 'http://127.0.0.1']) {
		await assert.rejects(analyzeSite(url));
	}
});

test('returns both strategies with detailed downloadable report text', async () => {
	const originalFetch = globalThis.fetch;
	const requestedStrategies = [];
	globalThis.fetch = async (input) => {
		const strategy = new URL(input).searchParams.get('strategy');
		requestedStrategies.push(strategy);
		return mockResponse(strategy);
	};
	try {
		const result = await analyzeSite('example.com');
		assert.deepEqual(requestedStrategies.sort(), ['desktop', 'mobile']);
		assert.equal(result.reports.length, 2);
		assert.equal(
			result.reports.find((item) => item.strategy === 'mobile').scores
				.performance,
			72,
		);
		assert.equal(
			result.reports.find((item) => item.strategy === 'desktop').scores
				.performance,
			94,
		);
		assert.match(result.reportText, /MOBILE REPORT/);
		assert.match(result.reportText, /DESKTOP REPORT/);
		assert.match(result.reportText, /Potential byte savings: 21 KiB/);
		assert.match(result.reportText, /Improve image delivery/);
		assert.match(result.reportText, /A test warning/);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
