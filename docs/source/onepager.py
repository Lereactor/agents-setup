"""Одностраничная презентация «Персональные ассистенты» (A4 альбомная) — для показа как готового продукта.

python docs/source/onepager.py "docs/Персональные-ассистенты.pdf"
"""
import math
import sys

from reportlab.lib.colors import HexColor, white
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
ACCENT = HexColor("#7C9CFF")
TG = HexColor("#2AABEE")
TG_DARK = HexColor("#147FB8")
GREEN = HexColor("#2E9E5B")
PURPLE = HexColor("#8A63D2")

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
c.setTitle("Персональные ассистенты — команда AI-помощников в Telegram")
c.setAuthor("Персональные ассистенты")


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


def para(x, y, s, width, font="R", size=9, color=INK, lead=None, anchor="l"):
    lead = lead or size * 1.3
    lines = wrap(s, font, size, width)
    for i, line in enumerate(lines):
        text(x, y - i * lead, line, font, size, color, anchor)
    return y - len(lines) * lead


def box(x, y, w, h, fill=white, stroke=LINE, r=8, lw=1, dash=None):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(lw)
    if dash:
        c.setDash(*dash)
    c.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1)
    c.setDash()


def arrow(x1, y1, x2, y2, color=INK, lw=1.4, head=5.5, dash=None):
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


def chip(x, y, label, color, size=6.5):
    """Маленькая цветная плашка; возвращает ширину."""
    w = stringWidth(label, "B", size) + 8
    c.setFillColor(color)
    c.roundRect(x, y, w, size + 4, 3, stroke=0, fill=1)
    text(x + 4, y + 3, label, "B", size, white)
    return w


def chips_right(x_right, y, labels, color):
    """Плашки, выровненные по правому краю; возвращает левую границу."""
    x = x_right
    for label in reversed(labels):
        x -= stringWidth(label, "B", 6.5) + 8
        chip(x, y, label, color)
        x -= 3
    return x


def icon(x, y, r, kind, color):
    """Цветной круг с простым белым значком (эмодзи в PDF не рисуются)."""
    c.setFillColor(color)
    c.circle(x, y, r, stroke=0, fill=1)
    c.setStrokeColor(white)
    c.setFillColor(white)
    c.setLineWidth(r * 0.16)
    c.setLineCap(1)
    c.setLineJoin(1)
    k = r * 0.5
    if kind == "shopping":  # тележка
        p = c.beginPath()
        p.moveTo(x - k * 1.1, y + k * 0.8)
        p.lineTo(x - k * 0.7, y + k * 0.8)
        p.lineTo(x - k * 0.35, y - k * 0.35)
        p.lineTo(x + k * 0.85, y - k * 0.35)
        p.lineTo(x + k * 1.05, y + k * 0.45)
        p.lineTo(x - k * 0.55, y + k * 0.45)
        c.drawPath(p, stroke=1, fill=0)
        c.circle(x - k * 0.25, y - k * 0.8, r * 0.1, stroke=0, fill=1)
        c.circle(x + k * 0.7, y - k * 0.8, r * 0.1, stroke=0, fill=1)
    elif kind == "grocery":  # листик
        p = c.beginPath()
        p.moveTo(x - k, y - k)
        p.curveTo(x - k, y + k * 0.6, x + k * 0.2, y + k, x + k, y + k)
        p.curveTo(x + k, y - k * 0.2, x + k * 0.2, y - k, x - k, y - k)
        c.drawPath(p, stroke=0, fill=1)
    elif kind == "travel":  # самолётик
        p = c.beginPath()
        p.moveTo(x - k * 1.1, y - k * 0.1)
        p.lineTo(x + k * 1.1, y + k * 0.5)
        p.lineTo(x - k * 0.2, y - k * 0.4)
        p.lineTo(x - k * 0.4, y - k * 1.1)
        p.lineTo(x - k * 0.55, y - k * 0.3)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
    elif kind == "booking":  # домик
        p = c.beginPath()
        p.moveTo(x - k * 1.05, y + k * 0.05)
        p.lineTo(x, y + k * 1.0)
        p.lineTo(x + k * 1.05, y + k * 0.05)
        c.drawPath(p, stroke=1, fill=0)
        c.rect(x - k * 0.7, y - k * 0.9, k * 1.4, k * 1.0, stroke=0, fill=1)
        c.setFillColor(color)
        c.rect(x - k * 0.18, y - k * 0.9, k * 0.36, k * 0.55, stroke=0, fill=1)
    elif kind == "news":  # газета
        c.rect(x - k * 0.9, y - k * 0.9, k * 1.8, k * 1.8, stroke=1, fill=0)
        for dy in (0.45, 0.0, -0.45):
            c.line(x - k * 0.5, y + k * dy, x + k * 0.5, y + k * dy)
    elif kind == "watchdog":  # щит с галкой
        p = c.beginPath()
        p.moveTo(x, y + k * 1.1)
        p.lineTo(x + k * 0.95, y + k * 0.7)
        p.curveTo(x + k * 0.95, y - k * 0.3, x + k * 0.5, y - k * 0.9, x, y - k * 1.15)
        p.curveTo(x - k * 0.5, y - k * 0.9, x - k * 0.95, y - k * 0.3, x - k * 0.95, y + k * 0.7)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
        c.setStrokeColor(color)
        p = c.beginPath()
        p.moveTo(x - k * 0.45, y)
        p.lineTo(x - k * 0.1, y - k * 0.35)
        p.lineTo(x + k * 0.45, y + k * 0.3)
        c.drawPath(p, stroke=1, fill=0)
    elif kind == "voice":  # микрофон
        c.roundRect(x - k * 0.35, y - k * 0.2, k * 0.7, k * 1.2, k * 0.35, stroke=0, fill=1)
        p = c.beginPath()
        p.arc(x - k * 0.7, y - k * 0.9, x + k * 0.7, y + k * 0.5, 200, 140)
        c.drawPath(p, stroke=1, fill=0)
        c.line(x, y - k * 0.75, x, y - k * 1.05)
    elif kind == "ok":
        p = c.beginPath()
        p.moveTo(x - k, y)
        p.lineTo(x - k * 0.25, y - k * 0.7)
        p.lineTo(x + k, y + k * 0.7)
        c.drawPath(p, stroke=1, fill=0)
    elif kind == "bolt":
        p = c.beginPath()
        p.moveTo(x + k * 0.2, y + k * 1.1)
        p.lineTo(x - k * 0.6, y - k * 0.1)
        p.lineTo(x - k * 0.05, y - k * 0.1)
        p.lineTo(x - k * 0.25, y - k * 1.1)
        p.lineTo(x + k * 0.6, y + k * 0.15)
        p.lineTo(x + k * 0.05, y + k * 0.15)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
    c.setLineCap(0)
    c.setLineJoin(0)


