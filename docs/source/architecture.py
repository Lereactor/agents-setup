"""Архитектура «Персональных ассистентов»: 4 страницы A4 альбомные.

1) где что находится и как связано; 2) путь сообщения — где отсекается бесплатно и где тратятся
токены Claude, Whisper и деньги Apify.

python docs/source/architecture.py "docs/Архитектура-ассистентов.pdf"
"""
import math
import sys

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import registerFont, stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

registerFont(TTFont("R", "C:/Windows/Fonts/segoeui.ttf"))
registerFont(TTFont("B", "C:/Windows/Fonts/segoeuib.ttf"))

INK = HexColor("#1B2333")
MUTED = HexColor("#6B7385")
LINE = HexColor("#C9CFDB")
PANEL = HexColor("#F3F5F9")
NAVY = HexColor("#141A33")
TG = HexColor("#2AABEE")
TG_DARK = HexColor("#147FB8")
CF = HexColor("#F38020")  # Cloudflare
ANT = HexColor("#C2593A")  # Anthropic / токены Claude
WAI = HexColor("#8A63D2")  # Workers AI (Whisper)
APIFY = HexColor("#D4A017")  # деньги Apify
GOOGLE = HexColor("#2E9E5B")
GH = HexColor("#3A3F4B")
FREE = HexColor("#2E9E5B")
GREY = HexColor("#8A93A6")

AGENT = {
    "shopping": HexColor("#3D8BFF"),
    "grocery": HexColor("#3FB45F"),
    "travel": HexColor("#1FB3C8"),
    "booking": HexColor("#F07A52"),
    "news": HexColor("#F0A23A"),
    "watchdog": HexColor("#8A63D2"),
}

W, H = landscape(A4)
M = 30
c = canvas.Canvas(sys.argv[1], pagesize=(W, H))
c.setTitle("Персональные ассистенты — архитектура")
c.setAuthor("Персональные ассистенты")


# ---------------- примитивы ----------------
def text(x, y, s, font="R", size=10, color=INK, anchor="l"):
    c.setFont(font, size)
    c.setFillColor(color)
    {"l": c.drawString, "c": c.drawCentredString, "r": c.drawRightString}[anchor](x, y, s)


def wrap(s, font, size, width):
    lines, cur = [], ""
    for word in s.split():
        trial = f"{cur} {word}".strip()
        if stringWidth(trial, font, size) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + [cur]


def para(x, y, s, width, font="R", size=8, color=INK, lead=None, anchor="l"):
    lead = lead or size * 1.28
    lines = wrap(s, font, size, width)
    for i, line in enumerate(lines):
        text(x, y - i * lead, line, font, size, color, anchor)
    return y - len(lines) * lead


def box(x, y, w, h, fill=white, stroke=LINE, r=7, lw=1, dash=None):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(lw)
    if dash:
        c.setDash(*dash)
    c.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1)
    c.setDash()


def tint(color, a):
    return Color(color.red, color.green, color.blue, alpha=a)


def zone(x, y, w, h, color, title, sub=""):
    box(x, y, w, h, tint(color, 0.06), tint(color, 0.55), r=10, lw=1.1)
    c.setFillColor(color)
    c.roundRect(x, y + h - 20, w, 20, 10, stroke=0, fill=1)
    c.rect(x, y + h - 20, w, 10, stroke=0, fill=1)
    text(x + 9, y + h - 14, title, "B", 8.6, white)
    if sub:
        text(x + w - 8, y + h - 14, sub, "R", 7, white, "r")


def arrow(x1, y1, x2, y2, color=INK, lw=1.2, head=5, dash=None):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(lw)
    ang = math.atan2(y2 - y1, x2 - x1)
    bx, by = x2 - head * math.cos(ang), y2 - head * math.sin(ang)
    if dash:
        c.setDash(*dash)
    c.line(x1, y1, bx, by)
    c.setDash()
    p = c.beginPath()
    p.moveTo(x2, y2)
    for side in (1, -1):
        p.lineTo(bx + side * head * 0.6 * math.sin(ang), by - side * head * 0.6 * math.cos(ang))
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def poly_arrow(points, color=INK, lw=1.2, dash=None, head=5):
    """Ломаная со стрелкой на последнем отрезке."""
    c.setStrokeColor(color)
    c.setLineWidth(lw)
    if dash:
        c.setDash(*dash)
    for (x1, y1), (x2, y2) in zip(points[:-2], points[1:-1]):
        c.line(x1, y1, x2, y2)
    c.setDash()
    (x1, y1), (x2, y2) = points[-2], points[-1]
    arrow(x1, y1, x2, y2, color, lw, head, dash)


def label(x, y, s, color=MUTED, size=6.8, anchor="c", bg=white):
    w = stringWidth(s, "R", size)
    lx = {"c": x - w / 2, "l": x, "r": x - w}[anchor]
    c.setFillColor(bg)
    c.rect(lx - 2, y - 2, w + 4, size + 3, stroke=0, fill=1)
    text(x, y, s, "R", size, color, anchor)


def badge(x, y, kind, size=6.3):
    """Маркер расхода: Claude-токены / Whisper / Apify $ / бесплатно."""
    spec = {
        "claude": (ANT, "токены Claude"),
        "whisper": (WAI, "Whisper"),
        "apify": (APIFY, "Apify $"),
        "free": (FREE, "0 токенов"),
    }[kind]
    color, s = spec
    w = stringWidth(s, "B", size) + 9
    c.setFillColor(color)
    c.roundRect(x, y, w, size + 5, 4, stroke=0, fill=1)
    text(x + 4.5, y + 3.2, s, "B", size, white)
    return w


def node(x, y, w, h, title, sub="", color=INK, fill=white, stroke=LINE, tsize=8.2, ssize=6.8):
    box(x, y, w, h, fill, stroke, r=6)
    if sub:
        text(x + 7, y + h - 12, title, "B", tsize, color)
        para(x + 7, y + h - 22, sub, w - 14, size=ssize, color=MUTED, lead=ssize * 1.25)
    else:
        text(x + w / 2, y + h / 2 - 3, title, "B", tsize, color, "c")


def dot(x, y, color, r=3.2):
    c.setFillColor(color)
    c.circle(x, y, r, stroke=0, fill=1)


def header(title, subtitle, page):
    c.setFillColor(NAVY)
    c.rect(0, H - 58, W, 58, stroke=0, fill=1)
    text(M, H - 30, title, "B", 18, white)
    text(M, H - 47, subtitle, "R", 9.5, HexColor("#C9D3F5"))
    text(W - M, H - 30, f"Персональные ассистенты · архитектура · {page}/4", "R", 8, HexColor("#AFC0FF"), "r")


