import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                Flowable, PageBreak)

pdfmetrics.registerFont(TTFont('AR', r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ARB', r'C:\Windows\Fonts\arialbd.ttf'))

NAVY = colors.HexColor('#14213D')
BLUE = colors.HexColor('#2B6CB0')
GREEN = colors.HexColor('#2F855A')
LIGHT = colors.HexColor('#F0F4F8')
GRAY = colors.HexColor('#5A6472')
ORANGE = colors.HexColor('#C05621')
LINE = colors.HexColor('#C9D4E0')

OUT = r'C:\Claude\Agents\docs\Agents-Executive-Report.pdf'

def P(txt, size=10, bold=False, color=NAVY, leading=None, align=0):
    return Paragraph(txt, ParagraphStyle('s', fontName='ARB' if bold else 'AR',
                                         fontSize=size, leading=leading or size * 1.35,
                                         textColor=color, alignment=align))

def footer(canv, doc):
    canv.saveState()
    canv.setFont('AR', 7.5)
    canv.setFillColor(GRAY)
    canv.drawString(18 * mm, 10 * mm, 'agents-setup · Lereactor · подготовлено Kimi Code')
    canv.drawRightString(192 * mm, 10 * mm, 'стр. %d' % doc.page)
    canv.setStrokeColor(LINE)
    canv.line(18 * mm, 13 * mm, 192 * mm, 13 * mm)
    canv.restoreState()

def header(title, sub):
    t = Table([[P(title, 20, True, colors.white)], [P(sub, 9.5, False, colors.HexColor('#B9C8DE'))]],
              colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), NAVY),
        ('LEFTPADDING', (0, 0), (-1, -1), 14), ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 2), ('TOPPADDING', (0, 1), (-1, 1), 0),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 12),
    ]))
    return t

def styled_table(rows, widths, header_bg=NAVY):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
        ('GRID', (0, 0), (-1, -1), 0.4, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t

class Arch(Flowable):
    def __init__(self, width=174 * mm, height=104 * mm):
        super().__init__()
        self.width, self.height = width, height

    def box(self, c, x, y, w, h, title, sub='', fill=LIGHT, edge=BLUE, tc=NAVY):
        c.setFillColor(fill); c.setStrokeColor(edge); c.setLineWidth(1)
        c.roundRect(x, y, w, h, 4, stroke=1, fill=1)
        c.setFillColor(tc); c.setFont('ARB', 9)
        c.drawCentredString(x + w / 2, y + h - 13, title)
        if sub:
            c.setFont('AR', 7); c.setFillColor(GRAY)
            c.drawCentredString(x + w / 2, y + h - 24, sub)

    def arrow(self, c, x1, y1, x2, y2, label='', dashed=False, color=BLUE):
        c.setStrokeColor(color); c.setFillColor(color); c.setLineWidth(1.2)
        c.setDash(3, 3) if dashed else c.setDash()
        c.line(x1, y1, x2, y2)
        import math
        ang = math.atan2(y2 - y1, x2 - x1)
        for a in (ang + 2.65, ang - 2.65):
            c.line(x2, y2, x2 + 5 * math.cos(a), y2 + 5 * math.sin(a))
        if label:
            c.setFont('AR', 6.8); c.setFillColor(GRAY); c.setDash()
            c.drawCentredString((x1 + x2) / 2, (y1 + y2) / 2 + 4, label)

    def draw(self):
        c = self.canv
        H = self.height
        # координаты от низа flowable
        self.box(c, 0, H - 52, 118, 44, 'Лев · Telegram', 'запросы и ответы', colors.HexColor('#E3EDF7'))
        self.box(c, 168, H - 52, 150, 44, 'Cloudflare Worker', 'shopping-listener · $0', colors.HexColor('#FDF0E0'), ORANGE)
        self.box(c, 372, H - 52, 122, 44, 'Moonshot · Kimi K3', 'LLM · $ за токены', colors.HexColor('#E9E3F5'), colors.HexColor('#6B46C1'))

        self.box(c, 150, H - 130, 190, 52, 'VPS · Runner (9 агентов)', 'cron · systemd · напоминания · uptime', colors.HexColor('#E4F0E4'), GREEN)

        self.arrow(c, 118, H - 30, 168, H - 30, 'webhook')
        self.arrow(c, 150, H - 100, 60, H - 52, '')
        self.arrow(c, 340, H - 100, 290, H - 52, '')
        self.arrow(c, 318, H - 30, 372, H - 30, '/llm (прокси)')
        c.setFont('AR', 6.8); c.setFillColor(GRAY)
        c.drawString(4, H - 66, '1. запрос')
        c.drawString(4, H - 76, '5. ответ')

        # правый столбец сервисов: общая шина от раннера + короткие стрелки
        services = [('Google Sheets · лог', '$0'), ('Apify · магазины', 'FREE $5/мес'),
                    ('OpenStreetMap · карты', '$0'), ('MCP: ВкусВилл / Tutu / Avia', '$0')]
        spine_x = 346
        c.setStrokeColor(GRAY); c.setDash(3, 3); c.setLineWidth(1)
        c.line(340, H - 104, spine_x, H - 104)
        y = H - 150
        centers = []
        for name, cost in services:
            cy = y - 10
            centers.append(cy)
            c.setFillColor(colors.white); c.setStrokeColor(LINE); c.setDash()
            c.roundRect(356, y - 22, 138, 20, 3, stroke=1, fill=1)
            c.setFillColor(NAVY); c.setFont('ARB', 7.4)
            c.drawString(362, cy - 3, name)
            c.setFillColor(GRAY); c.setFont('AR', 7)
            c.drawRightString(488, cy - 3, cost)
            y -= 28
        c.setDash(3, 3); c.setStrokeColor(GRAY)
        c.line(spine_x, H - 104, spine_x, centers[-1])
        for cy in centers:
            c.line(spine_x, cy, 356, cy)
        c.setDash()

        # нижний ряд
        self.box(c, 0, 0, 150, 34, 'GitHub · agents-setup', 'код, секреты, Actions', LIGHT, LINE)
        self.box(c, 185, 0, 150, 34, 'VPS cron · Москва', 'новости 08:00 · надзор 4×/сутки', LIGHT, GREEN)
        self.box(c, 370, 0, 124, 34, 'GitHub Actions', 'деплоит воркер · $0', LIGHT, LINE)
        self.arrow(c, 260, 34, 240, H - 130, 'запуски по расписанию', dashed=True, color=GREEN)

story = []
story.append(header('ЛИЧНЫЕ ИИ-АГЕНТЫ', 'Как устроена система, куда идут запросы и где тратятся деньги · ноябрь 2026'))
story.append(Spacer(1, 10))

kpis = [['9 агентов', '24/7', '3 сервиса', '19.11.2026'],
        ['Kimi в одной системе', 'напоминания + uptime', 'под живым контролем', 'проверено в production']]
kt = Table([[P(v, 16, True, BLUE, align=1) for v in kpis[0]],
            [P(v, 8.5, False, GRAY, align=1) for v in kpis[1]]], colWidths=[43.5 * mm] * 4)
kt.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), LIGHT),
                        ('TOPPADDING', (0, 0), (-1, 0), 10), ('BOTTOMPADDING', (0, 1), (-1, 1), 10),
                        ('TOPPADDING', (0, 1), (-1, 1), 2)]))
