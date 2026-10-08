// Cloudflare Worker — общий слушатель Telegram-вебхука для событийных агентов
// (shopping: Ozon/WB/Я.Маркет, grocery: ВкусВилл, travel: Туту, booking: жильё). Файл не переименован в
// мульти-агентный, чтобы не трогать уже настроенный Telegram-вебхук.
// Заменяет scripts/shopping-listener.gs: Google Apps Script Web App всегда
// отвечает на POST через 302-редирект на script.googleusercontent.com, а
// Telegram НЕ следует за редиректами при доставке в вебхук — считает такую
// доставку сбоем ("Wrong response from the webhook: 302 Found") и повторяет
// её, иногда сразу несколько раз, иногда с большой задержкой. Это было
// причиной почти всех странностей при первом тестировании (пропавшие /
// задвоенные / сильно опоздавшие сообщения). Cloudflare Worker отвечает
// обычным 200 сразу, без этой проблемы.
//
// Деплой: dash.cloudflare.com → Workers & Pages → Create → вставить этот
// файл как код воркера → Deploy → скопировать URL (*.workers.dev).
//
// Секреты — Settings → Variables and Secrets (тип Secret, не Text):
//   ROUTINE_TRIGGER_URL            — URL fire-эндпоинта Routine "Shopping"
//   ROUTINE_TRIGGER_TOKEN          — Bearer-токен для этого эндпоинта
//   ROUTINE_TRIGGER_URL_GROCERY    — URL fire-эндпоинта Routine "grocery" (ВкусВилл)
//   ROUTINE_TRIGGER_TOKEN_GROCERY  — Bearer-токен для этого эндпоинта
//   ROUTINE_TRIGGER_URL_TRAVEL     — URL fire-эндпоинта Routine "Travel" (Туту)
//   ROUTINE_TRIGGER_TOKEN_TRAVEL   — Bearer-токен для этого эндпоинта
//   ROUTINE_TRIGGER_URL_BOOKING    — URL fire-эндпоинта Routine "Booking" (жильё)
//   ROUTINE_TRIGGER_TOKEN_BOOKING  — Bearer-токен для этого эндпоинта
//   TELEGRAM_BOT_TOKEN             — токен @LAgentsControl_bot (для голосовых:
//                                    скачать файл + отправить ack/ошибку в чат)
//   WATCHDOG_ADMIN_TOKEN           — ключ надзирателя для /admin/* (пауза агента,
//                                    повтор зависшего запроса, статус)
//   APIFY_TOKEN                    — для ежедневной проверки кредита Apify (cron)
//
// Bindings — Settings → Bindings:
//   AI  — Workers AI binding (Whisper для голосовых + ИИ-маршрутизатор для текста без слов агентов),
//         добавляется через дашборд (Add → Workers AI), API-токена не требует.
//
// Дедупликация по update_id — через Workers KV (Storage & Databases → KV →
// создать namespace → привязать к воркеру в Settings → Bindings, переменная
// UPDATE_CACHE). Без неё дублирующая доставка от Telegram (маловероятная
// теперь, раз ответ мгновенный, но не невозможная) снова вызовет двойной fire.
//
// Регистрация как Telegram-вебхук (после деплоя, из командной строки):
//   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
//     -d "url=<URL воркера>" \
//     -d 'allowed_updates=["message","business_message"]'

// Порядок важен: grocery → booking → travel → shopping. "вкусвилл, купи молоко" уходит
// только в grocery, "найди билет на поезд" — только в travel (а не в shopping
// по корню "найд"). Правило одинаково
// применяется и к тексту, и к расшифровке голосового — триггер-слово может
// быть где угодно во фразе, не обязательно первым словом.
// «вкусфил», «фкусвил» — так Whisper иногда слышит «ВкусВилл» в голосовых.
const GROCERY_TRIGGER_WORDS = ['вкусвил', 'вкусфил', 'фкусвил', 'продукт'];
const SHOPPING_TRIGGER_WORDS = ['куп', 'заказ', 'найд', 'buy', 'order', 'find'];
// travel матчится по НАЧАЛУ СЛОВА, а не подстрокой: корень "отел" подстрокой
// ловит "хотел"/"хотели", "жд" — "жду"/"между". Поэтому "жд"/"ржд" — только
// целым словом (TRAVEL_EXACT_WORDS).
const TRAVEL_WORD_PREFIXES = [
  'билет', 'поезд', 'электричк', 'самолет', 'самолёт', 'авиа', 'рейс',
  'перелет', 'перелёт', 'автобус', 'туту',
  // глаголы поездки из голосовых: «завтра нужно улететь в Петербург»
  'улет', 'улёт', 'улечу', 'вылет', 'полет', 'полёт', 'полечу', 'прилет', 'прилёт', 'слетат', 'слетаю',
  'лететь', 'аэропорт', 'сапсан', 'плацкарт',
  // «как доехать / добраться до Твери»
  'доехат', 'доеду', 'доедем', 'добрат', 'доберус', 'доберем', 'доберём', 'добира'
];
// Жильё — тоже по началу слова («отел» подстрокой ловит «хотели»).
const BOOKING_WORD_PREFIXES = [
  'отел', 'гостиниц', 'хостел', 'апартамент', 'квартир', 'коттедж', 'шале',
  'лофт', 'глэмпинг', 'глемпинг', 'жиль', 'жилье', 'жильё', 'посуточн',
  'суточно', 'переноч', 'островок', 'букинг', 'booking', 'airbnb', 'эйрбнб',
  'мотел', 'гестхаус', 'гостев', 'санатор', 'пансионат', 'турбаз', 'этел', 'отэл',
  // «где остановиться / переночевать / пожить», «ночлег», «заселиться»
  'остановит', 'остановлюс', 'остановимс', 'ночлег', 'ночевк', 'ночёвк', 'заселит', 'заселени', 'заселен',
  'поселит', 'поселимс', 'пожит'
];
// Многозначные глаголы («снять деньги», «забронировать билет/столик») — к жилью,
// только если рядом есть слово про ночлег и нет слов про транспорт/столик.
const BOOKING_VERB_PREFIXES = ['заброниров', 'заброниру', 'забронь', 'бронир', 'бронь', 'аренд', 'снять', 'сними', 'сниму', 'снимем', 'снимешь', 'снимите'];
const BOOKING_CONTEXT_EXACT = ['дом', 'домик', 'домики', 'дача', 'дачу', 'номер', 'номера', 'номерок', 'день', 'дня', 'дней'];
const BOOKING_CONTEXT_PREFIXES = ['комнат', 'ноч', 'сутк', 'суток', 'выходн'];
const BOOKING_VERB_BLOCKERS = ['столик', 'билет', 'место', 'места', 'машин', 'авто', 'деньг', 'видео', 'фото'];
const TRAVEL_EXACT_WORDS = ['жд', 'ржд'];