# ================= шапка =================
c.setFillColor(NAVY)
c.rect(0, H - 80, W, 80, stroke=0, fill=1)
text(M, H - 43, "Персональные ассистенты", "B", 25, white)
text(M + stringWidth("Персональные ассистенты", "B", 25) + 12, H - 43, "— команда AI-помощников в Telegram", "R", 16,
     HexColor("#AFC0FF"))
text(M, H - 64, "Пишете или говорите в один чат как живому помощнику — агенты сами ищут, сравнивают и присылают "
     "готовые подборки со ссылками", "R", 11, HexColor("#C9D3F5"))

stats = [("6 агентов", "4 по запросу + новости и надзор"),
         ("8 площадок", "Ozon, WB, ВкусВилл, Туту, Суточно…"),
         ("1–3 минуты", "от сообщения до подборки с ценами"),
         ("текст и голос", "несколько задач в одном сообщении"),
         ("24/7", "сам следит за собой и чинится")]
gap = 10
sw = (W - 2 * M - 4 * gap) / 5
for i, (big, small) in enumerate(stats):
    x = M + i * (sw + gap)
    box(x, H - 134, sw, 44, PANEL, None)
    text(x + 12, H - 110, big, "B", 15, NAVY)
    text(x + 12, H - 125, small, "R", 7.6, MUTED)

# ================= как работает =================
top = H - 152
text(M, top, "КАК РАБОТАЕТ", "B", 10, MUTED)
text(M + 96, top, "одно сообщение → слушатель разбирает задачи → агенты работают параллельно → ответы в тот же чат",
     "R", 8, MUTED)

row_h, row_gap = 23, 4
ax, aw = 352, 292  # колонка агентов
rows_top = top - 14
event_agents = [
    ("shopping", "Покупки", "топ-5 по цене и отзывам + совет", ["Ozon", "WB", "Я.Маркет"]),
    ("grocery", "Продукты", "корзина по списку или рецепту", ["ВкусВилл"]),
    ("travel", "Поездки", "поезда, самолёты, автобусы", ["Туту"]),
    ("booking", "Жильё", "топ-3 с каждой площадки + риски", ["Суточно", "Островок", "Авито", "Туту"]),
]
sched_agents = [
    ("news", "Новости", "дайджест банков и IT", ["08:00"]),
    ("watchdog", "Надзиратель", "ловит циклы и зависания", ["каждые 6 ч"]),
]
row_y = {}