story.append(kt)
story.append(Spacer(1, 12))

story.append(P('Что делает система', 13, True))
story.append(Spacer(1, 5))
rows = [[P('Агент', 9.5, True, colors.white), P('Задача', 9.5, True, colors.white), P('Запуск', 9.5, True, colors.white)]]
for a, b, tr in [
    ('Новости', 'Дайджест: поиск в интернете, подбор и сжатие новостей', 'cron, ежедневно 08:00 МСК'),
    ('Надзиратель', 'Читает общий лог, находит сбои и циклы, шлёт отчёт', 'cron, каждые 6 часов'),
    ('Покупки', 'Товары на Ozon / WB / Я.Маркете: цены, рейтинги, сравнение', 'фраза в Telegram'),
    ('Продукты', 'ВкусВилл: поиск продуктов и сборка корзины по фразе/фото', 'фраза в Telegram'),
    ('Путешествия', 'Поезда, авиа и отели через Tutu и Aviasales', 'фраза в Telegram'),
    ('Жильё', 'Квартиры на Суточно + метро/центр по OpenStreetMap', 'фраза в Telegram'),
    ('Рядом', 'Кафе, аптеки и места рядом: OpenStreetMap, пешком и маршрут', 'фраза/геопозиция'),
    ('Документы', 'PDF, DOCX, TXT и другие текстовые форматы: выжимка и ответы', 'файл + «почитай»'),
    ('Напоминания', 'Создание, список, отмена и автоматическая доставка', 'фраза + cron ежеминутно'),
    ('Uptime', 'Worker, Runner и сайт; алерт после 2 сбоев и при восстановлении', 'cron каждые 5 минут'),
]:
    rows.append([P(a, 8.5, True), P(b, 8.5), P(tr, 8.5)])
story.append(styled_table(rows, [30 * mm, 106 * mm, 38 * mm]))
story.append(Spacer(1, 8))
story.append(P('<b>Статус:</b> 19.11 документ прочитан через настоящий Telegram file_id, ответ доставлен, '
               'его содержимое не попало в журнал. Напоминание создано Kimi и доставлено планировщиком; '
               'тест «15:00 МСК → 12:00 UTC» пройден. Uptime прошёл реальный FAIL/FAIL/OK self-test. '
               '2ГИС заменён бесплатным OpenStreetMap.', 9))