def legend(y):
    x = M
    text(x, y + 2, "Маркеры:", "B", 7.5, MUTED)
    x += 44
    for kind, desc in (("claude", "сессия модели Claude — расход лимита подписки"),
                       ("whisper", "распознавание голоса, Cloudflare Workers AI"),
                       ("apify", "платные скраперы, кредит Apify"),
                       ("free", "без AI, ничего не тратится")):
        x += badge(x, y - 1, kind) + 4
        text(x, y + 2, desc, "R", 7, MUTED)
        x += stringWidth(desc, "R", 7) + 14


# =====================================================================
# Страница 1 — где что находится
# =====================================================================
header("Где что находится и как связано",
       "Шесть агентов живут в облаке Anthropic; слушатель в Cloudflare принимает сообщения и решает, кого будить", 1)

TOP = H - 72
BOT = 40

# --- Telegram ---
tgx, tgy, tgw, tgh = M, 300, 150, TOP - 300
zone(tgx, tgy, tgw, tgh, TG, "Telegram", "облако Telegram")
node(tgx + 10, tgy + tgh - 74, tgw - 20, 46, "Группа ассистентов",
     "вы пишете текст, голос или фото; бот отвечает в ветке сообщения", TG_DARK)
node(tgx + 10, tgy + tgh - 132, tgw - 20, 50, "Бот (Bot API)",
     "webhook на слушатель; sendMessage — ответы агентов и «Принял»", TG_DARK)
node(tgx + 10, tgy + 10, tgw - 20, 52, "Ответы",
     "подборки со ссылками; утренний отчёт надзирателя; дайджест новостей", TG_DARK)

# --- Cloudflare ---
cfx, cfy, cfw, cfh = 205, 300, 190, TOP - 300
zone(cfx, cfy, cfw, cfh, CF, "Cloudflare", "Worker + KV + Workers AI")
wk_y = cfy + cfh - 112
node(cfx + 10, wk_y, cfw - 20, 84, "Слушатель (Worker)",
     "фильтр без AI: дубли, боты, «помощь», «включи…», слова-триггеры; делит сообщение на задачи; "
     "«Принял» за 1–2 с; служебный /admin для надзирателя", INK)
badge(cfx + cfw - 72, wk_y + 70, "free")
node(cfx + 10, cfy + 64, cfw - 20, 44, "Whisper (Workers AI)", "только для голосовых: голос → текст", WAI)
badge(cfx + cfw - 60, cfy + 94, "whisper")
node(cfx + 10, cfy + 10, cfw - 20, 46, "KV-хранилище",
     "дубли update_id, паузы агентов, запуски за 2 суток (для повтора)", INK)

# --- Anthropic ---
ax, ay, aw, ah = 420, 132, 220, TOP - 132
zone(ax, ay, aw, ah, ANT, "Anthropic · Claude Code Routines", "облако")
badge(ax + 10, ay + ah - 37, "claude")
text(ax + 74, ay + ah - 34, "каждый запуск = сессия Claude (Sonnet)", "R", 7, MUTED)
text(ax + 10, ay + ah - 52, "ПО СООБЩЕНИЮ (fire API от слушателя)", "B", 7, MUTED)
agents_event = [("shopping", "Покупки", "Ozon · WB · Я.Маркет", True),
                ("grocery", "Продукты", "ВкусВилл MCP", False),
                ("travel", "Поездки", "Туту MCP", False),
                ("booking", "Жильё", "Суточно · Островок · Авито · Туту", True)]
agent_mid = {}
yy = ay + ah - 60
for key, name, src, paid in agents_event:
    yy -= 30
    box(ax + 10, yy, aw - 20, 26, white, LINE, 5)
    dot(ax + 20, yy + 13, AGENT[key], 4.5)
    text(ax + 30, yy + 15, name, "B", 8.2)
    text(ax + 30, yy + 5.5, src, "R", 6.8, MUTED)
    if paid:
        badge(ax + aw - 58, yy + 8, "apify")
    agent_mid[key] = yy + 13
yy -= 18
text(ax + 10, yy, "ПО РАСПИСАНИЮ (cron)", "B", 7, MUTED)
for key, name, src in (("news", "Новости", "каждый день 08:00 · веб-поиск"),
                       ("watchdog", "Надзиратель", "каждые 6 ч · отчёт в 09:00 · читает журнал")):
    yy -= 32
    box(ax + 10, yy, aw - 20, 26, white, LINE, 5)
    dot(ax + 20, yy + 13, AGENT[key], 4.5)
    text(ax + 30, yy + 15, name, "B", 8.2)
    text(ax + 30, yy + 5.5, src, "R", 6.8, MUTED)
    agent_mid[key] = yy + 13
para(ax + 10, ay + 30, "секреты (бот, журнал) — в окружении облака; у каждого агента свой сценарий и "
     "разрешённые инструменты", aw - 20, size=6.8, color=MUTED)

# --- Источники ---
sx, sy, sw, sh = 665, 250, W - M - 665, TOP - 250
zone(sx, sy, sw, sh, HexColor("#4B5878"), "Источники данных")
srcs = [("Туту MCP", "поезда, авиа, автобусы, отели; ссылки на покупку", None),
        ("ВкусВилл MCP", "товары, корзина-ссылка", None),
        ("Apify", "Ozon, WB, Я.Маркет, Островок, Авито; ≤ $0,10 за вызов", "apify"),
        ("API Суточно", "поиск жилья, открытый API сайта", None),
        ("Веб-поиск", "для новостей", None)]
yy = sy + sh - 26
src_mid = {}
for name, sub, kind in srcs:
    yy -= 40
    node(sx + 8, yy, sw - 16, 36, name, sub)
    if kind:
        badge(sx + sw - 56, yy + 23, kind)
    src_mid[name] = yy + 18

# --- Google ---
gx, gy, gw, gh = 205, BOT + 14, 190, 220
zone(gx, gy, gw, gh, GOOGLE, "Google", "Apps Script + Sheets")
node(gx + 10, gy + gh - 86, gw - 20, 58, "Журнал запусков",
     "started → шаги → итог (success / skipped / error) + текст ответа; пишут все агенты", GOOGLE)
node(gx + 10, gy + 14, gw - 20, 54, "Apps Script",
     "приём записей и выдача журнала по токену; 0 AI", INK)
badge(gx + gw - 66, gy + 55, "free")

# --- GitHub ---
hx, hy, hw, hh = 665, BOT + 14, W - M - 665, 182
zone(hx, hy, hw, hh, GH, "GitHub")
node(hx + 8, hy + hh - 84, hw - 16, 56, "Веб-панель (Pages)",
     "живая схема, история, проигрывание; данные зашифрованы, вход по паролю", INK)
node(hx + 8, hy + 12, hw - 16, 52, "Репозиторий",
     "код слушателя, сайта, документация; сценарии агентов — копии", INK)

