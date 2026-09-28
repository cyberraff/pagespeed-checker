import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSite } from './lib/pagespeed.js';
import { saveRun, getHistory, getRun, clearHistory } from './lib/storage.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'public');
const mimeTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
};

async function readJson(request) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > 10_000) throw new Error('Request is too large.');
	}
	return JSON.parse(body || '{}');
}

function writeJson(response, status, data) {
	response.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
	});
	response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
	const url = new URL(request.url, 'http://localhost');
	const pathname = url.pathname;

	response.setHeader('X-Content-Type-Options', 'nosniff');
	response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

	if (pathname === '/health') {
		response.writeHead(200, {
			'Content-Type': 'text/plain; charset=utf-8',
		});
		response.end('ok');
		return;
	}

	if (pathname === '/api/analyze' && request.method === 'POST') {
		try {
			const { url: inputUrl } = await readJson(request);
			if (typeof inputUrl !== 'string' || !inputUrl.trim()) {
				return writeJson(response, 400, {
					error: 'Enter a website address to inspect.',
				});
			}
			const result = await analyzeSite(inputUrl.trim());
			await saveRun(result);
			return writeJson(response, 200, result);
		} catch (error) {
			const status =
				/valid website|public website|publicly accessible|private address|request is too large/i.test(
					error.message,
				)
					? 400
					: 502;
			return writeJson(response, status, {
				error: error.message || 'Inspection failed.',
			});
		}
	}

	if (pathname === '/api/history' && request.method === 'GET') {
		try {
			const limit = Math.min(
				Number(url.searchParams.get('limit')) || 50,
				200,
			);
			const offset = Number(url.searchParams.get('offset')) || 0;
			const history = await getHistory({ limit, offset });
			return writeJson(response, 200, { history });
		} catch (error) {
			console.error('History error:', error);
			return writeJson(response, 500, {
				error: 'Failed to load history.',
			});
		}
	}

	if (pathname.startsWith('/api/history/') && request.method === 'GET') {
		try {
			const id = pathname.split('/api/history/')[1];
			const run = await getRun(id);
			if (!run)
				return writeJson(response, 404, { error: 'Run not found.' });
			return writeJson(response, 200, run);
		} catch (error) {
			return writeJson(response, 500, { error: 'Failed to load run.' });
		}
	}

	if (pathname === '/api/batch' && request.method === 'POST') {
		try {
			const { urls } = await readJson(request);
			if (!Array.isArray(urls) || urls.length === 0) {
				return writeJson(response, 400, {
					error: 'Provide an array of URLs (max 10).',
				});
			}
			if (urls.length > 10) {
				return writeJson(response, 400, {
					error: 'Maximum 10 URLs per batch.',
				});
			}
			const results = [];
			for (const inputUrl of urls) {
				if (typeof inputUrl !== 'string' || !inputUrl.trim()) continue;
				try {
					const result = await analyzeSite(inputUrl.trim());
					await saveRun(result);
					results.push({ url: inputUrl.trim(), result, error: null });
				} catch (error) {
					results.push({
						url: inputUrl.trim(),
						result: null,
						error: error.message,
					});
				}
			}
			return writeJson(response, 200, { results });
		} catch (error) {
			return writeJson(response, 500, {
				error: 'Batch analysis failed.',
			});
		}
	}

	if (pathname === '/api/history' && request.method === 'DELETE') {
		try {
			await clearHistory();
			return writeJson(response, 200, { ok: true });
		} catch (error) {
			return writeJson(response, 500, {
				error: 'Failed to clear history.',
			});
		}
	}

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.writeHead(405, { Allow: 'GET, HEAD, POST, DELETE' });
		response.end();
		return;
	}

	const file = pathname === '/' ? 'index.html' : pathname.slice(1);
	if (
		![
			'index.html',
			'app.js',
			'styles.css',
			'history.html',
			'batch.html',
			'manifest.json',
			'sw.js',
		].includes(file)
	) {
		response.writeHead(404);
		response.end('Not found');
		return;
	}
	try {
		const contents = await readFile(resolve(root, file));
		response.writeHead(200, {
			'Content-Type': mimeTypes[extname(file)],
			'Cache-Control': file.endsWith('.html')
				? 'no-cache'
				: 'public, max-age=3600',
		});
		response.end(request.method === 'HEAD' ? undefined : contents);
	} catch {
		response.writeHead(404);
		response.end('Not found');
	}
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => {
	console.log(`PageSpeed report app listening on http://localhost:${port}`);
});