// Как агент называется в ответах в чат: «✅ Взял в работу: 🚆 Поездки (Туту)».
const AGENT_LABELS = {
  grocery: '🥕 Продукты (ВкусВилл)',
  travel: '🚆 Поездки (Туту)',
  booking: '🏡 Жильё (Суточно, Островок, Авито, Туту)',
  shopping: '🛒 Покупки (Ozon, WB, Я.Маркет)'
};
// «включи поездки» — снять паузу, которую поставил надзиратель.
const AGENT_NAMES = {
  grocery: ['продукты', 'вкусвилл', 'grocery'],
  travel: ['поездки', 'туту', 'travel'],
  booking: ['жильё', 'жилье', 'booking'],
  shopping: ['покупки', 'shopping']
};
// Запуски храним 2 суток — надзирателю этого хватает, чтобы найти и повторить зависший.
const FIRE_TTL_S = 172800;

// «помощь» / «?» — сразу отвечаем шпаргалкой, без запуска агентов. Только если
// сообщение целиком состоит из такого слова (иначе «помощь с билетом в Казань»
// ушло бы сюда, а не агенту поездок).
const HELP_WORDS = ['?', 'помощь', 'помоги', 'help', '/help', '/start', 'шпаргалка', 'что умеешь', 'что ты умеешь'];

const HELP_TEXT = `🦁 Шпаргалка по агентам

🥕 Продукты (ВкусВилл) — слова «вкусвилл», «продукты»
• вкусвилл, молоко и хлеб
• собери продукты на борщ
• вкусвилл, что со скидкой из сыров

🚆 Поездки (Туту) — «билет», «поезд», «самолёт», «электричка», «автобус», «как доехать / добраться»
• поезд в Питер на субботу
• билет Москва — Казань 15 октября туда-обратно на двоих
• самолёт в Сочи на выходные, с багажом
Не написал откуда, когда или сколько — считаю: из Москвы, завтра, 1 взрослый (и пишу это в ответе).

🏡 Жильё (Суточно, Островок, Авито, Туту) — «отель», «квартира», «коттедж», «жильё», «посуточно», «букинг», «где остановиться / переночевать», «ночлег», «сними/забронируй … на ночь»
• коттедж под Казанью на выходные на 6 человек, с баней
• квартира в Питере с 20 по 23 у метро, до 5000 за ночь
• отель в Сочи на 3 ночи с пятницы, с завтраком
Не написал даты или сколько гостей — считаю: ближайшие выходные, 2 гостя (и пишу это в ответе).

🛒 Покупки (Ozon, WB, Я.Маркет) — «купи», «найди», «закажи»
• найди наушники Sony WH-1000XM5
• купи робот-пылесос до 30 000
• закажи кроссовки Nike 43 размер
• фото товара с подписью «найди такое»
Ответ: топ-5 с ценами, рейтингом и отзывами по трём площадкам + совет, что взять (1–3 мин).

📰 Новости — сами, каждый день в 08:00
🛡️ Надзиратель — фоном каждые 6 часов, отчёт в 09:00. Зациклившегося агента ставит на паузу, зависший запрос повторяет. Снять паузу — «включи поездки» (продукты, покупки, жильё).

🧩 Несколько дел в одном сообщении — разберу по агентам:
• закажи во вкусвилл завтрак на двоих. А ещё купи футбольный мяч. Завтра еду в Казань — найди отель
• поезд и отель в Казань на выходные
• как добраться до Твери в субботу и где там остановиться

🧠 Без этих слов тоже можно — пойму по смыслу: «подарок маме до 5000», «молока бы на завтра», «нужны кроссовки для бега».
🎙️ Можно голосом — те же слова.
❓ Эта подсказка — «помощь» или «?»`;

function parseResumeCommand(text) {
  const m = (text || '').trim().toLowerCase().match(/^(?:включи|запусти)\s+(?:агента?\s+)?([a-zа-яё]+)[!.]*$/u);
  if (!m) return null;
  return Object.keys(AGENT_NAMES).find((agent) => AGENT_NAMES[agent].includes(m[1])) || null;
}