# --- Ваш ПК ---
px, py, pw, ph = M, BOT + 14, 150, 220
zone(px, py, pw, ph, GREY, "Ваш компьютер", "разработка")
node(px + 10, py + ph - 94, pw - 20, 66, "Claude Code",
     "меняет код и сценарии, выкладывает слушатель, сайт, агентов", INK)
node(px + 10, py + 14, pw - 20, 58, "Ключи локально",
     "в .gitignore: Cloudflare, Apify, токены запуска", INK)

# ---------------- связи ----------------
wk_cx, wk_cy = cfx + cfw / 2, wk_y + 42
# Telegram → слушатель
arrow(tgx + tgw - 10, tgy + tgh - 51, cfx + 10, wk_y + 64, TG_DARK)
label((tgx + tgw + cfx) / 2 + 4, tgy + tgh - 44, "webhook", TG_DARK)
# слушатель → Telegram (Принял)
arrow(cfx + 10, wk_y + 20, tgx + tgw - 10, tgy + tgh - 110, CF, dash=(3, 2))
label((tgx + tgw + cfx) / 2 + 2, wk_y + 6, "«Принял»", CF)
# слушатель → whisper
arrow(cfx + 30, wk_y, cfx + 30, cfy + 108, WAI, head=4)
# слушатель → агенты по событию
for key, *_ in agents_event:
    arrow(cfx + cfw - 10, wk_cy, ax + 10, agent_mid[key], AGENT[key], lw=1.1, head=4.5)
label(cfx + cfw + 12, wk_cy + 22, "fire API", INK, anchor="c")
# агенты → источники
for key, target in (("shopping", "Apify"), ("grocery", "ВкусВилл MCP"), ("travel", "Туту MCP"),
                    ("booking", "API Суточно"), ("news", "Веб-поиск")):
    arrow(ax + aw - 10, agent_mid[key], sx + 8, src_mid[target], tint(AGENT[key], 0.9), lw=1, head=4)
arrow(ax + aw - 10, agent_mid["booking"] - 3, sx + 8, src_mid["Apify"] - 5, tint(AGENT["booking"], 0.9), lw=1, head=4)
arrow(ax + aw - 10, agent_mid["booking"] - 6, sx + 8, src_mid["Туту MCP"] - 6, tint(AGENT["booking"], 0.9), lw=1, head=4)
# агенты → Telegram (ответы): шина сверху
bus_y = TOP + 2
poly_arrow([(ax + aw / 2, ay + ah), (ax + aw / 2, bus_y), (tgx + tgw / 2 + 30, bus_y),
            (tgx + tgw / 2 + 30, tgy + tgh)], TG_DARK, lw=1.3)
label((ax + tgx + tgw) / 2 + 40, bus_y - 2, "ответы агентов — sendMessage в Telegram", TG_DARK, bg=white)
# агенты → журнал
poly_arrow([(ax + 40, ay), (ax + 40, gy + gh - 57), (gx + gw - 10, gy + gh - 57)], GOOGLE, lw=1.2)
label((gx + gw + ax + 40) / 2, gy + gh - 52, "шаги, итог", GOOGLE)
# надзиратель → журнал (чтение) и → слушатель /admin
poly_arrow([(ax + 10, agent_mid["watchdog"] - 4), (ax - 8, agent_mid["watchdog"] - 4), (ax - 8, gy + gh - 40),
            (gx + gw - 10, gy + gh - 40)], AGENT["watchdog"], lw=1.1, dash=(3, 2))
poly_arrow([(ax + 10, agent_mid["watchdog"] + 4), (ax - 16, agent_mid["watchdog"] + 4), (ax - 16, wk_y + 8),
            (cfx + cfw - 10, wk_y + 8)], AGENT["watchdog"], lw=1.1, dash=(3, 2))
text(ax + 12, agent_mid["watchdog"] - 24, "← пауза / повтор через слушатель; читает журнал", "R", 6.6, AGENT["watchdog"])
# веб-панель → журнал (чтение)
arrow(hx + 8, gy + 40, gx + gw - 10, gy + 40, GH, lw=1.1, dash=(3, 2))
label((hx + gx + gw) / 2 + 40, gy + 44, "веб-панель читает журнал", GH)
# ПК → деплой
for tx_, ty_ in ((cfx + 30, cfy), (ax, ay + 18), (hx + 8, hy + 30)):
    pass
arrow(px + pw - 10, py + ph - 40, cfx + 40, cfy + 10, GREY, dash=(2, 2), lw=1)


legend(BOT - 18)

c.showPage()

# =====================================================================
# Страница 2 — путь сообщения и расход
# =====================================================================
header("Путь сообщения: где отсекается бесплатно и где тратятся токены",
       "Слушатель отбрасывает лишнее до AI; токены Claude тратятся только когда агента действительно разбудили", 2)

LX0, LX1 = M, 606  # область схемы
LANE_W = 66
lanes = [  # (заголовок, подпись, цвет, y_низ, y_верх)
    ("Telegram", "вы и бот", TG, 452, TOP),
    ("Слушатель", "Cloudflare", CF, 300, 444),
    ("Агент", "облако Anthropic", ANT, 150, 292),
    ("Расписание", "cron", AGENT["news"], BOT + 4, 142),
]
for title, sub, color, y0, y1 in lanes:
    box(LX0, y0, LX1 - LX0, y1 - y0, tint(color, 0.05), tint(color, 0.4), r=8)
    c.setFillColor(color)
    c.roundRect(LX0, y0, LANE_W, y1 - y0, 8, stroke=0, fill=1)
    c.rect(LX0 + LANE_W - 8, y0, 8, y1 - y0, stroke=0, fill=1)
    text(LX0 + 8, y1 - 16, title, "B", 9, white)
    text(LX0 + 8, y1 - 27, sub, "R", 6.8, white)
badge(LX0 + 5, 300 + 8, "free", 5.8)
badge(LX0 + 5, 150 + 8, "claude", 5.4)
badge(LX0 + 5, BOT + 12, "claude", 5.4)

FX = LX0 + LANE_W + 10  # начало потока


def diamond(cx, cy, w, h, s1, s2="", color=INK):
    c.setFillColor(white)
    c.setStrokeColor(color)
    c.setLineWidth(1.1)
    p = c.beginPath()
    p.moveTo(cx, cy + h / 2)
    p.lineTo(cx + w / 2, cy)
    p.lineTo(cx, cy - h / 2)
    p.lineTo(cx - w / 2, cy)
    p.close()
    c.drawPath(p, stroke=1, fill=1)
    if s2:
        text(cx, cy + 1.5, s1, "B", 6.5, color, "c")
        text(cx, cy - 6.5, s2, "B", 6.5, color, "c")
    else:
        text(cx, cy - 2.5, s1, "B", 6.5, color, "c")


