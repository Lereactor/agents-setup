'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const STATE_FILE = process.env.UPTIME_STATE_FILE || '/var/lib/agents/uptime.json';
const FAILURE_THRESHOLD = 2;
const TIMEOUT_MS = 12_000;
const DEFAULT_TARGETS = [
  { name: 'Cloudflare Worker', url: 'https://shopping-listener.lev-3d7.workers.dev/?debug=1' },
  { name: 'Agents Runner', url: process.env.RUNNER_HEALTH_URL || 'http://127.0.0.1:8200/health' },
  { name: 'Agents Live', url: 'https://lereactor.github.io/agents-live/' },
];

function targets() {
  if (!process.env.UPTIME_TARGETS_JSON) return DEFAULT_TARGETS;
  const value = JSON.parse(process.env.UPTIME_TARGETS_JSON);
  if (!Array.isArray(value) || !value.length) throw new Error('UPTIME_TARGETS_JSON must be a non-empty array');
  return value;
}

async function check(target) {
  const started = Date.now();
  try {
    const response = await fetch(target.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'Agents-Uptime/1.0' },
    });
    return {
      ok: response.status === 200,
      detail: `HTTP ${response.status}`,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return { ok: false, detail: error.message, durationMs: Date.now() - started };
  }
}

async function sendTelegram(text) {
  const workerUrl = process.env.WORKER_URL;
  const token = process.env.RUNNER_TOKEN;
  const chatId = process.env.DEFAULT_CHAT_ID;
  if (!workerUrl || !token || !chatId) throw new Error('Telegram environment is incomplete');
  const response = await fetch(`${workerUrl.replace(/\/$/, '')}/admin/runner-tg`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'sendMessage', chatId: String(chatId), text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Telegram proxy HTTP ${response.status}: ${body.slice(0, 200)}`);
  const result = JSON.parse(body);
  if (!result.ok) throw new Error(`Telegram proxy: ${result.error || 'unknown error'}`);
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`State reset: ${error.message}`);
    return {};
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, STATE_FILE);
}

async function main() {
  const state = await loadState();
  const results = await Promise.all(targets().map(async (target) => ({ target, result: await check(target) })));
  for (const { target, result } of results) {
    const previous = state[target.name] || { failures: 0, down: false };
    const next = { ...previous, checkedAt: new Date().toISOString(), ...result };
    let alert = '';
    if (result.ok) {
      next.failures = 0;
      if (previous.down) {
        alert = `✅ Восстановлено: ${target.name}\n${target.url}\n${result.detail}, ${result.durationMs} мс`;
        next.down = false;
      }
    } else {
      next.failures = previous.failures + 1;
      if (next.failures >= FAILURE_THRESHOLD && !previous.down) {
        alert = `🚨 Сервис недоступен: ${target.name}\n${target.url}\n${result.detail}\nСбой подтверждён ${next.failures} проверками подряд.`;
        next.down = true;
      }
    }
    if (alert) {
      try {
        await sendTelegram(alert);
      } catch (error) {
        next.down = previous.down;
        console.error(`Alert failed for ${target.name}: ${error.message}`);
      }
    }
    state[target.name] = next;
    console.log(`${next.checkedAt} ${target.name}: ${result.ok ? 'OK' : 'FAIL'} ${result.detail} failures=${next.failures}`);
  }
  await saveState(state);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
