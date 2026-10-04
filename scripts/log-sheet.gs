// Google Apps Script — веб-хук для лога запусков агентов.
// Деплой: Extensions > Apps Script в Google Sheet, вставить этот файл как Code.gs,
// затем Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
// Обновление кода: Deploy > Manage deployments > ✏️ > Version: New version (URL не меняется).
// Секрет хранится в Project Settings > Script Properties (SECRET_TOKEN), не в коде.
//
// Лист должен называться "log", шапка в первой строке:
// timestamp_utc | agent | status | detail | run_id | reply
// (detail, run_id, reply добавлены 2026-10-04; у старых строк эти колонки пустые;
// недостающие заголовки скрипт дописывает сам при первой записи)

const SHEET_NAME = 'log';
const HEADER = ['timestamp_utc', 'agent', 'status', 'detail', 'run_id', 'reply'];
// Меняется при каждом изменении кода — по GET ?ping=1 видно, какая версия развёрнута.
const VERSION = 3;

function checkToken_(params) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
  return secret && params.token === secret;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureHeader_(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADER.length).getValues()[0];
  HEADER.forEach(function (name, i) {
    if (!current[i]) sheet.getRange(1, i + 1).setValue(name);
  });
}

// Запись строки лога:
// POST agent=<имя>&status=started|success|error|skipped
//      &timestamp=<ISO8601, опционально>&detail=<строка, опционально>
//      &run_id=<id, опционально>&reply=<текст ответа в Telegram, опционально>
function doPost(e) {
  const params = e.parameter || {};
  if (!checkToken_(params)) return json_({ error: 'unauthorized' });
  if (!params.agent || !params.status) return json_({ error: 'missing agent or status' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  ensureHeader_(sheet);
  const timestamp = params.timestamp || new Date().toISOString();
  // detail — одна строка в ячейке, без переносов: лог удобно читать глазами.
  const detail = String(params.detail || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const runId = String(params.run_id || '').slice(0, 64);
  // reply — текст сообщения, отправленного в Telegram, переносы строк сохраняются.
  const reply = String(params.reply || '').slice(0, 4000);
  sheet.appendRow([timestamp, params.agent, params.status, detail, runId, reply]);
  return json_({ ok: true, version: VERSION });
}

// GET ?ping=1 — номер развёрнутой версии (без токена, ничего не раскрывает).
// GET ?token=<секрет> — весь лог (для надзирателя и визуализации).
function doGet(e) {
  const params = e.parameter || {};
  if (params.ping) return json_({ version: VERSION });
  if (!checkToken_(params)) return json_({ error: 'unauthorized' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  return json_({ rows: rows });
}