def terminal(cx, y, s, sub="", color=GREY):
    w = max(stringWidth(s, "B", 6.6), stringWidth(sub, "R", 6.2)) + 12
    box(cx - w / 2, y, w, 24 if sub else 15, white, color, r=7, lw=0.9)
    text(cx, y + (14 if sub else 5), s, "B", 6.6, color, "c")
    if sub:
        text(cx, y + 5, sub, "R", 6.2, MUTED, "c")


# --- Telegram: исходное сообщение ---
msg_x, msg_y = FX, 470
box(msg_x, msg_y, 118, 32, white, TG, r=8, lw=1.1)
text(msg_x + 8, msg_y + 19, "Сообщение в группе", "B", 7.6, TG_DARK)
text(msg_x + 8, msg_y + 8, "текст · голос · фото", "R", 6.8, MUTED)

# --- Слушатель: цепочка решений ---
ry = 392  # ось решений
rej_y = 312  # бесплатные отказы
dxs = [FX + 30 + i * 70 for i in range(4)]
d_w, d_h = 62, 40
arrow(msg_x + 30, msg_y, dxs[0], ry + d_h / 2 + 1, TG_DARK)

diamond(dxs[0], ry, d_w, d_h, "дубль или", "от бота?")
diamond(dxs[1], ry, d_w, d_h, "голосовое?")
diamond(dxs[2], ry, d_w, d_h, "«помощь», «?»,", "«включи …»?")
diamond(dxs[3], ry, d_w, d_h, "есть слова", "агентов?")
for a, b in zip(dxs[:-1], dxs[1:]):
    arrow(a + d_w / 2, ry, b - d_w / 2, ry, INK, head=4)
    label((a + b) / 2, ry + 4, "нет" if a in (dxs[0], dxs[1]) else "нет", MUTED, 6)
# отказы
arrow(dxs[0], ry - d_h / 2, dxs[0], rej_y + 24, GREY, head=4)
label(dxs[0] + 9, ry - d_h / 2 - 12, "да", MUTED, 6, "l")
terminal(dxs[0], rej_y, "игнор", "0 токенов")
# голосовое → whisper
wx = dxs[1]
arrow(wx, ry + d_h / 2, wx, ry + 30, WAI, head=4)
box(wx - 32, ry + 30, 64, 18, white, WAI, r=6)
text(wx, ry + 36, "Whisper → текст", "B", 6.4, WAI, "c")
badge(wx + 34, ry + 34, "whisper", 5.6)
label(wx + 8, ry + d_h / 2 + 4, "да", MUTED, 6, "l")
# помощь / включи
arrow(dxs[2], ry + d_h / 2, dxs[2], 452 + 8, FREE, head=4)
label(dxs[2] + 8, ry + d_h / 2 + 4, "да", MUTED, 6, "l")
terminal(dxs[2], 456, "шпаргалка / «снова работает»", color=FREE)
# нет слов
arrow(dxs[3], ry - d_h / 2, dxs[3], rej_y + 24, GREY, head=4)
label(dxs[3] + 9, ry - d_h / 2 - 12, "нет", MUTED, 6, "l")
terminal(dxs[3], rej_y, "тишина", "0 токенов")

# разбор на задачи
px_ = dxs[3] + 48
box(px_, ry - 17, 72, 34, white, CF, r=6, lw=1.1)
text(px_ + 36, ry + 4, "делит на задачи", "B", 6.8, INK, "c")
text(px_ + 36, ry - 6, "по предложениям,", "R", 6.2, MUTED, "c")
text(px_ + 36, ry - 13.5, "«а ещё», запятым", "R", 6.2, MUTED, "c")
arrow(dxs[3] + d_w / 2, ry, px_, ry, INK, head=4)
label((dxs[3] + d_w / 2 + px_) / 2, ry + 4, "да", MUTED, 6)
# пауза
pz = px_ + 72 + 40
diamond(pz, ry, d_w, d_h, "агент", "на паузе?")
arrow(px_ + 72, ry, pz - d_w / 2, ry, INK, head=4)
text(px_ + 74, ry + 18, "для каждой", "R", 6.2, MUTED)
text(px_ + 74, ry + 11, "задачи", "R", 6.2, MUTED)
arrow(pz, ry + d_h / 2, pz, 452 + 8, GREY, head=4)
label(pz + 8, ry + d_h / 2 + 4, "да", MUTED, 6, "l")
terminal(pz, 456, "«на паузе»", color=GREY)
# принял + fire
ack_x = pz + d_w / 2 + 12
box(ack_x, ry - 16, 56, 32, white, CF, r=6, lw=1.1)
text(ack_x + 28, ry + 3, "«Принял»", "B", 6.8, INK, "c")
text(ack_x + 28, ry - 8, "+ запуск", "R", 6.2, MUTED, "c")
arrow(pz + d_w / 2, ry, ack_x, ry, INK, head=4)
label((pz + d_w / 2 + ack_x) / 2, ry + 4, "нет", MUTED, 6)
arrow(ack_x + 28, ry + 16, ack_x + 28, 482, CF, head=4, dash=(3, 2))
terminal(min(ack_x + 28, LX1 - 58), 482, "«Разобрал на N задачи»", color=CF)

# --- Агент ---
ay_ = 236  # ось агента (справа налево)
start_x = ack_x + 28
arrow(start_x, ry - 16, start_x, ay_ + 22, ANT, lw=1.5, head=5)
box(start_x - 28, ay_ - 16, 56, 36, white, ANT, r=6, lw=1.3)
text(start_x, ay_ + 7, "сессия Claude", "B", 6.8, ANT, "c")
text(start_x, ay_ - 3, "читает", "R", 6.2, MUTED, "c")
text(start_x, ay_ - 10.5, "сценарий", "R", 6.2, MUTED, "c")
label(start_x - 6, ry - 40, "1 задача = 1 сессия", ANT, 6.4, "r")

c1 = start_x - 92
diamond(c1, ay_, d_w + 8, d_h, "это правда", "просьба?", ANT)
arrow(start_x - 28, ay_, c1 + (d_w + 8) / 2, ay_, ANT, head=4)
arrow(c1, ay_ - d_h / 2, c1, 160 + 24, GREY, head=4)
label(c1 + 9, ay_ - d_h / 2 - 11, "нет", MUTED, 6, "l")
terminal(c1, 160, "тишина, лог skipped", "небольшой расход")

c2 = c1 - 88
diamond(c2, ay_, d_w + 8, d_h, "хватает", "данных?", ANT)
arrow(c1 - (d_w + 8) / 2, ay_, c2 + (d_w + 8) / 2, ay_, ANT, head=4)
label((c1 + c2) / 2, ay_ + 4, "да", MUTED, 6)
arrow(c2, ay_ - d_h / 2, c2, 160 + 24, GREY, head=4)
label(c2 + 9, ay_ - d_h / 2 - 11, "нет места", MUTED, 6, "l")
terminal(c2, 160, "переспросит одной", "строкой — «Где ищем?»")

