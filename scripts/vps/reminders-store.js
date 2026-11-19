'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STORE_FILE = process.env.REMINDERS_FILE || '/var/lib/agents/reminders.json';
const LOCK_FILE = `${STORE_FILE}.lock`;

async function readAll() {
  try {
    const value = JSON.parse(await fs.readFile(STORE_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

async function writeAll(items) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true, mode: 0o700 });
  const temporary = `${STORE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(items, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, STORE_FILE);
}

async function withLock(operation) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true, mode: 0o700 });
  let handle;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      handle = await fs.open(LOCK_FILE, 'wx', 0o600);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const stat = await fs.stat(LOCK_FILE);
        if (Date.now() - stat.mtimeMs > 30_000) await fs.unlink(LOCK_FILE);
      } catch (statError) {
        if (statError.code !== 'ENOENT') throw statError;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!handle) throw new Error('reminders store lock timeout');
  try {
    const items = await readAll();
    const cutoff = Date.now() - 7 * 86400_000;
    const active = items.filter((item) => item.status === 'pending' || Date.parse(item.updated_at) >= cutoff);
    const result = await operation(active);
    await writeAll(active);
    return result;
  } finally {
    await handle.close();
    await fs.unlink(LOCK_FILE).catch(() => {});
  }
}

function validateDueAt(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value || '')) {
    throw new Error('due_at must include timezone offset');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('invalid due_at');
  if (timestamp <= Date.now()) throw new Error('reminder time is in the past');
  if (timestamp > Date.now() + 5 * 365 * 86400_000) throw new Error('reminder is too far in the future');
  return new Date(timestamp).toISOString();
}

async function addReminder({ chatId, businessConnectionId = '', text, dueAt }) {
  const cleanText = String(text || '').trim();
  if (!cleanText || cleanText.length > 500) throw new Error('reminder text must contain 1..500 characters');
  if (!chatId) throw new Error('chat_id is required');
  const reminder = {
    id: crypto.randomUUID().slice(0, 8),
    chat_id: String(chatId),
    business_connection_id: businessConnectionId || '',
    text: cleanText,
    due_at: validateDueAt(dueAt),
    status: 'pending',
    attempts: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await withLock(async (items) => items.push(reminder));
  return reminder;
}

async function listReminders(chatId) {
  const items = await readAll();
  return items
    .filter((item) => item.status === 'pending' && item.chat_id === String(chatId))
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
    .map(({ id, text, due_at }) => ({ id, text, due_at }));
}

async function cancelReminder(chatId, id) {
  return withLock(async (items) => {
    const reminder = items.find((item) => item.id === String(id) && item.chat_id === String(chatId) && item.status === 'pending');
    if (!reminder) return { ok: false, error: 'reminder not found' };
    reminder.status = 'canceled';
    reminder.updated_at = new Date().toISOString();
    return { ok: true, id: reminder.id };
  });
}

async function dueReminders(now = Date.now()) {
  const items = await readAll();
  return items.filter((item) => item.status === 'pending' && Date.parse(item.due_at) <= now).slice(0, 50);
}

async function markDelivery(id, delivered, error = '') {
  return withLock(async (items) => {
    const reminder = items.find((item) => item.id === id && item.status === 'pending');
    if (!reminder) return;
    reminder.attempts += 1;
    reminder.updated_at = new Date().toISOString();
    if (delivered) {
      reminder.status = 'sent';
      reminder.delivered_at = reminder.updated_at;
      delete reminder.last_error;
    } else {
      reminder.last_error = String(error).slice(0, 200);
    }
  });
}

module.exports = { addReminder, listReminders, cancelReminder, dueReminders, markDelivery };