def agent_row(y, key, name, desc, labels):
    box(ax, y, aw, row_h, white, LINE, 5)
    icon(ax + 13, y + row_h / 2, 8, key, AGENT[key])
    left = chips_right(ax + aw - 6, y + 6.5, labels, AGENT[key])
    text(ax + 27, y + 13, name, "B", 9)
    text(ax + 27 + stringWidth(name, "B", 9) + 6, y + 13, "", "R", 7)
    para(ax + 27, y + 4.5, desc, left - ax - 32, size=7, color=MUTED)
    row_y[key] = y + row_h / 2


y = rows_top - row_h
for spec in event_agents:
    agent_row(y, *spec)
    y -= row_h + row_gap
# разделитель «по расписанию»
sep_y = y + row_h - 3
c.setStrokeColor(LINE)
c.setLineWidth(0.8)
c.setDash(2, 2)
c.line(ax, sep_y, ax + aw, sep_y)
c.setDash()
lbl = "по расписанию"
c.setFillColor(white)
c.rect(ax + aw / 2 - stringWidth(lbl, "R", 7) / 2 - 4, sep_y - 4, stringWidth(lbl, "R", 7) + 8, 8, stroke=0, fill=1)
text(ax + aw / 2, sep_y - 2.5, lbl, "R", 7, MUTED, "c")
y -= 9
for spec in sched_agents:
    agent_row(y, *spec)
    y -= row_h + row_gap
agents_bottom = y + row_h + row_gap

event_mid = (row_y["shopping"] + row_y["booking"]) / 2

# пользователь
ux, uw = M, 132
uh = 112
uy = event_mid - uh / 2
box(ux, uy, uw, uh, HexColor("#E7F4FB"), TG, lw=1.3)
text(ux + 11, uy + uh - 19, "Вы в Telegram", "B", 10.5, TG_DARK)
text(ux + 11, uy + uh - 32, "текст · голос · фото", "R", 8, MUTED)
box(ux + 9, uy + 10, uw - 18, 56, white, None, 7)
para(ux + 16, uy + 54, "«Во ВкусВилле — завтрак на двоих. Купи мяч. Завтра лечу в Казань, найди отель»",
     uw - 32, size=7.4, color=INK, lead=9.2)

# слушатель
lx, lw_ = 196, 128
lh = 112
ly = event_mid - lh / 2
box(lx, ly, lw_, lh, PANEL, None)
icon(lx + 15, ly + lh - 17, 8, "bolt", NAVY)
text(lx + 28, ly + lh - 21, "Слушатель", "B", 10.5)
bullets = ["голос → текст (Whisper)", "делит сообщение на задачи", "«Принял» за 1–2 секунды", "пауза и повтор по команде"]
by_ = ly + lh - 40
for b in bullets:
    c.setFillColor(ACCENT)
    c.circle(lx + 13, by_ + 2.5, 1.8, stroke=0, fill=1)
    by_ = para(lx + 19, by_, b, lw_ - 26, size=7.6, color=MUTED, lead=9.4) - 3.5
arrow(ux + uw + 3, event_mid, lx - 3, event_mid, INK)

# веер слушатель → агенты по событию
for key, *_ in event_agents:
    arrow(lx + lw_ + 3, event_mid, ax - 3, row_y[key], AGENT[key], lw=1.2, head=4.5)

# ответы
rx = ax + aw + 26
rw = W - M - rx
rh = 104
ry = event_mid - rh / 2 + 4
box(rx, ry, rw, rh, HexColor("#E7F4FB"), TG, lw=1.3)
text(rx + 11, ry + rh - 19, "Ответ в тот же чат", "B", 10.5, TG_DARK)
para(rx + 11, ry + rh - 34, "подборка с ценами, рейтингами и отзывами, совет «что взял бы сам» и ссылки "
     "на покупку или бронь", rw - 22, size=7.6, color=MUTED, lead=9.6)
icon(rx + 18, ry + 15, 6.5, "ok", GREEN)
text(rx + 29, ry + 12, "оплачиваете вы сами", "B", 7.6, GREEN)
for key, *_ in event_agents:
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(ax + aw, row_y[key], ax + aw + 10, row_y[key])
c.setStrokeColor(LINE)
c.line(ax + aw + 10, row_y["shopping"], ax + aw + 10, row_y["booking"])
arrow(ax + aw + 10, event_mid, rx - 3, event_mid, INK)

# журнал + сайт
jy, jh = agents_bottom - 30, 20
box(ax, jy, aw, jh, HexColor("#FFF6E8"), HexColor("#F0C98A"), 5)
text(ax + 10, jy + 7, "Журнал запусков", "B", 8.5, HexColor("#9A6510"))
text(ax + 10 + stringWidth("Журнал запусков", "B", 8.5) + 6, jy + 7,
     "каждый шаг и ответ каждого агента · Google Sheets", "R", 7.5, MUTED)
c.setStrokeColor(HexColor("#F0C98A"))
c.setLineWidth(1)
c.setDash(2, 2)
c.line(ax + aw - 20, agents_bottom, ax + aw - 20, jy + jh)
c.setDash()

