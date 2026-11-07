// Agents Runner — замена Claude Code Routines.
// Принимает запуски агентов (POST /run), выполняет их промпты через
// OpenAI-совместимый API (Moonshot/Kimi) с инструментами:
//   log, send_reply, http, mcp, web_search, read_log.
// Телеграм-доступ с этого VPS заблокирован датацентром → send_reply и
// скачивание фото идут через прокси-эндпоинт слушателя (/admin/runner-tg).
//
// Переменные окружения — в /etc/agents/runner.env (см. deploy.sh).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8200);
const BASE_URL = (process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
const API_KEY = process.env.MOONSHOT_API_KEY || '';
const MODEL = process.env.MOONSHOT_MODEL || 'kimi-k2-0905-preview';
const MOCK_MODE = String(process.env.MOCK_MODE || 'false') === 'true';
const RUNNER_TOKEN = process.env.RUNNER_TOKEN || '';
const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/$/, '');
const DEFAULT_CHAT_ID = process.env.DEFAULT_CHAT_ID || '';
const DEADLINE_MS = Number(process.env.RUN_DEADLINE_MS || 9 * 60 * 1000);
const MAX_STEPS = Number(process.env.RUN_MAX_STEPS || 30);

const AGENTS = ['news-digest', 'watchdog', 'shopping', 'grocery', 'travel', 'booking', 'nearby'];

const MCP_SERVERS = {
  vkusvill: 'https://mcp.vkusvill.ru/mcp',
  tutu: 'https://mcp.tutu.ru/mcp',
  dgis: 'http://127.0.0.1:8101/mcp',
  avia: 'http://127.0.0.1:8102/mcp'
};

// ---------- утилиты ----------

function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function makeRunId() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return `${stamp}-${p(crypto.randomInt(10000), 4)}`;
}
function mskTime() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' МСК';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function truncate(s, n = 12000) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + `\n...[обрезано, всего ${s.length} символов]` : s;
}

// ---------- лог в Google Sheets ----------

async function sheetsLog({ agent, status, detail, runId, reply }) {
  const form = new URLSearchParams();
  form.set('token', process.env.SHEETS_LOG_TOKEN || '');
  form.set('agent', agent);
  form.set('status', status);
  form.set('run_id', runId);
  form.set('detail', String(detail || '').slice(0, 500));
  if (reply) form.set('reply', String(reply).slice(0, 4000));
  form.set('timestamp', nowIso());
  try {
    await fetchWithTimeout(process.env.SHEETS_LOG_URL || '', { method: 'POST', body: form }, 15000);
  } catch (e) {
    console.error('sheetsLog failed:', e.message);
  }
}

async function readLogSheet(hours = 48) {
  const url = `${process.env.SHEETS_LOG_URL}?token=${encodeURIComponent(process.env.SHEETS_LOG_TOKEN || '')}`;
  const resp = await fetchWithTimeout(url, {}, 60000);
  const text = await resp.text();
  const data = JSON.parse(text);
  const rows = (data.rows || []).slice(1); // без шапки
  const cutoff = Date.now() - hours * 3600 * 1000;
  return rows
    .filter((r) => Date.parse(r[0]) >= cutoff)
    .map((r) => ({ timestamp_utc: r[0], agent: r[1], status: r[2], detail: r[3], run_id: r[4] }));
}

// ---------- Telegram через слушатель (воркер Cloudflare) ----------

