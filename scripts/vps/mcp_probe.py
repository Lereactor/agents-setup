"""Минимальный MCP-клиент (Streamable HTTP) для проверки marketplace-mcp на VPS.

python3 mcp_probe.py <url> <token> <tenant> list
python3 mcp_probe.py <url> <token> <tenant> call <tool> '<json args>'
"""
import json
import sys
import urllib.request

url, token, tenant, cmd = sys.argv[1:5]
headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': 'Bearer ' + token,
    'X-MCP-Tenant': tenant,
}


def rpc(method, params=None, rid=1):
    body = {'jsonrpc': '2.0', 'method': method}
    if rid is not None:
        body['id'] = rid
    if params is not None:
        body['params'] = params
    req = urllib.request.Request(url, json.dumps(body).encode(), headers)
    resp = urllib.request.urlopen(req, timeout=120)
    sid = resp.headers.get('mcp-session-id')
    if sid:
        headers['mcp-session-id'] = sid
    raw = resp.read().decode()
    if not raw.strip():
        return None
    if raw.lstrip().startswith('{'):
        return json.loads(raw)
    # SSE: сначала могут идти уведомления (notifications/message) — берём ответ с id
    msgs = [json.loads(line[5:]) for line in raw.splitlines() if line.startswith('data:')]
    return next((m for m in msgs if 'id' in m), msgs[-1] if msgs else raw)


rpc('initialize', {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'probe', 'version': '1'}})
rpc('notifications/initialized', rid=None)
if cmd == 'list':
    for t in rpc('tools/list', {}, 2)['result']['tools']:
        print(t['name'], '-', (t.get('description') or '')[:90].replace('\n', ' '))
else:
    res = rpc('tools/call', {'name': sys.argv[5], 'arguments': json.loads(sys.argv[6])}, 3)
    print(json.dumps(res, ensure_ascii=False)[:3000])
