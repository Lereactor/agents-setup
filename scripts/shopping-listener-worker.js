// Cloudflare Worker — слушатель Telegram-вебхука для агента-покупок.
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
//   ROUTINE_TRIGGER_URL   — URL fire-эндпоинта Routine "Shopping"
//   ROUTINE_TRIGGER_TOKEN — Bearer-токен для этого эндпоинта
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

const TRIGGER_WORDS = ['куп', 'заказ', 'найд', 'buy', 'order', 'find'];

function json(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function hasTriggerWord(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return TRIGGER_WORDS.some((root) => lower.includes(root));
}

function largestPhotoFileId(photoArray) {
  if (!photoArray || !photoArray.length) return '';
  return photoArray[photoArray.length - 1].file_id;
}

// Достаёт из сообщения: текст-кандидат для проверки триггера и file_id фото (если есть).
function extractCandidate(message) {
  if (!message) return { text: '', photoFileId: '' };
  if (message.text) {
    return { text: message.text, photoFileId: '' };
  }
  if (message.photo && message.caption) {
    return { text: message.caption, photoFileId: largestPhotoFileId(message.photo) };
  }
  // Реплай текстом на более раннее фото
  if (message.reply_to_message && message.reply_to_message.photo && message.text) {
    return { text: message.text, photoFileId: largestPhotoFileId(message.reply_to_message.photo) };
  }
  return { text: '', photoFileId: '' };
}

async function triggerRoutine(env, params) {
  const resp = await fetch(env.ROUTINE_TRIGGER_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.ROUTINE_TRIGGER_TOKEN,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text: JSON.stringify(params) })
  });
  return { status: resp.status, body: await resp.text() };
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

    const candidate = extractCandidate(message);
    if (!hasTriggerWord(candidate.text)) {
      return json({ ok: true, skipped: 'no trigger word' });
    }

    const params = {
      chat_id: message.chat.id,
      message_id: message.message_id,
      business_connection_id: update.business_message ? (message.business_connection_id || '') : '',
      text: candidate.text,
      photo_file_id: candidate.photoFileId
    };

    // Диагностический режим (?debug=1): дожидаемся ответа fire и возвращаем
    // его в теле — удобно для ручной проверки через curl. В обычной работе
    // (реальные апдейты от Telegram) этот параметр не передаётся, и
    // используется быстрый путь ниже.
    const isDebug = new URL(request.url).searchParams.get('debug') === '1';
    if (isDebug) {
      const fireResult = await triggerRoutine(env, params);
      return json({ ok: true, triggered: true, fire_status: fireResult.status, fire_body: fireResult.body });
    }

    // Отвечаем Telegram сразу (200), а сам fire-вызов (может занимать много
    // секунд) выполняется в фоне через waitUntil — именно это убирает
    // первопричину повторных доставок, а не только дедуп.
    ctx.waitUntil(triggerRoutine(env, params));

    return json({ ok: true, triggered: true });
  }
};