c3 = c2 - 90
box(c3 - 40, ay_ - 20, 80, 40, white, ANT, r=6, lw=1.1)
text(c3, ay_ + 9, "поиск", "B", 6.8, INK, "c")
text(c3, ay_ - 1, "MCP · Apify · API", "R", 6.2, MUTED, "c")
text(c3, ay_ - 9, "ответы → в контекст", "R", 6.2, MUTED, "c")
badge(c3 - 22, ay_ + 23, "apify", 5.6)
arrow(c2 - (d_w + 8) / 2, ay_, c3 + 40, ay_, ANT, head=4)
label((c2 + c3) / 2 + 4, ay_ + 4, "да", MUTED, 6)

c4 = c3 - 84
box(c4 - 36, ay_ - 20, 72, 40, white, ANT, r=6, lw=1.1)
text(c4, ay_ + 9, "сравнение", "B", 6.8, INK, "c")
text(c4, ay_ - 1, "отсев, топ-3/5,", "R", 6.2, MUTED, "c")
text(c4, ay_ - 9, "совет", "R", 6.2, MUTED, "c")
arrow(c3 - 40, ay_, c4 + 36, ay_, ANT, head=4)

c5 = FX + 30
box(c5 - 30, ay_ - 20, 62, 40, white, ANT, r=6, lw=1.1)
text(c5 + 1, ay_ + 9, "ответ в чат", "B", 6.8, INK, "c")
text(c5 + 1, ay_ - 1, "+ итог", "R", 6.2, MUTED, "c")
text(c5 + 1, ay_ - 9, "в журнал", "R", 6.2, MUTED, "c")
arrow(c4 - 36, ay_, c5 + 32, ay_, ANT, head=4)
poly_arrow([(c5 - 30, ay_ + 10), (c5 - 38, ay_ + 10), (c5 - 38, msg_y - 6), (msg_x + 2, msg_y - 6), (msg_x + 2, msg_y)],
           TG_DARK, lw=1.1)
label(c5 - 36, (ay_ + msg_y) / 2 + 20, "ответ", TG_DARK, 6.4, "l")

# лента «здесь идут токены»
c.setFillColor(tint(ANT, 0.12))
c.rect(c5 - 30, 282, start_x + 28 - (c5 - 30), 7, stroke=0, fill=1)
text((c5 + start_x) / 2, 283.3, "от запуска до итога агент тратит токены Claude: чтение сценария, мысли, "
     "вызовы инструментов, их ответы", "B", 5.9, ANT, "c")

# --- Расписание ---
sy_ = 98
box(FX, sy_ - 2, 118, 34, white, AGENT["news"], r=6, lw=1.1)
text(FX + 8, sy_ + 19, "08:00 → Новости", "B", 7, INK)
text(FX + 8, sy_ + 8, "веб-поиск, дайджест в чат", "R", 6.2, MUTED)
badge(FX + 120, sy_ + 12, "claude", 5.4)
wdx = FX + 186
box(wdx, sy_ - 2, 120, 34, white, AGENT["watchdog"], r=6, lw=1.1)
text(wdx + 8, sy_ + 19, "каждые 6 ч → Надзиратель", "B", 7, INK)
text(wdx + 8, sy_ + 8, "читает журнал за 6 ч / сутки", "R", 6.2, MUTED)
d3x = wdx + 120 + 44
diamond(d3x, sy_ + 15, d_w + 8, d_h, "цикл или", "завис?", AGENT["watchdog"])
arrow(wdx + 120, sy_ + 15, d3x - (d_w + 8) / 2, sy_ + 15, AGENT["watchdog"], head=4)
arrow(d3x, sy_ + 15 - d_h / 2, d3x, BOT + 22, GREY, head=4)
label(d3x + 9, sy_ - 14, "нет", MUTED, 6, "l")
terminal(d3x, BOT + 8, "ничего не делает")
act_x = d3x + (d_w + 8) / 2 + 14
box(act_x, sy_ - 2, 90, 34, white, AGENT["watchdog"], r=6, lw=1.1)
text(act_x + 7, sy_ + 19, "пауза или повтор", "B", 7, INK)
text(act_x + 7, sy_ + 8, "через /admin слушателя", "R", 6.2, MUTED)
arrow(d3x + (d_w + 8) / 2, sy_ + 15, act_x, sy_ + 15, AGENT["watchdog"], head=4)
label((d3x + act_x) / 2 + 18, sy_ + 19, "да", MUTED, 6)
wx_ = (c1 + (d_w + 8) / 2 + start_x - 28) / 2
poly_arrow([(wx_, sy_ + 32), (wx_, ry - 32), (pz + 6, ry - 32), (pz + 6, ry - 14)],
           AGENT["watchdog"], lw=1.1, dash=(3, 2))
label(wx_ + 4, 196, "повтор = ещё", AGENT["watchdog"], 6.2, "l")
label(wx_ + 4, 187, "одна сессия", AGENT["watchdog"], 6.2, "l")
text(wdx + 8, sy_ - 14, "отчёт в 09:00 — в чат; ночью и днём — молча", "R", 6.2, MUTED)

# --- Правая панель: расход ---
px0 = LX1 + 14
pw0 = W - M - px0
box(px0, BOT + 4, pw0, TOP - BOT - 4, PANEL, None)
text(px0 + 12, TOP - 16, "ГДЕ И ЧТО ТРАТИТСЯ", "B", 9.5, MUTED)
yy = TOP - 32
sections = [
    ("claude", "Токены Claude (лимит подписки)", [
        "1 задача = 1 сессия агента; «Разобрал на 4 задачи» = 4 сессии",
        "по запросу: ~1–2,5 мин и 5–15 шагов модели (по журналу)",
        "отказ агента («не про это») — тоже сессия, но короткая",
        "фиксированно 5 сессий в сутки: 1 новости + 4 надзора",
        "повтор зависшего надзирателем = ещё одна сессия",
        "крупные ответы сервисов (до ~90 тыс. символов) агент кладёт в файл и читает выборочно",
    ]),
    ("whisper", "Whisper (Cloudflare Workers AI)", [
        "только голосовые, 1 вызов на сообщение; в пределах бесплатной дневной квоты Cloudflare",
    ]),
    ("apify", "Apify (деньги)", [
        "Покупки: 3 скрапера за запрос; Жильё: Островок и Авито",
        "потолок ≤ $0,10 на вызов; бесплатный план — $5 кредита в месяц",
    ]),
    ("free", "Бесплатно, без AI", [
        "фильтр слушателя: дубли, боты, «помощь», «включи…», сообщения без слов агентов",
        "«Принял», паузы, журнал, веб-панель; MCP Туту и ВкусВилла, API Суточно",
    ]),
]
for kind, title, items in sections:
    badge(px0 + 12, yy - 2, kind, 6)
    yy -= 14
    text(px0 + 12, yy, title, "B", 8, INK)
    yy -= 11
    for it in items:
        dot(px0 + 16, yy + 2.3, LINE, 1.8)
        yy = para(px0 + 22, yy, it, pw0 - 34, size=6.9, color=MUTED, lead=8.6) - 2.5
    yy -= 7