function isHelpRequest(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/@\w+$/, '');
  return HELP_WORDS.includes(t) || HELP_WORDS.includes(t.replace(/[?!.,…\s]+$/u, ''));
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Whisper иногда пишет составные слова с пробелом ("Вкус Вилл" вместо
// "вкусвилл") — убираем всё, кроме букв/цифр, перед сравнением, чтобы
// такие разночтения не ломали матч триггер-слова. Применяется одинаково
// и к тексту, и к расшифровке голосового.
function normalizeForMatching(text) {
  return text.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
}

function matchesTriggerWords(text, roots) {
  if (!text) return false;
  const normalized = normalizeForMatching(text);
  return roots.some((root) => normalized.includes(root));
}

function wordsOf(text) {
  return (text || '').toLowerCase().split(/[^a-zа-яё0-9]+/).filter(Boolean);
}

function matchesTravelWords(text) {
  return wordsOf(text).some(
    (word) =>
      TRAVEL_EXACT_WORDS.includes(word) || TRAVEL_WORD_PREFIXES.some((prefix) => word.startsWith(prefix))
  );
}

function matchesBookingWords(text) {
  const words = wordsOf(text);
  if (words.some((word) => BOOKING_WORD_PREFIXES.some((prefix) => word.startsWith(prefix)))) return true;
  const hasVerb = words.some((word) => BOOKING_VERB_PREFIXES.some((prefix) => word.startsWith(prefix)));
  if (!hasVerb || matchesTravelWords(text)) return false;
  if (words.some((word) => BOOKING_VERB_BLOCKERS.some((prefix) => word.startsWith(prefix)))) return false;
  return words.some(
    (word) =>
      BOOKING_CONTEXT_EXACT.includes(word) || BOOKING_CONTEXT_PREFIXES.some((prefix) => word.startsWith(prefix))
  );
}

// Решает, какому Routine адресовать сообщение (или null, если ни один
// набор триггер-слов не совпал).
function detectTarget(text) {
  if (matchesTriggerWords(text, GROCERY_TRIGGER_WORDS)) return 'grocery';
  if (matchesBookingWords(text)) return 'booking';
  if (matchesTravelWords(text)) return 'travel';
  if (matchesTriggerWords(text, SHOPPING_TRIGGER_WORDS)) return 'shopping';
  return null;
}

// Одно сообщение — несколько агентов: «закажи во вкусвилл завтрак. А ещё купи мяч.
// Завтра еду в Казань, найди отель». Режем на предложения (и по «а ещё», «а также»),
// у каждого предложения — свои агенты; предложения без агента — контекст (место, даты)
// для следующих, а хвостовые — для последнего агента; плюс всё сообщение как контекст
// (место и даты часто в чужой части). Один агент → как раньше.
const AGENT_SCOPE = {
  grocery: 'продукты во ВкусВилле',
  travel: 'билеты на поезд, самолёт, автобус, электричку',
  booking: 'жильё (отели, квартиры, дома)',
  shopping: 'товары на маркетплейсах'
};
const AGENT_ORDER = ['grocery', 'booking', 'travel', 'shopping'];

function splitSentences(text) {
  return text
    .split(/(?<=[.!?;…])\s+|\n+/)
    .flatMap((part) => part.split(/\s*,?\s+(?:а|и)\s+ещ[её]\s+|\s*,?\s+а\s+также\s+|\s*,?\s+кроме\s+того,?\s+/i))
    .map((part) => part.trim())
    .filter(Boolean);
}

function sentenceTargets(sentence) {
  if (matchesTriggerWords(sentence, GROCERY_TRIGGER_WORDS)) return ['grocery'];
  const targets = [];
  if (matchesBookingWords(sentence)) targets.push('booking');
  if (matchesTravelWords(sentence)) targets.push('travel');
  if (!targets.length) {
    if (matchesTriggerWords(sentence, SHOPPING_TRIGGER_WORDS)) targets.push('shopping');
    return targets;
  }
  // «купи мяч и найди отель» — глагол покупки в своей части фразы, без жилья/транспорта.
  const shoppingClause = sentence
    .split(/\s*,\s*|\s+и\s+/)
    .some(
      (clause) =>
        matchesTriggerWords(clause, SHOPPING_TRIGGER_WORDS) && !matchesBookingWords(clause) && !matchesTravelWords(clause)
    );
  if (shoppingClause) targets.push('shopping');
  return targets;
}

// Внутри предложения — ещё и по запятым (голосовые обычно одной фразой через запятые):
// «…завтрак во вкусвилле, купи мячик, посмотри билеты в Питер». Кусок без агента
// («у метро», «до 5000») приклеивается к предыдущему; «купи молоко, хлеб во вкусвилле» —
// перечисление ДО ВкусВилла отходит ВкусВиллу.
function splitChunks(sentence) {
  const parts = sentence.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  for (const part of parts) {
    const targets = sentenceTargets(part);
    const prev = chunks[chunks.length - 1];
    if (!targets.length && prev && prev.targets.length) prev.sentence += ', ' + part;
    else chunks.push({ sentence: part, targets });
  }
  const groceryAt = chunks.findIndex((chunk) => chunk.targets.includes('grocery'));
  if (groceryAt > 0 && chunks.slice(0, groceryAt).every((chunk) => chunk.targets.join() === 'shopping')) {
    return [{ sentence, targets: ['grocery'] }];
  }
  const distinct = new Set(chunks.flatMap((chunk) => chunk.targets));
  return distinct.size > 1 ? chunks : [{ sentence, targets: sentenceTargets(sentence) }];
}

// → [{target, text, shown}]; пусто — никому; один элемент — текст целиком, как раньше.
function planDispatch(text) {
  if (!text) return [];
  const sentences = splitSentences(text).flatMap(splitChunks);
  const firstIndex = (agent) => sentences.findIndex((item) => item.targets.includes(agent));
  const agents = AGENT_ORDER.filter((agent) => firstIndex(agent) >= 0).sort((a, b) => firstIndex(a) - firstIndex(b));
  if (agents.length <= 1) {
    const target = detectTarget(text);
    return target ? [{ target, text, shown: text }] : [];
  }
  const lastTargeted = sentences.map((item) => item.targets.length > 0).lastIndexOf(true);
  return agents.map((agent) => {
    const lastOwn = sentences.map((item) => item.targets.includes(agent)).lastIndexOf(true);
    const keep = sentences.filter(
      (item, i) =>
        item.targets.includes(agent) ||
        (!item.targets.length && (i < lastOwn || (i > lastTargeted && sentences[lastTargeted].targets.includes(agent))))
    );
    return {
      target: agent,
      text: keep.map((item) => item.sentence).join(' ') + agentNote(agent, agents, text),
      shown: keep.filter((item) => item.targets.includes(agent)).map((item) => item.sentence).join(' ')
    };
  });
}

function agentNote(agent, agents, text) {
  const others = agents.filter((other) => other !== agent).map((other) => AGENT_SCOPE[other]);
  return (
    `\n\n(Сообщение разобрано на несколько агентов. Ты отвечаешь только за: ${AGENT_SCOPE[agent]}. ` +
    `${others.join('; ')} — делают другие агенты, это не ищи. ` +
    `Всё сообщение — только для контекста (место, даты, сколько людей): «${text}»)`
  );
}

// ИИ-маршрутизатор — запасной путь. Ключевые слова остаются главным (бесплатно и мгновенно);
// если ни одно не совпало, но сообщение похоже на просьбу, — один короткий вопрос модели
// Workers AI «кому это?» (тот же binding AI, что и Whisper; бесплатный суточный лимит Cloudflare).
// Короткие реплики («спасибо», «ок») до модели не доходят; запусков модели — не больше лимита в сутки.
const AI_ROUTER_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const AI_ROUTER_DAILY_LIMIT = 200;
const AI_ROUTER_MIN_CONFIDENCE = 0.7;
const SMALL_TALK_WORDS = [
  'спасибо', 'спс', 'благодарю', 'ок', 'окей', 'ага', 'угу', 'да', 'нет', 'привет', 'пока', 'класс', 'супер',
  'отлично', 'понял', 'поняла', 'понятно', 'хорошо', 'круто', 'норм', 'ясно', 'ну', 'ладно', 'thanks', 'ok', 'большое', 'огромное'
];
const AI_ROUTER_PROMPT = `Ты — маршрутизатор личного Telegram-ассистента. Реши, просит ли пользователь сейчас что-то сделать кого-то из агентов, и кого именно.
Агенты:
- grocery — продукты и еда домой из ВкусВилла: завтрак, ужин, продукты на рецепт, привезти поесть;
- travel — билеты на поезд, самолёт, автобус, электричку; как добраться из города в город;
- booking — жильё: отель, квартира, дом, коттедж на ночь или сутки; где остановиться, переночевать;
- shopping — товары на маркетплейсах (Ozon, Wildberries, Я.Маркет): техника, одежда, вещи, подарки, сравнить цены на товар.
Правила:
- Задача — только явная просьба найти, подобрать, купить, заказать, забронировать. Рассказ, мнение, жалоба, благодарность, вопрос о прошлом, шутка, болтовня — не задача: tasks пустой.
- В одном сообщении может быть несколько задач для разных агентов — каждую отдельно, словами пользователя.
- Не уверен — tasks пустой. confidence — от 0 до 1.
Примеры:
«хочу на море в сентябре, где остановиться подешевле?» → {"tasks":[{"agent":"booking","text":"хочу на море в сентябре, где остановиться подешевле?","confidence":0.85}]}
«подарок маме на день рождения, бюджет 5000» → {"tasks":[{"agent":"shopping","text":"подарок маме на день рождения, бюджет 5000","confidence":0.8}]}
«что-нибудь на ужин на троих, чтобы привезли через час» → {"tasks":[{"agent":"grocery","text":"что-нибудь на ужин на троих, чтобы привезли через час","confidence":0.85}]}
«как добраться до Твери в субботу и где там переночевать» → {"tasks":[{"agent":"travel","text":"как добраться до Твери в субботу","confidence":0.9},{"agent":"booking","text":"где там переночевать","confidence":0.85}]}
«вчера ездил в Тверь, было классно» → {"tasks":[]}
«отель был ужасный» → {"tasks":[]}
Ответь только JSON без пояснений: {"tasks":[{"agent":"grocery|travel|booking|shopping","text":"…","confidence":0.0}]}`;

function aiRouterEligible(text) {
  if (!text || text.trim().length < 8) return false;
  const words = wordsOf(text);
  return words.length >= 2 && !words.every((word) => SMALL_TALK_WORDS.includes(word));
}

function parseRouterTasks(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    const found = raw.match(/\{[\s\S]*\}/);
    if (!found) return [];
    try {
      data = JSON.parse(found[0]);
    } catch (err) {
      return [];
    }
  }
  const byAgent = new Map();
  for (const task of (data && data.tasks) || []) {
    if (!AGENT_SCOPE[task.agent] || !(Number(task.confidence) >= AI_ROUTER_MIN_CONFIDENCE)) continue;
    const part = String(task.text || '').trim();
    byAgent.set(task.agent, [byAgent.get(task.agent), part].filter(Boolean).join(' '));
  }
  return [...byAgent].map(([agent, part]) => ({ agent, text: part }));
}

