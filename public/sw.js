const CACHE_NAME = 'pagespeed-field-report-v1';
const STATIC_ASSETS = [
	'/',
	'/index.html',
	'/history.html',
	'/batch.html',
	'/app.js',
	'/history.js',
	'/batch.js',
	'/styles.css',
	'/manifest.json',
];

const FONT_URLS = [
	'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap',
];

async function installHandler() {
	const cache = await caches.open(CACHE_NAME);
	await cache.addAll(STATIC_ASSETS);
	for (const url of FONT_URLS) {
		try {
			await cache.add(url);
		} catch {
			// Fonts may fail due to CORS, ignore
		}
	}
	await self.skipWaiting();
}

async function activateHandler() {
	const keys = await caches.keys();
	await Promise.all(
		keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
	);
	await self.clients.claim();
}

async function fetchHandler(event) {
	const { request } = event;
	const url = new URL(request.url);

	if (request.method !== 'GET') {
		return fetch(request);
	}

	if (url.pathname.startsWith('/api/')) {
		try {
			const response = await fetch(request);
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
			return response;
		} catch {
			const cached = await caches.match(request);
			if (cached) return cached;
			return new Response(JSON.stringify({ error: 'Offline - no cached data' }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	}

	const cached = await caches.match(request);
	if (cached) {
		event.waitUntil(
			fetch(request)
				.then((response) => {
					if (response.ok) {
						caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
					}
				})
				.catch(() => {})
		);
		return cached;
	}

	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		if (request.mode === 'navigate') {
			const fallback = await caches.match('/index.html');
			if (fallback) return fallback;
		}
		return new Response('Offline', { status: 503 });
	}
}

self.addEventListener('install', (event) => event.waitUntil(installHandler()));
self.addEventListener('activate', (event) => event.waitUntil(activateHandler()));
self.addEventListener('fetch', (event) => event.respondWith(fetchHandler(event)));