async function workerTelegram(kind, payload) {
  const resp = await fetchWithTimeout(`${WORKER_URL}/admin/runner-tg`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + RUNNER_TOKEN,
      'User-Agent': 'curl/8'
    },
    body: JSON.stringify({ kind, ...payload })
  }, 30000);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`worker runner-tg HTTP ${resp.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ---------- MCP клиент (Streamable HTTP) ----------

const mcpSessions = new Map();

async function mcpRequest(server, method, params, sessionId) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const resp = await fetchWithTimeout(MCP_SERVERS[server], {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params })
  }, 90000);
  if (resp.status === 204) return { data: null, sessionId: resp.headers.get('mcp-session-id') || sessionId };
  const text = await resp.text();
  const ct = resp.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('text/event-stream')) {
    for (const line of text.split('\n')) {
      if (line.startsWith('data:')) {
        try { data = JSON.parse(line.slice(5).trim()); } catch (e) { /* keep last */ }
      }
    }
  } else {
    try { data = JSON.parse(text); } catch (e) { throw new Error(`MCP ${server}: не-JSON ответ: ${truncate(text, 300)}`); }
  }
  return { data, sessionId: resp.headers.get('mcp-session-id') || sessionId };
}

async function mcpInit(server) {
  if (mcpSessions.has(server)) return;
  const { data, sessionId } = await mcpRequest(server, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'agents-runner', version: '1.0.0' }
  });
  if (!data || data.error) throw new Error(`MCP ${server} initialize: ${JSON.stringify(data && data.error)}`);
  await mcpRequest(server, 'notifications/initialized', {}, sessionId);
  mcpSessions.set(server, sessionId);
}

async function mcpCallOnce(server, tool, args) {
  await mcpInit(server);
  const sessionId = mcpSessions.get(server);
  const { data } = await mcpRequest(server, 'tools/call', { name: tool, arguments: args || {} }, sessionId);
  if (!data) throw new Error(`MCP ${server}: пустой ответ`);
  if (data.error) throw new Error(`MCP ${server} ${tool}: ${JSON.stringify(data.error).slice(0, 500)}`);
  const content = (data.result && data.result.content) || [];
  const text = content.map((c) => c.text || '').join('\n');
  try { return JSON.parse(text); } catch (e) { return text; }
}

async function mcpCall(server, tool, args) {
  try {
    return await mcpCallOnce(server, tool, args);
  } catch (e) {
    // сессия протухла (supergateway, таймаут 5 мин) — перелогиниваемся и повторяем
    if (String(e.message || '').includes('Session not found')) {
      mcpSessions.delete(server);
      return await mcpCallOnce(server, tool, args);
    }
    throw e;
  }
}

// ---------- веб-поиск (DuckDuckGo, без ключа) ----------

async function webSearch(query) {
  const q = encodeURIComponent(query);
  const UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
  };
  const clean = (s) => s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ').replace(/&#0183;/g, '·').replace(/&#32;/g, ' ')
    .replace(/\s+/g, ' ').trim();

  // Bing отдаёт ссылки-редиректы /ck/a?...&u=a1<base64url> — раскодируем
  const decodeBing = (href) => {
    try {
      const u = new URL(href.startsWith('http') ? href : 'https://www.bing.com' + href);
      const enc = u.searchParams.get('u');
      if (enc && enc.startsWith('a1')) {
        let b = enc.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        const decoded = Buffer.from(b, 'base64').toString('utf8');
        if (decoded.startsWith('http')) return decoded;
      }
    } catch (e) { /* оставляем как есть */ }
    return href;
  };

  // 1) DuckDuckGo html
  try {
    const resp = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${q}`, { headers: UA }, 20000);
    if (resp.status === 200) {
      const html = await resp.text();
      const results = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(html)) && results.length < 10) {
        let href = m[1];
        const uddg = href.match(/uddg=([^&]+)/);
        if (uddg) href = decodeURIComponent(uddg[1]);
        results.push({ title: clean(m[2]), snippet: clean(m[3]), url: href });
      }
      if (results.length) return results;
    }
  } catch (e) { /* пробуем дальше */ }

  // 2) DuckDuckGo lite
  try {
    const resp = await fetchWithTimeout(`https://lite.duckduckgo.com/lite/?q=${q}`, { headers: UA }, 20000);
    if (resp.status === 200) {
      const html = await resp.text();
      const results = [];
      const liteRe = /<a rel="nofollow" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = liteRe.exec(html)) && results.length < 10) {
        results.push({ title: clean(m[2]), snippet: '', url: m[1] });
      }
      if (results.length) return results;
    }
  } catch (e) { /* пробуем дальше */ }

  // 3) Bing (с датацентровых IP работает стабильнее DDG)
  try {
    const resp = await fetchWithTimeout(`https://www.bing.com/search?q=${q}&setlang=ru&count=20`, { headers: UA }, 20000);
    if (resp.status === 200) {
      const html = await resp.text();
      const chunks = html.split('<li class="b_algo"').slice(1);
      const results = [];
      for (const c of chunks) {
        const m = c.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!m) continue;
        const pm = c.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/) || c.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        results.push({ title: clean(m[2]), snippet: pm ? clean(pm[1]) : '', url: decodeBing(m[1]) });
        if (results.length >= 10) break;
      }
      if (results.length) return results;
    }
  } catch (e) { /* пробуем дальше */ }

  throw new Error('web_search: пусто на всех движках (ddg html, ddg lite, bing) — вероятно, временная антибот-режня датацентрового IP');
}