legend(BOT - 18)
c.showPage()

# =====================================================================
# Страница 3 — когда агенты идут в AI и пример расхода
# =====================================================================
header("Когда агенты обращаются к AI и сколько уходит токенов",
       "Пример — реальный запуск агента «Жильё» 07.10.2026: «отель в Сочи на 3 ночи с пятницы, с завтраком»", 3)

# --- левая колонка: кто и когда ---
LW = 372
text(M, TOP - 6, "КТО И КОГДА ОБРАЩАЕТСЯ К AI", "B", 10, MUTED)
rows = [
    ("Слушатель", "free", "нет",
     "на каждое сообщение: фильтр, разбор задач, «Принял». Исключение — голосовое: один вызов Whisper"),
    ("Агент по запросу", "claude", "да",
     "только если слушатель нашёл слова агента и агент не на паузе. Каждый шаг от запуска до итога — ход модели"),
    ("Инструменты агента", "free", "нет",
     "Туту, ВкусВилл, Apify, Суточно, Telegram, журнал — обычные сервисы. Но их ответ читает модель — это токены"),
    ("Новости", "claude", "да", "1 раз в день, 08:00: веб-поиск и дайджест"),
    ("Надзиратель", "claude", "да", "4 раза в сутки + повтор зависшего запроса (ещё одна сессия агента)"),
    ("Журнал, веб-панель", "free", "нет", "только хранят и показывают"),
]
yy = TOP - 22
for name, kind, ai, when in rows:
    h = 34
    box(M, yy - h, LW, h, white, LINE, 6)
    text(M + 9, yy - 14, name, "B", 8.4)
    badge(M + 9, yy - 28, kind, 5.8)
    para(M + 118, yy - 12, when, LW - 128, size=7.2, color=MUTED, lead=9)
    yy -= h + 4

# --- как устроен один шаг ---
yy -= 10
text(M, yy, "КАК УСТРОЕН ОДИН ШАГ АГЕНТА", "B", 10, MUTED)
yy -= 14
steps = [("контекст", "сценарий + всё, что было до этого"), ("модель думает", "решает, что делать"),
         ("инструмент", "поиск, ссылка, запись в журнал"), ("ответ инструмента", "дописывается в контекст")]
bw_ = (LW - 3 * 14) / 4
for i, (t1, t2) in enumerate(steps):
    x = M + i * (bw_ + 14)
    fill = tint(ANT, 0.10) if i in (0, 1) else white
    box(x, yy - 38, bw_, 38, fill, tint(ANT, 0.6) if i in (0, 1) else LINE, 6)
    text(x + bw_ / 2, yy - 15, t1, "B", 7.6, INK, "c")
    para(x + bw_ / 2, yy - 26, t2, bw_ - 8, size=6.4, color=MUTED, lead=7.8, anchor="c")
    if i < 3:
        arrow(x + bw_ + 2, yy - 19, x + bw_ + 12, yy - 19, INK, head=3.5)
poly_arrow([(M + 3 * (bw_ + 14) + bw_ / 2, yy - 38), (M + 3 * (bw_ + 14) + bw_ / 2, yy - 48),
            (M + bw_ / 2, yy - 48), (M + bw_ / 2, yy - 40)], ANT, lw=1.1, head=4)
label(M + LW / 2, yy - 51, "следующий шаг перечитывает весь накопленный контекст (из кэша — дешевле)", ANT, 6.6)
yy -= 64
para(M, yy, "Поэтому стоимость растёт от двух вещей: сколько шагов сделал агент и насколько большие ответы "
     "сервисов попали в контекст. Модель — Claude Sonnet; расход идёт из лимита подписки Claude.",
     LW, size=7.6, color=INK, lead=10)

# --- правая колонка: пример ---
RX = M + LW + 24
RW = W - M - RX
text(RX, TOP - 6, "ПРИМЕР: ОДИН ЗАПРОС К АГЕНТУ «ЖИЛЬЁ»", "B", 10, MUTED)
heroes = [("12", "шагов модели"), ("2 мин 26 с", "от запуска до итога"),
          ("≈70 тыс.", "символов в контексте к концу"), ("≈600 тыс.", "символов прочитано за 12 шагов")]
hw = (RW - 3 * 8) / 4
for i, (big, small) in enumerate(heroes):
    x = RX + i * (hw + 8)
    box(x, TOP - 58, hw, 42, PANEL, None)
    text(x + 9, TOP - 36, big, "B", 13, ANT)
    para(x + 9, TOP - 48, small, hw - 14, size=6.5, color=MUTED, lead=7.6)

text(RX, TOP - 76, "Что попало в контекст модели, тыс. символов (по журналу запуска)", "B", 8.2, INK)
items = [
    ("Сценарий агента + запрос", 9.3, ""),
    ("Список инструментов Туту", 0.7, ""),
    ("Скрипт поиска", 2.4, "пишет модель"),
    ("Итог скрипта: «sutochno 30, ostrovok 15»", 0.05, "данные — в файлах"),
    ("Отели Туту (search_hotels)", 30.1, "самый крупный кусок"),
    ("Суточно: пример объекта", 10.5, ""),
    ("Суточно: список отелей", 1.6, ""),
    ("Суточно: питание", 6.5, ""),
    ("3 ссылки Туту на бронь", 4.8, ""),
    ("Ответ в чат", 4.1, "пишет модель"),
]
lab_w = 168
bx0 = RX + lab_w
bx1 = RX + RW - 56
vmax = 32
cy = TOP - 92
bar_h, bar_gap = 12, 5.5
# сетка
for v in (0, 10, 20, 30):
    gx_ = bx0 + (bx1 - bx0) * v / vmax
    c.setStrokeColor(HexColor("#E3E7EF"))
    c.setLineWidth(0.6)
    c.line(gx_, cy - len(items) * (bar_h + bar_gap) + bar_gap - 2, gx_, cy + 2)
    text(gx_, cy - len(items) * (bar_h + bar_gap) + bar_gap - 11, f"{v}", "R", 6.4, MUTED, "c")
for i, (name, v, note) in enumerate(items):
    y = cy - (i + 1) * (bar_h + bar_gap) + bar_gap
    text(RX, y + 3.5, name, "R", 7.2, INK)
    w_ = max(1.5, (bx1 - bx0) * v / vmax)
    c.setFillColor(ANT)
    c.roundRect(bx0, y, w_, bar_h, 2, stroke=0, fill=1)
    val = "<0,1" if v < 0.1 else f"{v:.1f}".replace(".", ",")
    text(bx0 + w_ + 4, y + 3.5, val, "B", 7, INK)
    if note:
        text(bx0 + w_ + 6 + stringWidth(val, "B", 7) + 2, y + 3.5, "· " + note, "R", 6.6, MUTED)