// → {plan, reason}; plan того же вида, что у planDispatch. Сам ничего не запускает.
async function aiRoute(env, text) {
  if (!env.AI) return { plan: [], reason: 'no AI binding' };
  if (!aiRouterEligible(text)) return { plan: [], reason: 'small talk' };
  if (env.UPDATE_CACHE) {
    const key = 'ai_router:' + new Date().toISOString().slice(0, 10);
    const used = Number(await env.UPDATE_CACHE.get(key)) || 0;
    if (used >= AI_ROUTER_DAILY_LIMIT) return { plan: [], reason: 'daily limit' };
    await env.UPDATE_CACHE.put(key, String(used + 1), { expirationTtl: 172800 });
  }
  let raw;
  try {
    const result = await env.AI.run(AI_ROUTER_MODEL, {
      messages: [
        { role: 'system', content: AI_ROUTER_PROMPT },
        { role: 'user', content: text.slice(0, 1500) }
      ],
      max_tokens: 400,
      temperature: 0
    });
    raw = result.response;
  } catch (err) {
    return { plan: [], reason: 'ai error: ' + String(err) };
  }
  const tasks = parseRouterTasks(raw);
  if (!tasks.length) return { plan: [], reason: 'not a task', raw };
  const agents = tasks.map((task) => task.agent);
  const plan =
    tasks.length === 1
      ? [{ target: tasks[0].agent, text, shown: text }]
      : tasks.map((task) => ({ target: task.agent, text: task.text + agentNote(task.agent, agents, text), shown: task.text }));
  return { plan, reason: 'ai', raw };
}

