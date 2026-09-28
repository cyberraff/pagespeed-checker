import { kv } from '@vercel/kv';

const HISTORY_KEY = 'pagespeed:history';
const MAX_HISTORY = 500;

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

  await kv.lpush(HISTORY_KEY, JSON.stringify(record));
  await kv.ltrim(HISTORY_KEY, 0, MAX_HISTORY - 1);
  return record;
}

export async function getHistory({ limit = 50, offset = 0 } = {}) {
  const items = await kv.lrange(HISTORY_KEY, offset, offset + limit - 1);
  return items.map((item) => JSON.parse(item));
}

export async function getRun(id) {
  const items = await kv.lrange(HISTORY_KEY, 0, -1);
  for (const item of items) {
    const record = JSON.parse(item);
    if (record.id === id) return record;
  }
  return null;
}

export async function clearHistory() {
  await kv.del(HISTORY_KEY);
}