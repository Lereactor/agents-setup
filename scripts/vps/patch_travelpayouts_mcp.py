"""Патч @theyahia/travelpayouts-mcp@2.0.1 на VPS: два несуществующих эндпоинта (404) → рабочие.
Запуск на VPS: python3 - < patch_avia_vps.py (из /opt/mcp/avia/dist/tools)."""
import io
import os
import shutil

os.chdir('/opt/mcp/avia/dist/tools')
for name in ('flights.js', 'lookup.js'):
    if not os.path.exists(name + '.orig'):
        shutil.copy(name, name + '.orig')

p = 'flights.js'
s = io.open(p + '.orig', encoding='utf-8').read()
old = "    const result = await tpGet(`/aviasales/v3/calendar?${q.toString()}`);"
assert s.count(old) == 1
s = s.replace(old, "    // /aviasales/v3/calendar не существует (404) — цены по дням отдаёт grouped_prices (локальный патч)\n"
                   "    q.set(\"group_by\", \"departure_at\");\n"
                   "    const result = await tpGet(`/aviasales/v3/grouped_prices?${q.toString()}`);")
io.open(p, 'w', encoding='utf-8').write(s)

p = 'lookup.js'
s = io.open(p + '.orig', encoding='utf-8').read()
helper = '''
// /aviasales/v3/autocomplete не существует (404) — города и аэропорты отдаёт открытый
// autocomplete.travelpayouts.com/places2 (без токена). Локальный патч.
async function places(term, locale, types) {
    const q = new URLSearchParams({ term, locale });
    for (const t of types) q.append("types[]", t);
    const res = await fetch(`https://autocomplete.travelpayouts.com/places2?${q.toString()}`);
    if (!res.ok) throw new Error(`Travelpayouts autocomplete -> ${res.status}`);
    const rows = await res.json();
    return rows.slice(0, 10).map((r) => ({ type: r.type, code: r.code, name: r.name, city: r.city_name, country: r.country_name }));
}
'''
imp = 'import { tpGet } from "../client.js";'
assert s.count(imp) == 1
s = s.replace(imp, imp + helper)
a = "    const result = await tpGet(`/aviasales/v3/autocomplete?term=${encodeURIComponent(params.query)}&locale=${params.locale}&types[]=airport&types[]=city`);"
b = "    const result = await tpGet(`/aviasales/v3/autocomplete?term=${encodeURIComponent(params.query)}&locale=${params.locale}&types[]=city`);"
assert s.count(a) == 1 and s.count(b) == 1
s = s.replace(a, '    const result = await places(params.query, params.locale, ["airport", "city"]);')
s = s.replace(b, '    const result = await places(params.query, params.locale, ["city"]);')
io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