story.append(PageBreak())
story.append(header('КУДА ИДУТ ЗАПРОСЫ', 'Единый контур: Telegram → Cloudflare → VPS → внешние API'))
story.append(Spacer(1, 8))
story.append(Arch())
story.append(Spacer(1, 8))
for txt in [
    '<b>1.</b> Лев пишет в Telegram. Telegram шлёт webhook в Cloudflare Worker (VPS и домашний ПК к Telegram API напрямую не подключены — региональные ограничения).',
    '<b>2.</b> Воркер вызывает runner на VPS (`/run`, по токену). Runner запускает нужного агента с его промптом.',
    '<b>3.</b> Все обращения к модели Kimi K3 идут через воркер (`/llm`, прокси) — прямой доступ к api.moonshot.ai с VPS с 15.11 заблокирован сетью.',
    '<b>4.</b> Агент пользуется своими данными: Apify (магазины), MCP ВкусВилл/Tutu/Aviasales, OpenStreetMap (карты). Каждый запуск пишется в Google Sheets.',
    '<b>5.</b> Ответ уходит в Telegram через воркер (`/admin/runner-tg`). Новости и надзор стартуют сами по cron на VPS.',
    '<b>Документы.</b> Worker получает файл до 10 МБ, Runner извлекает текст из PDF/DOCX/TXT, Kimi отвечает по содержимому. Исходный текст и ответ не сохраняются в журнале — только технические статусы.',
    '<b>Напоминания и мониторинг.</b> Время по умолчанию — Europe/Moscow (UTC+3). Планировщик доставляет напоминания каждую минуту, uptime проверяет три сервиса каждые 5 минут; оба работают без обращений к LLM.',
]:
    story.append(P(txt, 9.5))
    story.append(Spacer(1, 4))

story.append(PageBreak())
story.append(header('ДЕНЬГИ И ТОКЕНЫ', 'Где расход, где ноль, и что держать под контролем'))
story.append(Spacer(1, 10))
rows = [[P('Сервис', 9.5, True, colors.white), P('За что платим', 9.5, True, colors.white), P('Модель', 9.5, True, colors.white), P('Сейчас', 9.5, True, colors.white)]]
for a, b, m, s in [
    ('Moonshot (Kimi K3)', 'Все ответы агентов — токены LLM', 'pay-as-you-go', 'баланс проверять в кабинете'),
    ('VPS 193.233.84.69', 'Runner, cron, MCP Aviasales', 'фикс. тариф хостера', '1 CPU / 1 ГБ'),
    ('Apify', 'Парсинг Ozon / WB / Я.Маркета', 'FREE, $5/мес включено', 'в норме'),
    ('Cloudflare', 'Воркер: webhook, прокси LLM и Telegram', 'бесплатный тариф', '$0'),
    ('Google Sheets', 'Общий лог запусков + сайт-дашборд', 'бесплатно', '$0'),
    ('OpenStreetMap', 'Карты, геокодинг, поиск мест', 'бесплатно, без ключа', '$0'),
    ('GitHub', 'Код, Actions-деплой, Pages-сайт', 'бесплатно', '$0'),
]:
    rows.append([P(a, 9, True), P(b, 9), P(m, 9), P(s, 9)])
story.append(styled_table(rows, [36 * mm, 70 * mm, 40 * mm, 28 * mm]))
story.append(Spacer(1, 10))
story.append(P('Где тратятся токены LLM', 12, True))
story.append(Spacer(1, 4))
story.append(P('Каждый запуск агента — один диалог с моделью: системный промпт + инструменты на входе, '
               'рассуждения и ответ на выходе. Самые «дорогие» — <b>Новости</b> (много поиска и длинный дайджест) и '
               '<b>Покупки</b> (разбор результатов парсинга). Документы расходуют токены на чтение и выжимку; '
               'Напоминания — на понимание команды. Их доставка и uptime-мониторинг работают без LLM. '
               'Подписка Kimi Code в этот расход <b>не входит</b>: у агентов отдельный API-ключ Moonshot.', 9.5))
story.append(Spacer(1, 10))
story.append(P('Контроль и риски', 12, True))
story.append(Spacer(1, 4))
for txt in [
    '<b>Единая точка отказа — VPS.</b> Рекомендация: периодический снимок /opt/agents и /etc/agents (код уже в git).',
    '<b>Баланс LLM — основной переменный расход.</b> Следить за пополнением; надзиратель уже ловит сбои API.',
    '<b>Ротация ключей задокументирована</b> (docs/SETUP-GUIDE): Moonshot, Apify, Cloudflare, GitHub — процедуры отработаны на практике.',
    '<b>Git — источник истины.</b> Код, промпты и деплой воркера версионируются; откат любого изменения — одна команда.',
]:
    story.append(P(txt, 9.5))
    story.append(Spacer(1, 4))

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                        topMargin=16 * mm, bottomMargin=18 * mm,
                        title='Личные ИИ-агенты — архитектура и расходы')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('written:', OUT, os.path.getsize(OUT), 'bytes')
