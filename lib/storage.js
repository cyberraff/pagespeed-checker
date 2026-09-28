import Redis from 'ioredis';

let redisClient;

function getRedis() {
  if (redisClient) return redisClient;
  const url = process.env.KV_URL || process.env.REDIS_URL;
  if (!url) throw new Error('KV_URL or REDIS_URL must be set');
  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    connectTimeout: 10000,
    lazyConnect: true,
  });
  return redisClient;
}

const HISTORY_KEY = 'pagespeed:history';
const MAX_HISTORY = 500;

async function ensureConnected() {
  const client = getRedis();
  if (client.status === 'wait') {
    await client.connect();
  }
}

export async function saveRun(run) {
  const id = crypto.randomUUID();
  const record = {
    id,
    url: run.url,
    generatedAt: run.generatedAt,
    reports: run.reports.map((r) => ({
      strategy: r.strategy,
      finalUrl: r.finalUrl,
      fetchTimeMs: r.fetchTimeMs,
      lighthouseVersion: r.lighthouseVersion,
      hostUserAgent: r.hostUserAgent,
      scores: r.scores,
      metrics: r.metrics,
      opportunities: r.opportunities,
      warnings: r.warnings,
      error: r.error,
    })),
  };

  await ensureConnected();
  const client = getRedis();
  await client.lpush(HISTORY_KEY, JSON.stringify(record));
  await client.ltrim(HISTORY_KEY, 0, MAX_HISTORY - 1);
  return record;
}

export async function getHistory({ limit = 50, offset = 0 } = {}) {
  await ensureConnected();
  const client = getRedis();
  const items = await client.lrange(HISTORY_KEY, offset, offset + limit - 1);
  return items.map((item) => JSON.parse(item));
}

export async function getRun(id) {
  await ensureConnected();
  const client = getRedis();
  const items = await client.lrange(HISTORY_KEY, 0, -1);
  for (const item of items) {
    const record = JSON.parse(item);
    if (record.id === id) return record;
  }
  return null;
}

export async function clearHistory() {
  await ensureConnected();
  const client = getRedis();
  await client.del(HISTORY_KEY);
}

export async function deleteRun(id) {
  await ensureConnected();
  const client = getRedis();
  const items = await client.lrange(HISTORY_KEY, 0, -1);
  for (const item of items) {
    const record = JSON.parse(item);
    if (record.id === id) {
      await client.lrem(HISTORY_KEY, 1, item);
      return true;
    }
  }
  return false;
}