const AI_ROUTER_ACK = '🧠 Слов агента не нашёл — понял по смыслу.\n';

function planAck(plan) {
  if (plan.length === 1) return `✅ Взял в работу: ${AGENT_LABELS[plan[0].target]}`;
  return (
    `✅ Разобрал на ${plan.length} задачи:\n` +
    plan.map((item) => `${AGENT_LABELS[item.target]} — «${item.shown.replace(/[.!?;…]+$/, '')}»`).join('\n')
  );
}

// Запуск по плану: одно общее «Принял», затем агенты параллельно (пауза — у каждого своя).
async function dispatchPlan(env, plan, baseParams, ackPrefix = '', recordExtra = {}) {
  await sendTelegramMessage(env, {
    chatId: baseParams.chat_id,
    text: ackPrefix + planAck(plan),
    replyToMessageId: baseParams.message_id,
    businessConnectionId: baseParams.business_connection_id
  });
  return Promise.all(plan.map((item) => dispatch(env, item.target, { ...baseParams, text: item.text }, null, recordExtra)));
}

// Текст без слов агентов: спросить модель и, если это задача, запустить по её плану.
// Не задача — молчим, как и раньше.
async function aiRouteAndDispatch(env, text, params) {
  const routed = await aiRoute(env, text);
  if (!routed.plan.length) return { ok: true, skipped: 'no trigger word', ai_router: routed.reason };
  const results = await dispatchPlan(env, routed.plan, params, AI_ROUTER_ACK, { router: 'ai' });
  return { ok: true, triggered: true, ai_router: 'ai', targets: routed.plan.map((item) => item.target), results };
}

function largestPhotoFileId(photoArray) {
  if (!photoArray || !photoArray.length) return '';
  return photoArray[photoArray.length - 1].file_id;
}

// Достаёт из сообщения: текст-кандидат для проверки триггера, file_id фото
// (если есть) и file_id голосового (если есть). Голосовое обрабатывается
// отдельной веткой в fetch(), т.к. требует асинхронной транскрипции прежде
// чем можно будет определить target.
function extractCandidate(message) {
  if (!message) return { text: '', photoFileId: '', voiceFileId: '' };
  if (message.text) {
    return { text: message.text, photoFileId: '', voiceFileId: '' };
  }
  if (message.voice) {
    return { text: '', photoFileId: '', voiceFileId: message.voice.file_id };
  }
  if (message.photo && message.caption) {
    return { text: message.caption, photoFileId: largestPhotoFileId(message.photo), voiceFileId: '' };
  }
  // Реплай текстом на более раннее фото
  if (message.reply_to_message && message.reply_to_message.photo && message.text) {
    return { text: message.text, photoFileId: largestPhotoFileId(message.reply_to_message.photo), voiceFileId: '' };
  }
  return { text: '', photoFileId: '', voiceFileId: '' };
}

