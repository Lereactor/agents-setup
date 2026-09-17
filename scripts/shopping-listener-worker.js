// Cloudflare Worker — общий слушатель Telegram-вебхука для агентов-покупок
// (shopping: Ozon/Я.Маркет, grocery: ВкусВилл). Файл не переименован в
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
//   TELEGRAM_BOT_TOKEN             — токен @LAgentsControl_bot (для голосовых:
//                                    скачать файл + отправить ack/ошибку в чат)
//
// Bindings — Settings → Bindings:
//   AI  — Workers AI binding (для распознавания голосовых через Whisper),
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

// Порядок важен: grocery проверяется первым, чтобы "вкусвилл, купи молоко"
// уходило только в grocery, а не в оба агента разом. Правило одинаково
// применяется и к тексту, и к расшифровке голосового — триггер-слово может
// быть где угодно во фразе, не обязательно первым словом.
const GROCERY_TRIGGER_WORDS = ['вкусвилл', 'продукт'];
const SHOPPING_TRIGGER_WORDS = ['куп', 'заказ', 'найд', 'buy', 'order', 'find'];

const TARGET_LABELS = { grocery: 'ВкусВиллу', shopping: 'Shopping-агенту' };

function json(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function matchesTriggerWords(text, roots) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return roots.some((root) => lower.includes(root));
}

// Решает, какому Routine адресовать сообщение (или null, если ни один
// набор триггер-слов не совпал).
function detectTarget(text) {
  if (matchesTriggerWords(text, GROCERY_TRIGGER_WORDS)) return 'grocery';
  if (matchesTriggerWords(text, SHOPPING_TRIGGER_WORDS)) return 'shopping';
  return null;
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

  const audioBytes = Array.from(new Uint8Array(await audioResp.arrayBuffer()));
  const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
    audio: audioBytes,
    language: 'ru'
  });

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
  const url = target === 'grocery' ? env.ROUTINE_TRIGGER_URL_GROCERY : env.ROUTINE_TRIGGER_URL;
  const token = target === 'grocery' ? env.ROUTINE_TRIGGER_TOKEN_GROCERY : env.ROUTINE_TRIGGER_TOKEN;
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

  const target = detectTarget(transcript);
  if (!target) {
    await notify(
      `🎙️ Понял: "${transcript}" — но не понял, кому это адресовано ` +
        '(скажи "вкусвилл" или "купи"/"закажи"/"найди").'
    );
    return { ok: true, skipped: 'no trigger word in transcript', transcript };
  }

  await notify(`🎙️ Понял: "${transcript}" — передаю ${TARGET_LABELS[target]}.`);

  const params = {
    chat_id: chatId,
    message_id: messageId,
    business_connection_id: businessConnectionId,
    text: transcript,
    photo_file_id: ''
  };
  const fireResult = await triggerRoutine(env, target, params);
  return { ok: true, triggered: true, target, transcript, fire_status: fireResult.status, fire_body: fireResult.body };
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

    const target = detectTarget(candidate.text);
    if (!target) {
      return json({ ok: true, skipped: 'no trigger word' });
    }

    const params = {
      chat_id: message.chat.id,
      message_id: message.message_id,
      business_connection_id: update.business_message ? (message.business_connection_id || '') : '',
      text: candidate.text,
      photo_file_id: candidate.photoFileId
    };

    const sendAck = () =>
      sendTelegramMessage(env, {
        chatId: params.chat_id,
        text: '✅ Принял, работаю…',
        replyToMessageId: params.message_id,
        businessConnectionId: params.business_connection_id
      });

    // Диагностический режим (?debug=1): дожидаемся ответа fire и возвращаем
    // его в теле — удобно для ручной проверки через curl. В обычной работе
    // (реальные апдейты от Telegram) этот параметр не передаётся, и
    // используется быстрый путь ниже.
    if (isDebug) {
      await sendAck();
      const fireResult = await triggerRoutine(env, target, params);
      return json({ ok: true, triggered: true, target, fire_status: fireResult.status, fire_body: fireResult.body });
    }

    // Отвечаем Telegram сразу (200), а сам ack + fire-вызов (может занимать
    // много секунд) выполняются в фоне через waitUntil — именно это убирает
    // первопричину повторных доставок, а не только дедуп. ack отправляется
    // ДО triggerRoutine внутри одного waitUntil, чтобы он гарантированно
    // пришёл раньше ответа агента, а не вперемешку с ним.
    ctx.waitUntil(
      (async () => {
        await sendAck();
        await triggerRoutine(env, target, params);
      })()
    );

    return json({ ok: true, triggered: true, target });
  }
};