// ---------- инструменты модели ----------

function buildTools(ctx) {
  return [
    {
      type: 'function',
      function: {
        name: 'log',
        description: 'Отметка в общий лог Google Sheets. Начни с status="started" первым действием. По ходу — status="progress" (коротко, с эмодзи). В конце — итоговый статус success|error|skipped. RUN_ID и метка времени подставляются автоматически.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['started', 'progress', 'success', 'error', 'skipped'] },
            detail: { type: 'string', description: 'Коротко по-русски, до 150 символов (для started — первые 150 символов запроса)' }
          },
          required: ['status', 'detail']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'send_reply',
        description: 'Отправить готовый ответ в Telegram (в тот же чат, reply на исходное сообщение). Используй ровно один раз в конце.',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string', description: 'Текст сообщения (обычный текст, без разметки)' } },
          required: ['text']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'http',
        description: 'Произвольный HTTP-запрос (Apify, Суточно, каталог 2ГИС, админка слушателя и любые другие API).',
        parameters: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            url: { type: 'string' },
            headers: { type: 'object', description: 'Заголовки, например {"Authorization":"Bearer ..."}' },
            body: { type: 'string', description: 'Тело запроса строкой (JSON — строкой)' },
            timeout_sec: { type: 'number', description: 'Таймаут, по умолчанию 60, максимум 180' }
          },
          required: ['method', 'url']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'mcp',
        description: `Вызов инструмента MCP-сервера. Серверы: vkusvill (продукты), tutu (поезда/авиа/отели), dgis (2ГИС), avia (Aviasales/Travelpayouts). Перед первым использованием сервера tutu вызови get_<вид>_instructions. ВАЖНО: координаты в dgis — объекты {lat, lng} (ЧИСЛА), не строки: search_poi({query, center:{lat,lng}, radius}), calculate_route({start:{lat,lng} или "адрес", end: ..., profile:"pedestrian"|"taxi"|"car"}), geocode({query}), reverse_geocode({coordinate:{lat,lng}}).`,
        parameters: {
          type: 'object',
          properties: {
            server: { type: 'string', enum: Object.keys(MCP_SERVERS) },
            tool: { type: 'string' },
            arguments: { type: 'object' }
          },
          required: ['server', 'tool']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Поиск в интернете (DuckDuckGo). Возвращает до 10 результатов: заголовок, сниппет, ссылка.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_log',
        description: 'Прочитать общий лог запусков агентов (Google Sheets) за последние N часов. Только для надзирателя.',
        parameters: {
          type: 'object',
          properties: { hours: { type: 'number', description: 'Сколько часов назад смотреть, по умолчанию 48' } }
        }
      }
    }
  ];
}