cy2 = cy - len(items) * (bar_h + bar_gap) - 18

# оценка в токенах
box(RX, cy2 - 88, RW, 80, tint(ANT, 0.07), tint(ANT, 0.45), 7)
text(RX + 10, cy2 - 22, "Оценка в токенах", "B", 8.6, ANT)
text(RX + 98, cy2 - 22, "1 токен ≈ 2,5–3,5 символа русского текста и JSON; точных счётчиков в журнале нет",
     "R", 6.6, MUTED)
est = [("≈20–28 тыс.", "новых токенов в контексте за запуск"),
       ("≈170–240 тыс.", "токенов прочитано за 12 шагов — в основном из кэша"),
       ("≈2,5–4 тыс.", "токенов написала модель: скрипт, команды, ответ")]
ew = (RW - 20 - 2 * 10) / 3
for i, (big, small) in enumerate(est):
    x = RX + 10 + i * (ew + 10)
    text(x, cy2 - 42, big, "B", 12, INK)
    para(x, cy2 - 54, small, ew - 4, size=6.6, color=MUTED, lead=8)
text(RX + 10, cy2 - 82, "+ служебная часть Claude Code (инструкции и описания инструментов) — на каждом шаге из кэша, в журнале не видна",
     "R", 6.3, MUTED)

