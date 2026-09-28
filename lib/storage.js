import { kv } from '@vercel/kv';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)));
const LOCAL_FILE = resolve(__dirname, '..', 'data', 'history.json');
const HISTORY_KEY = 'pagespeed:history';
const MAX_HISTORY = 500;

const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function ensureLocalFile() {
  try {
    await readFile(LOCAL_FILE, 'utf-8');
  } catch {
    await writeFile(LOCAL_FILE, '[]', 'utf-8');
  }
}

async function readLocal() {
  await ensureLocalFile();
  const content = await readFile(LOCAL_FILE, 'utf-8');
  return JSON.parse(content);
}

async function writeLocal(data) {
  await ensureLocalFile();
  await writeFile(LOCAL_FILE, JSON.stringify(data), 'utf-8');
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

  if (hasKV) {
    await kv.lpush(HISTORY_KEY, JSON.stringify(record));
    await kv.ltrim(HISTORY_KEY, 0, MAX_HISTORY - 1);
  } else {
    const history = await readLocal();
    history.unshift(record);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await writeLocal(history);
  }
  return record;
}

export async function getHistory({ limit = 50, offset = 0 } = {}) {
  if (hasKV) {
    const items = await kv.lrange(HISTORY_KEY, offset, offset + limit - 1);
    return items.map((item) => JSON.parse(item));
  } else {
    const history = await readLocal();
    return history.slice(offset, offset + limit);
  }
}

export async function getRun(id) {
  if (hasKV) {
    const items = await kv.lrange(HISTORY_KEY, 0, -1);
    for (const item of items) {
      const record = JSON.parse(item);
      if (record.id === id) return record;
    }
    return null;
  } else {
    const history = await readLocal();
    return history.find((r) => r.id === id) || null;
  }
}

export async function clearHistory() {
  if (hasKV) {
    await kv.del(HISTORY_KEY);
  } else {
    await writeLocal([]);
  }
}