async function execTool(name, args, ctx) {
  switch (name) {
    case 'log': {
      const isFinal = ['success', 'error', 'skipped'].includes(args.status);
      await sheetsLog({
        agent: ctx.agent,
        status: args.status,
        detail: args.detail,
        runId: ctx.runId,
        reply: isFinal && args.status !== 'skipped' ? ctx.replyText || '' : ''
      });
      if (isFinal) ctx.finalLogged = args.status;
      if (args.status === 'started') ctx.startedLogged = true;
      return { ok: true };
    }
    case 'send_reply': {
      await workerTelegram('sendMessage', {
        chatId: ctx.chatId,
        text: args.text,
        replyToMessageId: ctx.messageId,
        businessConnectionId: ctx.businessConnectionId,
        disableWebPagePreview: true
      });
      ctx.replyText = args.text;
      return { ok: true };
    }
    case 'http': {
      const timeout = Math.min(Number(args.timeout_sec || 60), 180) * 1000;
      const headers = { 'User-Agent': 'curl/8', ...(args.headers || {}) };
      const resp = await fetchWithTimeout(args.url, {
        method: args.method || 'GET',
        headers,
        body: args.body !== undefined ? args.body : undefined
      }, timeout);
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('text') && !ct.includes('json') && !ct.includes('xml') && !ct.includes('html')) {
        const buf = Buffer.from(await resp.arrayBuffer());
        return { status: resp.status, binary: true, size: buf.length, base64: truncate(buf.toString('base64'), 200000) };
      }
      return { status: resp.status, body: truncate(await resp.text()) };
    }
    case 'mcp':
      return await mcpCall(args.server, args.tool, args.arguments || {});
    case 'web_search':
      return await webSearch(args.query);
    case 'read_log':
      return await readLogSheet(Number(args.hours || 48));
    default:
      throw new Error('unknown tool ' + name);
  }
}

// ---------- промпты ----------

function loadPrompt(agent) {
  const file = path.join(__dirname, 'prompts', agent + '.md');
  let text = fs.readFileSync(file, 'utf8');
  const subs = {
    __APIFY_TOKEN__: process.env.APIFY_TOKEN || '',
    __SUTOCHNO_TOKEN__: process.env.SUTOCHNO_TOKEN || '',
    __DGIS_API_KEY__: process.env.DGIS_API_KEY || '',
    __TELEGRAM_BOT_TOKEN__: process.env.TELEGRAM_BOT_TOKEN || '',
    __SHEETS_LOG_URL__: process.env.SHEETS_LOG_URL || '',
    __SHEETS_LOG_TOKEN__: process.env.SHEETS_LOG_TOKEN || '',
    __WATCHDOG_ADMIN_TOKEN__: process.env.WATCHDOG_ADMIN_TOKEN || '',
    __ADMIN_URL__: WORKER_URL + '/admin',
    __CHAT_ID__: DEFAULT_CHAT_ID
  };
  for (const [k, v] of Object.entries(subs)) text = text.split(k).join(v);
  return text;
}

function buildSystemPrompt(agent) {
  return [
    `Ты — автономный агент «${agent}» личной системы ассистентов. Тебя запустил раннер по запросу из Telegram.`,
    `Сейчас: ${mskTime()} (${nowIso()}).`,
    '',
    loadPrompt(agent),
    '',
    '---',
    'ПРАВИЛА ИСПОЛНЕНИЯ:',
    '1. ПЕРВЫМ вызовом всегда log(status="started", detail=первые 150 символов запроса). RUN_ID подставляется автоматически.',
    '2. Ключевые шаги отмечай log(status="progress", ...). Каждую отметку — РОВНО ОДИН вызов, без повторов.',
    '3. Финальный log(status="success"|"error"|"skipped", detail=итог до 150 символов) — ОБЯЗАТЕЛЕН. При skipped в Telegram НИЧЕГО не отправляй. Точный текст отправленного ответа в лог подставляется автоматически.',
    '4. Ответ пользователю отправляй ТОЛЬКО через send_reply, один раз, в формате из твоего задания. Молчание — только при skipped.',
    '5. Все внешние API вызывай инструментом http (тело JSON — строкой), MCP-инструменты — через mcp, поиск в интернете — через web_search. Секреты в твоём тексте уже подставлены — используй их как есть.',
    '6. Никаких выдуманных данных: только то, что вернули реальные вызовы.'
  ].join('\n');
}