sx_, sw_ = rx, rw
sh_ = 58
sy_ = jy - 6
box(sx_, sy_, sw_, sh_, PANEL, None)
text(sx_ + 11, sy_ + sh_ - 17, "Веб-панель", "B", 9.5)
para(sx_ + 11, sy_ + sh_ - 30, "живая схема, история, проигрывание дня; вход по паролю", sw_ - 22, size=7.4,
     color=MUTED, lead=9.2)
arrow(ax + aw + 3, jy + jh / 2, sx_ - 3, sy_ + sh_ / 2 - 6, HexColor("#C99A4A"))

# надзиратель → слушатель: пауза/повтор
wy = row_y["watchdog"]
c.setStrokeColor(PURPLE)
c.setLineWidth(1.2)
c.setDash(3, 2)
c.line(ax - 3, wy, lx + lw_ / 2, wy)
c.setDash()
arrow(lx + lw_ / 2, wy, lx + lw_ / 2, ly - 3, PURPLE, dash=(3, 2))
text(lx + lw_ / 2 + 6, wy + 4, "пауза / повтор", "R", 6.8, PURPLE)

# ================= пример =================
flow_bottom = min(jy, sy_)
ex_top = flow_bottom - 22
bottom = 30
ex_w = 498
text(M, ex_top, "ПРИМЕР: ОДНО ГОЛОСОВОЕ — ЧЕТЫРЕ АГЕНТА", "B", 10, MUTED)
text(M, ex_top - 13, "время условное, по реальным запускам", "R", 8, MUTED)

axis_y = (ex_top - 20 + bottom) / 2 - 2
x0, x1 = M + 26, M + ex_w - 8
t0, t1 = 0, 160  # секунды


def tx_(sec):
    return x0 + (x1 - x0) * (sec - t0) / (t1 - t0)


c.setStrokeColor(LINE)
c.setLineWidth(2)
c.line(x0, axis_y, x1, axis_y)
arrow(x1 - 10, axis_y, x1 + 6, axis_y, LINE, 2)
events = [
    (0, "0 с", TG, "voice", "Голосовое", "4 просьбы подряд", True),
    (12, "2 с", NAVY, "bolt", "«Разобрал на 4 задачи»", "каждая — своему агенту", False),
    (62, "~1 мин", AGENT["grocery"], "grocery", "Продукты", "ссылка на корзину", True),
    (92, "~1,5 мин", AGENT["travel"], "travel", "Поездки", "3 рейса со ссылками", False),
    (118, "~2 мин", AGENT["booking"], "booking", "Жильё", "топ-3 с площадок", True),
    (148, "~2,5 мин", AGENT["shopping"], "shopping", "Покупки", "топ-5 с отзывами", False),
]
for sec, label, color, kind, title, sub, above in events:
    x = tx_(sec)
    icon(x, axis_y, 9, kind, color)
    text(x, axis_y - 21 if above else axis_y + 14, label, "B", 8.5, color, "c")
    ty0 = axis_y + 42 if above else axis_y - 40
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(x, axis_y + (12 if above else -12), x, ty0 + (-4 if above else 10))
    text(x, ty0, title, "B", 8.5, INK, "c")
    text(x, ty0 - 10.5, sub, "R", 7.2, MUTED, "c")

# ================= техника =================
tx0 = M + ex_w + 26
tw = W - M - tx0
box(tx0, bottom - 6, tw, ex_top - bottom + 14, PANEL, None)
text(tx0 + 14, ex_top - 6, "ТЕХНИКА", "B", 10, MUTED)
tech = [
    ("Мозг агентов", "Claude Code Routines (Anthropic) — у каждого агента свой сценарий и инструменты"),
    ("Данные", "MCP-коннекторы ВкусВилла и Туту · Apify: Ozon, WB, Я.Маркет, Островок, Авито · API Суточно"),
    ("Слушатель", "Cloudflare Worker + Workers AI (Whisper): голос, разбор задач, пауза"),
    ("Журнал и сайт", "Google Sheets + React/React Flow на GitHub Pages, данные зашифрованы"),
    ("Безопасность", "ключи — в секретах Cloudflare и облака, ничего не оплачивается автоматически"),
]
yy = ex_top - 24
for head, body in tech:
    text(tx0 + 14, yy, head, "B", 8.3, NAVY)
    yy = para(tx0 + 14, yy - 10.5, body, tw - 28, size=7.4, color=MUTED, lead=9.1) - 4

# подвал
icon(M + 6, bottom - 12, 6, "ok", GREEN)
text(M + 17, bottom - 15, "Агенты не тратят ваши деньги: присылают подборку и ссылку — решение и оплата всегда за вами.",
     "R", 8.3, MUTED)

c.showPage()
c.save()
