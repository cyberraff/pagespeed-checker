import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSite } from './lib/pagespeed.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'public');
const mimeTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
};

async function readJson(request) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > 10_000) throw new Error('Request is too large.');
	}
	return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
	const pathname = new URL(request.url, 'http://localhost').pathname;
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
			const { url } = await readJson(request);
			if (typeof url !== 'string' || !url.trim()) {
				response.writeHead(400, { 'Content-Type': 'application/json' });
				response.end(
					JSON.stringify({
						error: 'Enter a website address to inspect.',
					}),
				);
				return;
			}
			const result = await analyzeSite(url.trim());
			response.writeHead(200, {
				'Content-Type': 'application/json; charset=utf-8',
			});
			response.end(JSON.stringify(result));
		} catch (error) {
			const status =
				/valid website|public website|publicly accessible|private address|request is too large/i.test(
					error.message,
				)
					? 400
					: 502;
			response.writeHead(status, {
				'Content-Type': 'application/json; charset=utf-8',
			});
			response.end(
				JSON.stringify({
					error: error.message || 'Inspection failed.',
				}),
			);
		}
		return;
	}

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.writeHead(405, { Allow: 'GET, HEAD, POST' });
		response.end();
		return;
	}

	const file = pathname === '/' ? 'index.html' : pathname.slice(1);
	if (!['index.html', 'app.js', 'styles.css'].includes(file)) {
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