// ---------- запуск агента ----------

const MOCK_REPLIES = {
  'news-digest': '📰 Новости за 06.11.2026\n\n1. Тестовая новость (mock-режим)\n   https://example.com',
  watchdog: null, // фон: ничего не отправляет
  shopping: '🛒 Товар (mock-режим)\n\n1. Ozon · Пример — 1 000 ₽, ★4.8 (10 отзывов)\n   https://example.com\n\n💡 mock',
  grocery: '🛒 Молоко (mock-режим)\n\n1. Молоко — 100 ₽\n   🔗 Корзина: https://example.com',
  travel: '🚆 Москва → СПб (mock-режим)\n\n1. 🚆 «Ласточка» — 15:35 → 21:05, от 2 113 ₽\n   👉 https://example.com',
  booking: '🏡 Москва (mock-режим)\n\n🟢 Суточно\n1. Квартира — 3 000 ₽/ночь\n   https://example.com',
  nearby: '📍 Кофейня рядом (mock-режим)\n\n1. Кофейня — ★4.9 (120 отзывов)\n   🚶 5 мин\n   https://2gis.ru/firm/1'
};

async function runAgent(job) {
  const ctx = {
    agent: job.agent,
    runId: makeRunId(),
    chatId: job.chat_id || DEFAULT_CHAT_ID,
    messageId: job.message_id || '',
    businessConnectionId: job.business_connection_id || '',
    replyText: '',
    finalLogged: null,
    startedLogged: false
  };
  console.log(`[run] ${ctx.agent} ${ctx.runId} started`);
  const startedAt = Date.now();

  try {
    if (MOCK_MODE) {
      await sheetsLog({ agent: ctx.agent, status: 'started', detail: 'mock-режим: ' + String(job.text || 'cron').slice(0, 100), runId: ctx.runId });
      const reply = MOCK_REPLIES[ctx.agent];
      if (reply) {
        await workerTelegram('sendMessage', { chatId: ctx.chatId, text: reply, disableWebPagePreview: true });
        ctx.replyText = reply;
      }
      await sheetsLog({ agent: ctx.agent, status: 'success', detail: 'mock-режим, ок', runId: ctx.runId, reply: ctx.replyText });
      console.log(`[run] ${ctx.agent} ${ctx.runId} mock done`);
      return;
    }

    // фото → base64 data URL
    let photoDataUrl = null;
    if (job.photo_file_id) {
      try {
        const info = await workerTelegram('getFile', { fileId: job.photo_file_id });
        photoDataUrl = info.dataUrl || null;
      } catch (e) {
        console.error('photo fetch failed:', e.message);
      }
    }

    const userContent = [{ type: 'text', text: 'Вызов (JSON):\n' + JSON.stringify(job) }];
    if (photoDataUrl) userContent.push({ type: 'image_url', image_url: { url: photoDataUrl } });

    const messages = [
      { role: 'system', content: buildSystemPrompt(ctx.agent) },
      { role: 'user', content: userContent }
    ];
    const tools = buildTools(ctx);

    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        await sheetsLog({ agent: ctx.agent, status: 'error', detail: 'дедлайн 9 мин, шагов: ' + step, runId: ctx.runId, reply: ctx.replyText });
        console.error(`[run] ${ctx.agent} ${ctx.runId} deadline`);
        return;
      }
      const payload = {
        model: MODEL,
        messages,
        tools,
        max_tokens: 4096,
        parallel_tool_calls: true
      };
      // kimi-k3 допускает только temperature=1 — не шлём параметр, если он не задан явно
      if (process.env.MOONSHOT_TEMPERATURE) payload.temperature = Number(process.env.MOONSHOT_TEMPERATURE);
      // ретрай при 429 (rate limit) — до 3 попыток с паузой 20/40/60 с
      let resp = null;
      let lastText = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        resp = await fetchWithTimeout(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
          body: JSON.stringify(payload)
        }, 180000);
        lastText = await resp.text();
        if (resp.status !== 429) break;
        console.error(`[run] ${ctx.agent} LLM 429, попытка ${attempt}/3`);
        await new Promise((r) => setTimeout(r, 20000 * attempt));
      }
      if (!resp.ok) {
        await sheetsLog({ agent: ctx.agent, status: 'error', detail: `LLM HTTP ${resp.status}: ${truncate(lastText, 200)}`, runId: ctx.runId, reply: ctx.replyText });
        console.error(`[run] ${ctx.agent} LLM HTTP ${resp.status}`);
        return;
      }
      const data = JSON.parse(lastText);
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) {
        await sheetsLog({ agent: ctx.agent, status: 'error', detail: 'пустой ответ LLM', runId: ctx.runId, reply: ctx.replyText });
        return;
      }
      messages.push(msg);
      const toolCalls = msg.tool_calls || [];
      if (!toolCalls.length) {
        // модель закончила без финального log → дозалогируем
        if (!ctx.finalLogged) {
          const status = ctx.replyText ? 'success' : 'error';
          await sheetsLog({
            agent: ctx.agent, status,
            detail: status === 'success' ? 'итог без финального log, ответ отправлен' : 'агент завершил без ответа и без log',
            runId: ctx.runId, reply: ctx.replyText
          });
        }
        console.log(`[run] ${ctx.agent} ${ctx.runId} done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
        return;
      }
      for (const call of toolCalls) {
        const fn = call.function || {};
        let result;
        let isError = false;
        try {
          result = await execTool(fn.name, JSON.parse(fn.arguments || '{}'), ctx);
        } catch (e) {
          isError = true;
          result = { error: String(e.message || e).slice(0, 800) };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, name: fn.name, content: JSON.stringify(result).slice(0, 20000) });
        if (isError) console.error(`[run] ${ctx.agent} tool ${fn.name} failed:`, JSON.stringify(result).slice(0, 300));
      }
    }
    await sheetsLog({ agent: ctx.agent, status: 'error', detail: `лимит шагов ${MAX_STEPS}`, runId: ctx.runId, reply: ctx.replyText });
  } catch (e) {
    console.error(`[run] ${ctx.agent} fatal:`, e);
    try {
      await sheetsLog({ agent: ctx.agent, status: 'error', detail: 'сбой раннера: ' + String(e.message || e).slice(0, 150), runId: ctx.runId, reply: ctx.replyText });
    } catch (e2) { /* ignore */ }
  }
}

// ---------- HTTP-сервер ----------

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const ip = req.socket.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

  if (req.method === 'GET' && (u.pathname === '/health' || u.pathname === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mock: MOCK_MODE, model: MODEL, agents: AGENTS }));
    return;
  }

  if (req.method === 'POST' && u.pathname === '/run') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 100000) req.destroy(); });
    req.on('end', async () => {
      let job;
      try { job = JSON.parse(body); } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'bad json' })); return;
      }
      if (!isLocal) {
        const auth = req.headers.authorization || '';
        if (!RUNNER_TOKEN || auth !== 'Bearer ' + RUNNER_TOKEN) {
          res.writeHead(403); res.end(JSON.stringify({ ok: false, error: 'forbidden' })); return;
        }
      }
      if (!AGENTS.includes(job.agent)) {
        res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'unknown agent' })); return;
      }
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, run_id: 'async' }));
      runAgent(job).catch((e) => console.error('runAgent unhandled:', e));
    });
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({ ok: false }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`agents-runner on 127.0.0.1:${PORT}, model=${MODEL}, mock=${MOCK_MODE}`);
});