// whisper-large-v3-turbo на Workers AI требует 'audio' как base64-строку
// (не массив байт, вопреки примерам для старой модели @cf/openai/whisper) —
// см. официальный тьюториал по chunking-транскрипции. btoa вместо Buffer,
// т.к. Buffer требует compatibility flag nodejs_compat, которого нет.
function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Скачивает голосовое (.oga, Opus/OGG) через Bot API и прогоняет через
// Whisper на Workers AI. language: 'ru' — форсируем русский, чтобы модель
// не тратила время на автоопределение языка и не путала короткие фразы
// с похожими по фонетике языками.
async function transcribeVoice(env, fileId) {
  const fileInfoResp = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileInfo = await fileInfoResp.json();
  if (!fileInfo.ok) {
    throw new Error('getFile failed: ' + JSON.stringify(fileInfo));
  }

  const audioResp = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`
  );
  if (!audioResp.ok) {
    throw new Error('voice file download failed: ' + audioResp.status);
  }

  const audio = bytesToBase64(new Uint8Array(await audioResp.arrayBuffer()));
  // подсказка словаря: без неё «ВкусВилл» слышится как «вкус фил», «отель» — как «этель».
  // Если модель подсказку не примет — распознаём как раньше, без неё.
  const hint =
    'ВкусВилл, продукты. Купи на Озоне, Wildberries, Яндекс Маркете. Билеты на поезд, самолёт. ' +
    'Забронируй отель, квартиру, коттедж посуточно на Суточно, Островке, Авито. Москва, Питер, Казань, Сочи.';
  let result;
  try {
    result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, language: 'ru', initial_prompt: hint });
  } catch (err) {
    result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, language: 'ru' });
  }

  return ((result && result.text) || '').trim();
}

async function sendTelegramMessage(env, { chatId, text, replyToMessageId, businessConnectionId }) {
  const body = { chat_id: chatId, text };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  if (businessConnectionId) body.business_connection_id = businessConnectionId;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function triggerRoutine(env, target, params) {
  const endpoints = {
    grocery: [env.ROUTINE_TRIGGER_URL_GROCERY, env.ROUTINE_TRIGGER_TOKEN_GROCERY],
    travel: [env.ROUTINE_TRIGGER_URL_TRAVEL, env.ROUTINE_TRIGGER_TOKEN_TRAVEL],
    booking: [env.ROUTINE_TRIGGER_URL_BOOKING, env.ROUTINE_TRIGGER_TOKEN_BOOKING],
    shopping: [env.ROUTINE_TRIGGER_URL, env.ROUTINE_TRIGGER_TOKEN]
  };
  const [url, token] = endpoints[target];
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text: JSON.stringify(params) })
  });
  return { status: resp.status, body: await resp.text() };
}

async function getPause(env, target) {
  if (!env.UPDATE_CACHE) return null;
  const raw = await env.UPDATE_CACHE.get('paused:' + target);
  return raw ? JSON.parse(raw) : null;
}

// Общий путь запуска агента для текста, фото и голоса: пауза → ack с именем агента →
// fire → запись запуска (для повтора надзирателем).
async function dispatch(env, target, params, ackText, recordExtra = {}) {
  const reply = (text) =>
    sendTelegramMessage(env, {
      chatId: params.chat_id,
      text,
      replyToMessageId: params.message_id,
      businessConnectionId: params.business_connection_id
    });

  const pause = await getPause(env, target);
  if (pause) {
    await reply(
      `⏸ ${AGENT_LABELS[target]} на паузе — ${pause.reason || 'поставил надзиратель'}.\n` +
        `Включить: «включи ${AGENT_NAMES[target][0]}».`
    );
    return { paused: true };
  }

  if (ackText) await reply(ackText);
  const fireResult = await triggerRoutine(env, target, params);
  if (env.UPDATE_CACHE && fireResult.status === 200) {
    const at = Date.now();
    await env.UPDATE_CACHE.put(`fire:${target}:${at}`, JSON.stringify({ at, params, ...recordExtra }), { expirationTtl: FIRE_TTL_S });
  }
  return fireResult;
}

// Кредит Apify: раз в день (cron 06:00 UTC = 09:00 МСК) слушатель смотрит расход за месяц и
// на каждый порог один раз за месяц пишет в группу. Без AI — 0 токенов.
const ALERT_CHAT_ID = '-1004369832565';
const APIFY_THRESHOLDS = [0.8, 0.95];
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function usd(value) {
  return '$' + value.toFixed(2).replace('.', ',');
}

async function apifyCredit(env) {
  const resp = await fetch('https://api.apify.com/v2/users/me/limits', {
    headers: { Authorization: 'Bearer ' + env.APIFY_TOKEN }
  });
  if (!resp.ok) throw new Error('apify limits ' + resp.status);
  const { data } = await resp.json();
  const renew = new Date(Date.parse(data.monthlyUsageCycle.endAt) + 1000);
  return {
    used: data.current.monthlyUsageUsd,
    limit: data.limits.maxMonthlyUsageUsd,
    cycle: data.monthlyUsageCycle.startAt.slice(0, 10),
    renews: `${renew.getUTCDate()} ${RU_MONTHS[renew.getUTCMonth()]}`
  };
}

function apifyAlertText(credit, level) {
  const spent = `${usd(credit.used)} из ${usd(credit.limit)} (${Math.round((credit.used / credit.limit) * 100)} %)`;
  if (level >= 0.95) {
    return (
      `⛔ Кредит Apify почти кончился: ${spent}.\n` +
      `До ${credit.renews} Ozon, WB, Я.Маркет, Островок и Авито могут не отвечать. ` +
      'Суточно, Туту и ВкусВилл работают как обычно.'
    );
  }
  return (
    `⚠️ Apify: потрачено ${spent}, кредит обновится ${credit.renews}.\n` +
    'Запрос в 🛒 Покупки стоит ≈$0,15, в 🏡 Жильё ≈$0,08.'
  );
}

// dryRun — только посчитать и показать текст (для /admin/apify), без отправки и отметки в KV.
async function checkApifyCredit(env, { dryRun = false } = {}) {
  if (!env.APIFY_TOKEN) return { ok: false, error: 'no APIFY_TOKEN' };
  const credit = await apifyCredit(env);
  const share = credit.limit ? credit.used / credit.limit : 0;
  const level = [...APIFY_THRESHOLDS].reverse().find((threshold) => share >= threshold);
  if (!level) return { ok: true, ...credit, share, alert: null };
  const key = (threshold) => `apify_alert:${credit.cycle}:${threshold}`;
  if (env.UPDATE_CACHE && (await env.UPDATE_CACHE.get(key(level)))) {
    return { ok: true, ...credit, share, alert: 'already sent' };
  }
  const text = apifyAlertText(credit, level);
  if (dryRun) return { ok: true, ...credit, share, alert: text, sent: false };
  await sendTelegramMessage(env, { chatId: env.ALERT_CHAT_ID || ALERT_CHAT_ID, text });
  if (env.UPDATE_CACHE) {
    // перескочили сразу на 95 % — предупреждение про 80 % уже не нужно
    for (const threshold of APIFY_THRESHOLDS.filter((t) => t <= level)) {
      await env.UPDATE_CACHE.put(key(threshold), '1', { expirationTtl: 40 * 86400 });
    }
  }
  return { ok: true, ...credit, share, alert: text, sent: true };
}

// Служебные команды надзирателя (Routine Guard). POST /admin/<action>,
// Authorization: Bearer WATCHDOG_ADMIN_TOKEN, тело JSON.
//   pause   {agent, reason}      — поставить на паузу (слушатель перестаёт запускать агента)
//   retry   {agent, started_at}  — один раз повторить запрос, запуск которого завис
//   status  {}                   — какие агенты на паузе
async function handleAdmin(env, action, body) {
  const agent = body.agent;
  if (action === 'status') {
    const paused = {};
    for (const a of Object.keys(AGENT_LABELS)) {
      const p = await getPause(env, a);
      if (p) paused[a] = p;
    }
    return { ok: true, paused };
  }
  // apify {send?} — расход кредита Apify и текст предупреждения; send: true — отправить как по расписанию.
  if (action === 'apify') return checkApifyCredit(env, { dryRun: body.send !== true });
  // route {text} — как слушатель разобрал бы текст (слова, затем модель), без запуска агентов.
  if (action === 'route') {
    const text = String(body.text || '');
    const keywords = planDispatch(text);
    const ai = keywords.length ? null : await aiRoute(env, text);
    return { ok: true, keywords: keywords.map((item) => item.target), ai };
  }
  if (!AGENT_LABELS[agent]) return { ok: false, error: 'unknown agent' };

  if (action === 'pause') {
    const pause = { reason: body.reason || '', at: new Date().toISOString() };
    await env.UPDATE_CACHE.put('paused:' + agent, JSON.stringify(pause));
    return { ok: true, paused: agent };
  }

  if (action === 'retry') {
    // Запуск, который агент отметил как started в started_at, — последний fire этого
    // агента не позже started_at (агенту нужно до пары минут, чтобы стартовать).
    const startedMs = Date.parse(body.started_at);
    if (Number.isNaN(startedMs)) return { ok: false, error: 'bad started_at' };
    const list = await env.UPDATE_CACHE.list({ prefix: `fire:${agent}:` });
    const candidates = list.keys
      .map((k) => ({ key: k.name, at: Number(k.name.split(':')[2]) }))
      .filter((k) => k.at <= startedMs + 60000 && k.at >= startedMs - 10 * 60000)
      .sort((x, y) => y.at - x.at);
    if (!candidates.length) return { ok: false, error: 'fire not found' };
    const record = JSON.parse(await env.UPDATE_CACHE.get(candidates[0].key));
    if (record.retried) return { ok: false, error: 'already retried' };
    if (await getPause(env, agent)) return { ok: false, error: 'agent paused' };
    await env.UPDATE_CACHE.put(candidates[0].key, JSON.stringify({ ...record, retried: true }), { expirationTtl: FIRE_TTL_S });
    const fireResult = await dispatch(
      env,
      agent,
      record.params,
      `🔁 Прошлый запуск завис — повторяю. Снова в работе: ${AGENT_LABELS[agent]}`,
      // повтор сам не повторяется — даже если и он зависнет
      { retried: true }
    );
    return { ok: true, retried: agent, text: record.params.text, fire_status: fireResult.status };
  }

  return { ok: false, error: 'unknown action' };
}

// Ветка для голосовых сообщений: транскрипция → определение target → ack/
// сообщение об ошибке в чат → fire нужной Routine. Асинхронная, поэтому
// вызывается отдельно от синхронного пути текста/фото (см. fetch()).
async function processVoiceMessage(env, message, update, candidate) {
  const chatId = message.chat.id;
  const messageId = message.message_id;
  const businessConnectionId = update.business_message ? (message.business_connection_id || '') : '';
  const notify = (text) =>
    sendTelegramMessage(env, { chatId, text, replyToMessageId: messageId, businessConnectionId });

  let transcript = '';
  try {
    transcript = await transcribeVoice(env, candidate.voiceFileId);
  } catch (err) {
    await notify('⚠️ Не расслышал голосовое — попробуй ещё раз или напиши текстом.');
    return { ok: true, skipped: 'voice transcription failed', error: String(err) };
  }

  if (!transcript) {
    await notify('⚠️ Не расслышал голосовое — попробуй ещё раз или напиши текстом.');
    return { ok: true, skipped: 'empty transcript' };
  }

  if (isHelpRequest(transcript)) {
    await notify(HELP_TEXT);
    return { ok: true, help: true, transcript };
  }

  let plan = planDispatch(transcript);
  let ackPrefix = `🎙️ Понял: "${transcript}"\n`;
  let recordExtra = {};
  if (!plan.length) {
    plan = (await aiRoute(env, transcript)).plan;
    ackPrefix += AI_ROUTER_ACK;
    recordExtra = { router: 'ai' };
  }
  if (!plan.length) {
    await notify(
      `🎙️ Понял: "${transcript}" — но не понял, кому это адресовано ` +
        '(скажи "вкусвилл", "билет"/"поезд"/"как доехать", "отель"/"квартира"/"где остановиться" или "купи"/"закажи"/"найди").'
    );
    return { ok: true, skipped: 'no trigger word in transcript', transcript };
  }

  const params = {
    chat_id: chatId,
    message_id: messageId,
    business_connection_id: businessConnectionId,
    text: transcript,
    photo_file_id: ''
  };
  const results = await dispatchPlan(env, plan, params, ackPrefix, recordExtra);
  return {
    ok: true,
    triggered: true,
    target: plan[0].target,
    targets: plan.map((item) => item.target),
    transcript,
    fire_status: results[0].status,
    fire_body: results[0].body
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET' && new URL(request.url).searchParams.get('debug') === '1') {
      const last = env.UPDATE_CACHE ? await env.UPDATE_CACHE.get('debug:last_raw') : null;
      return json({ last_raw_update: last ? JSON.parse(last) : null });
    }

    if (request.method !== 'POST') {
      return new Response('ok', { status: 200 });
    }

    const adminMatch = new URL(request.url).pathname.match(/^\/admin\/(\w+)$/);
    if (adminMatch) {
      const auth = request.headers.get('Authorization') || '';
      if (!env.WATCHDOG_ADMIN_TOKEN || auth !== 'Bearer ' + env.WATCHDOG_ADMIN_TOKEN) {
        return new Response('forbidden', { status: 403 });
      }
      let body = {};
      try {
        body = JSON.parse((await request.text()) || '{}');
      } catch (err) {
        return json({ ok: false, error: 'invalid json' });
      }
      return json(await handleAdmin(env, adminMatch[1], body));
    }

    const rawBody = await request.text();
    if (env.UPDATE_CACHE) {
      ctx.waitUntil(env.UPDATE_CACHE.put('debug:last_raw', rawBody, { expirationTtl: 3600 }));
    }

    let update;
    try {
      update = JSON.parse(rawBody);
    } catch (err) {
      return json({ ok: true, skipped: 'invalid json' });
    }

    if (env.UPDATE_CACHE) {
      const key = 'upd_' + update.update_id;
      if (await env.UPDATE_CACHE.get(key)) {
        return json({ ok: true, skipped: 'duplicate update_id' });
      }
      ctx.waitUntil(env.UPDATE_CACHE.put(key, '1', { expirationTtl: 21600 }));
    }

    const message = update.message || update.business_message;
    if (!message) return json({ ok: true, skipped: 'no message' });

    // Критично: игнорировать сообщения от ботов (включая самого себя) —
    // иначе собственный ответ агента ("...рекомендую купить...") снова
    // матчится на триггер-слово и запускает бесконечный цикл.
    if (message.from && message.from.is_bot) {
      return json({ ok: true, skipped: 'message from a bot' });
    }

    const isDebug = new URL(request.url).searchParams.get('debug') === '1';
    const candidate = extractCandidate(message);

    // Голосовое: target неизвестен до транскрипции, поэтому отдельная
    // асинхронная ветка (сама шлёт ack/ошибку и решает, запускать ли Routine).
    if (candidate.voiceFileId) {
      if (isDebug) {
        const result = await processVoiceMessage(env, message, update, candidate);
        return json(result);
      }
      ctx.waitUntil(processVoiceMessage(env, message, update, candidate));
      return json({ ok: true, processing: 'voice' });
    }

    if (isHelpRequest(candidate.text)) {
      const sendHelp = sendTelegramMessage(env, {
        chatId: message.chat.id,
        text: HELP_TEXT,
        replyToMessageId: message.message_id,
        businessConnectionId: update.business_message ? (message.business_connection_id || '') : ''
      });
      if (isDebug) await sendHelp;
      else ctx.waitUntil(sendHelp);
      return json({ ok: true, help: true });
    }

    const resumeAgent = parseResumeCommand(candidate.text);
    if (resumeAgent && env.UPDATE_CACHE) {
      const wasPaused = await getPause(env, resumeAgent);
      await env.UPDATE_CACHE.delete('paused:' + resumeAgent);
      const done = sendTelegramMessage(env, {
        chatId: message.chat.id,
        text: wasPaused ? `▶️ ${AGENT_LABELS[resumeAgent]} снова работает.` : `${AGENT_LABELS[resumeAgent]} и так работает.`,
        replyToMessageId: message.message_id,
        businessConnectionId: update.business_message ? (message.business_connection_id || '') : ''
      });
      if (isDebug) await done;
      else ctx.waitUntil(done);
      return json({ ok: true, resumed: resumeAgent });
    }

    const params = {
      chat_id: message.chat.id,
      message_id: message.message_id,
      business_connection_id: update.business_message ? (message.business_connection_id || '') : '',
      text: candidate.text,
      photo_file_id: candidate.photoFileId
    };

    const plan = planDispatch(candidate.text);
    if (!plan.length) {
      if (!env.AI || !aiRouterEligible(candidate.text)) return json({ ok: true, skipped: 'no trigger word' });
      // Модель отвечает 1–3 с — Telegram получает 200 сразу, решение и запуск — в фоне.
      if (isDebug) return json(await aiRouteAndDispatch(env, candidate.text, params));
      ctx.waitUntil(aiRouteAndDispatch(env, candidate.text, params));
      return json({ ok: true, processing: 'ai-router' });
    }
    const target = plan[0].target;
    const targets = plan.map((item) => item.target);

    // Диагностический режим (?debug=1): дожидаемся ответа fire и возвращаем
    // его в теле — удобно для ручной проверки через curl. В обычной работе
    // (реальные апдейты от Telegram) этот параметр не передаётся, и
    // используется быстрый путь ниже.
    if (isDebug) {
      const results = await dispatchPlan(env, plan, params);
      return json({ ok: true, triggered: !results[0].paused, target, targets, ...results[0], results });
    }

    // Отвечаем Telegram сразу (200), а сам ack + fire-вызов (может занимать
    // много секунд) выполняются в фоне через waitUntil — именно это убирает
    // первопричину повторных доставок, а не только дедуп. ack отправляется
    // ДО triggerRoutine внутри одного waitUntil, чтобы он гарантированно
    // пришёл раньше ответа агента, а не вперемешку с ним.
    ctx.waitUntil(
      (async () => {
        await dispatchPlan(env, plan, params);
      })()
    );

    return json({ ok: true, triggered: true, target, targets });
  },

  // Cron Triggers (Settings → Triggers): «0 6 * * *» — проверка кредита Apify.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkApifyCredit(env));
  }
};