# --- низ: как экономится ---
ey = BOT + 8
box(M, ey, W - 2 * M, 66, PANEL, None)
text(M + 12, ey + 50, "КАК РАСХОД ДЕРЖИТСЯ НИЗКИМ", "B", 9.5, MUTED)
tips = [
    "30 вариантов Суточно и 15 отелей Островка легли в файлы — в контекст попала одна строка, модель берёт из файла только нужное",
    "слушатель не будит агента без его слов; «помощь», «включи…», паузы и «Принял» — без AI",
    "отказ («отель был ужасный») — 2–3 шага вместо 12: агент сразу пишет skipped и молчит",
    "резерв экономии: самый крупный кусок — ответ Туту (43 % контекста); можно просить меньше вариантов и полей",
]
colw = (W - 2 * M - 36) / 2
for i, tip in enumerate(tips):
    x = M + 12 + (i % 2) * (colw + 12)
    y = ey + 34 - (i // 2) * 18
    dot(x + 3, y + 2.5, ANT, 2)
    para(x + 10, y, tip, colw - 12, size=7, color=INK, lead=8.6)

legend(BOT - 18)
c.showPage()
# =====================================================================
# Страница 4 — один управляющий агент или команда агентов
# =====================================================================
header("Один управляющий агент или команда агентов",
       "Почему у ассистентов фабрика узких агентов, а не один «на всё» — на примере сообщения из 4 дел", 4)

BAD = HexColor("#D0574A")
TEAM = TG_DARK
SOLO = HexColor("#7A8194")
PW = (W - 2 * M - 18) / 2
LX, RX2 = M, M + PW + 18
Y1, ZH = TOP - 176, 170


def chip_box(x, y, w, h, s, color):
    box(x, y, w, h, tint(color, 0.15), color, r=5)
    text(x + w / 2, y + h / 2 - 2.8, s, "B", 7.4, INK, "c")


# --- Вариант А: один управляющий ---
zone(LX, Y1, PW, ZH, SOLO, "Вариант А · один управляющий агент", "≈48 шагов подряд · 8–10 мин")
node(LX + 10, 436, 72, 36, "сообщение", "4 дела в одном")
node(LX + 10, 376, 72, 30, "«спасибо»", "просто реплика")
text(LX + 10, 366, "тоже будит агента", "R", 6.3, BAD)
MX, MW = LX + 100, PW - 110
box(MX, 362, MW, 128, tint(ANT, 0.06), tint(ANT, 0.6), 7)
text(MX + 9, 476, "Управляющий агент", "B", 8.6)
bw = stringWidth("токены Claude", "B", 6.3) + 9
badge(MX + MW - bw - 8, 472, "claude")
para(MX + 9, 462, "в контексте всегда: все 4 сценария + инструменты Туту, ВкусВилл, Apify, Суточно",
     MW - 18, size=6.6, color=MUTED, lead=8)
cw = (MW - 18 - 3 * 14) / 4
for i, (s, k) in enumerate((("завтрак", "grocery"), ("мяч", "shopping"), ("поезд", "travel"), ("отель", "booking"))):
    x = MX + 9 + i * (cw + 14)
    chip_box(x, 420, cw, 20, s, AGENT[k])
    if i < 3:
        arrow(x + cw + 2, 430, x + cw + 12, 430, INK, head=3.5)
text(MX + 9, 409, "по очереди: следующее дело ждёт, пока не кончится предыдущее", "R", 6.5, MUTED)
# клин роста контекста
wx0, wx1, wy = MX + 9, MX + MW - 9, 370
p = c.beginPath()
p.moveTo(wx0, wy)
p.lineTo(wx1, wy)
p.lineTo(wx1, wy + 18)
p.lineTo(wx0, wy + 2)
p.close()
c.setFillColor(tint(ANT, 0.45))
c.drawPath(p, stroke=0, fill=1)
text(wx0, wy + 21, "контекст растёт: ≈40 → ≈250 тыс. символов", "B", 6.6, ANT)
arrow(LX + 82, 454, MX, 454, INK)
arrow(LX + 82, 391, MX, 391, BAD)

# --- Вариант Б: команда (как сейчас) ---
zone(RX2, Y1, PW, ZH, TEAM, "Вариант Б · команда агентов (как сейчас)", "4 × ≈12 шагов параллельно · 2–3 мин")
node(RX2 + 10, 436, 72, 36, "сообщение", "4 дела в одном")
node(RX2 + 10, 376, 72, 30, "«спасибо»", "просто реплика")
node(RX2 + 102, 404, 80, 60, "Слушатель", "Cloudflare, по словам, без AI")
badge(RX2 + 109, 409, "free")
arrow(RX2 + 82, 454, RX2 + 102, 454, INK)
poly_arrow([(RX2 + 82, 391), (RX2 + 142, 391), (RX2 + 142, 404)], FREE)
text(RX2 + 10, 366, "дальше слушателя не идёт", "R", 6.3, FREE)
AX, AW = RX2 + 214, 104
text(AX + AW + 6, 489, "контекст", "R", 6.2, MUTED)
for i, (name, tool, k) in enumerate((("Продукты", "ВкусВилл", "grocery"), ("Покупки", "Apify", "shopping"),
                                     ("Поездки", "Туту", "travel"), ("Жильё", "Суточно, Островок, Туту", "booking"))):
    y = 462 - i * 28
    box(AX, y, AW, 22, white, LINE, 5)
    c.setFillColor(AGENT[k])
    c.rect(AX, y, 4, 22, stroke=0, fill=1)
    text(AX + 9, y + 12, name, "B", 7.4)
    text(AX + 9, y + 3.6, tool, "R", 6, MUTED)
    arrow(RX2 + 182, 434, AX, y + 11, AGENT[k], lw=1.1, head=4)
    text(AX + AW + 6, y + 8, "≈70 тыс.", "B", 6.8, ANT)

# --- Экономия ---
Y2T = Y1 - 16
text(LX, Y2T, "ЭКОНОМИЯ НА ПРИМЕРЕ «ЗАВТРАК + МЯЧ + ПОЕЗД + ОТЕЛЬ»", "B", 9.5, MUTED)
lx = LX
for col, s in ((SOLO, "один агент"), (TEAM, "команда агентов")):
    c.setFillColor(col)
    c.roundRect(lx, Y2T - 15, 9, 7, 2, stroke=0, fill=1)
    text(lx + 13, Y2T - 14, s, "R", 6.8, MUTED)
    lx += 18 + stringWidth(s, "R", 6.8) + 10
metrics = [
    ("Сколько символов прочитала модель", 6.0, "≈5–7 млн", 2.4, "≈2,4 млн", "−60 %", "в 2–3 раза меньше"),
    ("Время до ответа в чат", 9, "8–10 мин", 2.5, "2–3 мин", "−70 %", "в 3–4 раза быстрее"),
    ("Самый большой контекст на шаге", 250, "≈250 тыс.", 70, "≈70 тыс.", "−72 %", "в 3,5 раза меньше"),
    ("Реплика «спасибо» в чате", 80, "≈80 тыс.", 0, "0 — отсёк слушатель", "−100 %", "бесплатно"),
]
bx0, bx1 = LX + 4, LX + PW - 150
yy = Y2T - 30
for title, a, at, b, bt, big, small in metrics:
    text(LX, yy, title, "B", 7.8, INK)
    for j, (v, vt, col) in enumerate(((a, at, SOLO), (b, bt, TEAM))):
        y = yy - 14 - j * 13
        w_ = (bx1 - bx0) * v / a
        if w_ > 0:
            c.setFillColor(col)
            c.roundRect(bx0, y, w_, 10, 2.5, stroke=0, fill=1)
        text(bx0 + w_ + 5, y + 2.5, vt, "B", 6.8, INK)
    sx = LX + PW - 84
    box(sx, yy - 30, 84, 32, tint(FREE, 0.10), None, 6)
    text(sx + 42, yy - 14, big, "B", 13, FREE, "c")
    text(sx + 42, yy - 25, small, "R", 6.3, FREE, "c")
    yy -= 47

# --- Сравнение по критериям ---
text(RX2, Y2T, "СРАВНЕНИЕ ПО КРИТЕРИЯМ", "B", 9.5, MUTED)
cc, cwid = 152, (PW - 152) / 2
text(RX2 + cc + cwid / 2, Y2T - 15, "Один агент", "B", 7.6, SOLO, "c")
text(RX2 + cc + cwid * 1.5, Y2T - 15, "Команда агентов", "B", 7.6, TEAM, "c")
rows4 = [
    ("Расход токенов", ("в 2–3 раза больше", "bad"), ("меньше", "good")),
    ("Скорость ответа", ("дела по очереди", "bad"), ("параллельно", "good")),
    ("Качество ответов", ("длинная инструкция", "bad"), ("короткий сценарий", "good")),
    ("Сломался сервис (например, Туту)", ("ломает весь ответ", "bad"), ("ломает одного", "good")),
    ("Модель под задачу", ("одна, самая сильная", "bad"), ("Haiku или Sonnet", "good")),
    ("Доступы и ключи", ("все ключи у одного", "bad"), ("только нужные", "good")),
    ("Паузы, расписание, журнал", ("общие на всех", "bad"), ("по каждому агенту", "good")),
    ("Добавить нового агента", ("правка общего сценария", "bad"), ("по шаблону", "good")),
    ("Связанные дела (поезд + отель)", ("видит всё сразу", "good"), ("частично, через контекст", "mid")),
    ("Запуски Routines", ("1 на сообщение", "good"), ("1 на каждое дело", "mid")),
    ("Старт с 1–2 задачами", ("проще", "good"), ("избыточно", "mid")),
]
KIND = {"good": FREE, "bad": BAD, "mid": APIFY}
rh = 17.4
ry = Y2T - 22
for i, (crit, *cells) in enumerate(rows4):
    y = ry - (i + 1) * rh
    if i % 2 == 0:
        c.setFillColor(PANEL)
        c.rect(RX2, y, PW, rh, stroke=0, fill=1)
    text(RX2 + 6, y + 5.6, crit, "R", 7.2, INK)
    for j, (s, k) in enumerate(cells):
        x = RX2 + cc + j * cwid + 4
        col = KIND[k]
        box(x, y + 2.4, cwid - 8, rh - 4.8, tint(col, 0.14), None, 5)
        text(x + (cwid - 8) / 2, y + 5.8, s, "B", 6.5, col, "c")

# --- Вывод ---
box(M, BOT + 8, W - 2 * M, 58, tint(FREE, 0.08), tint(FREE, 0.5), 8)
text(M + 12, BOT + 50, "ВЫВОД", "B", 9.5, FREE)
para(M + 12, BOT + 36, "Оставляем команду агентов. На сообщении из 4 дел — примерно в 2–3 раза меньше токенов и в "
     "3–4 раза быстрее; поломка одного сервиса не роняет остальных; у каждого агента своя модель и только свои ключи.",
     PW - 10, size=7.4, color=INK, lead=9.4)
text(RX2, BOT + 50, "ДАЛЬШЕ — ПО ЗАПРОСУ", "B", 9.5, FREE)
para(RX2, BOT + 36, "1) дешёвый ИИ-маршрутизатор (Haiku) — только для сообщений, где слова агентов не совпали.",
     PW - 12, size=7.4, color=INK, lead=9.4)
para(RX2, BOT + 22, "2) режим «поездка»: Жильё запускается после Поездок, с датой прибытия из их ответа.",
     PW - 12, size=7.4, color=INK, lead=9.4)
text(M, BOT - 16, "Оценки по запуску «Жильё» со стр. 3 (12 шагов, ≈70 тыс. символов в контексте). У одного агента — "
     "≈48 шагов, контекст растёт с ≈40 до ≈250 тыс., и каждый шаг перечитывает всё накопленное.", "R", 6.6, MUTED)
c.showPage()
c.save()
