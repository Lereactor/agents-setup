// Прогон внешних зависимостей раннера с VPS. Читает /etc/agents/runner.env.
const fs = require('fs');

const env = {};
for (const line of fs.readFileSync('/etc/agents/runner.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function probe(name, fn) {
  try {
    const r = await fn();
    console.log(`OK   ${name}: ${r}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${String(e.message || e).slice(0, 200)}`);
  }
}

async function mcp(server, url, tool, args) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  let sessionId;
  const init = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'probe', version: '1' } } }) });
  sessionId = init.headers.get('mcp-session-id');
  const initText = await init.text();
  await fetch(url, { method: 'POST', headers: { ...headers, 'Mcp-Session-Id': sessionId }, body: JSON.stringify({ jsonrpc: '2.0', id: '2', method: 'notifications/initialized' }) });
  const call = await fetch(url, { method: 'POST', headers: { ...headers, 'Mcp-Session-Id': sessionId }, body: JSON.stringify({ jsonrpc: '2.0', id: '3', method: 'tools/call', params: { name: tool, arguments: args } }) });
  const text = await call.text();
  let parsed = null;
  const ct = call.headers.get('content-type') || '';
  if (ct.includes('event-stream')) {
    for (const ln of text.split('\n')) if (ln.startsWith('data:')) { try { parsed = JSON.parse(ln.slice(5).trim()); } catch (e) {} }
  } else { try { parsed = JSON.parse(text); } catch (e) {} }
  return { http: call.status, sessionId: !!sessionId, hasResult: !!(parsed && parsed.result), error: parsed && parsed.error, preview: text.slice(0, 150) };
}

(async () => {
  await probe('duckduckgo html', async () => {
    const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent('кремль новости'), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    const n = (t.match(/result__a/g) || []).length;
    return `HTTP ${r.status}, result__a: ${n}`;
  });
  await probe('duckduckgo lite', async () => {
    const r = await fetch('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent('кремль новости'), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    const n = (t.match(/result-link/g) || []).length;
    return `HTTP ${r.status}, длина ${t.length}, result-link: ${n}`;
  });
  await probe('mojeek (запасной поиск)', async () => {
    const r = await fetch('https://www.mojeek.com/search?q=' + encodeURIComponent('кремль новости'), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return `HTTP ${r.status}, длина ${t.length}`;
  });
  await probe('sutochno', async () => {
    const r = await fetch('https://sutochno.ru/api/rest/search/getTermSuggestionsWithBoundingBox?query=' + encodeURIComponent('Казань'), { headers: { 'api-version': '2.1', platform: 'js', token: env.SUTOCHNO_TOKEN, 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    return `HTTP ${r.status}, ${t.slice(0, 80)}`;
  });
  await probe('2gis catalog', async () => {
    const r = await fetch('https://catalog.api.2gis.com/3.0/items/byid?id=4504235282630173&fields=items.reviews&key=' + env.DGIS_API_KEY, { signal: AbortSignal.timeout(15000) });
    return `HTTP ${r.status} ${(await r.text()).slice(0, 100)}`;
  });
  await probe('apify limits', async () => {
    const r = await fetch('https://api.apify.com/v2/users/me/limits', { headers: { Authorization: 'Bearer ' + env.APIFY_TOKEN }, signal: AbortSignal.timeout(20000) });
    const d = await r.json();
    return `HTTP ${r.status}, usage ${d.data.current.monthlyUsageUsd} of ${d.data.limits.maxMonthlyUsageUsd}`;
  });
  await probe('moonshot (без ключа ждём 401)', async () => {
    const r = await fetch('https://api.moonshot.ai/v1/models', { signal: AbortSignal.timeout(15000) });
    return `HTTP ${r.status}`;
  });
  await probe('mcp vkusvill products_search', async () => {
    const r = await mcp('vkusvill', 'https://mcp.vkusvill.ru/mcp', 'vkusvill_products_search', { query: 'молоко' });
    return `http=${r.http} session=${r.sessionId} hasResult=${r.hasResult} err=${JSON.stringify(r.error || '').slice(0, 120)}`;
  });
  await probe('mcp tutu tools/list', async () => {
    const r = await mcp('tutu', 'https://mcp.tutu.ru/mcp', 'search_rail', {});
    return `http=${r.http} session=${r.sessionId} hasResult=${r.hasResult} err=${JSON.stringify(r.error || '').slice(0, 150)}`;
  });
  await probe('mcp dgis 2gis search_poi', async () => {
    const r = await mcp('dgis', 'http://127.0.0.1:8101/mcp', 'search_poi', { query: 'кофейня', center: '55.7558,37.6173', radius: 500 });
    return `http=${r.http} session=${r.sessionId} hasResult=${r.hasResult} err=${JSON.stringify(r.error || '').slice(0, 120)}`;
  });
})();
