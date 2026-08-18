// Google Apps Script — веб-хук для лога запусков агентов.
// Деплой: Extensions > Apps Script в Google Sheet, вставить этот файл как Code.gs,
// затем Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
// Секрет хранится в Project Settings > Script Properties (SECRET_TOKEN), не в коде.
//
// Лист должен называться "log" и иметь шапку в первой строке:
// timestamp_utc | agent | status

const SHEET_NAME = 'log';

function checkToken_(params) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
  return secret && params.token === secret;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Запись строки лога: POST agent=<имя>&status=success|error&timestamp=<ISO8601, опционально>
function doPost(e) {
  const params = e.parameter || {};
  if (!checkToken_(params)) return json_({ error: 'unauthorized' });
  if (!params.agent || !params.status) return json_({ error: 'missing agent or status' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const timestamp = params.timestamp || new Date().toISOString();
  sheet.appendRow([timestamp, params.agent, params.status]);
  return json_({ ok: true });
}

// Чтение всего лога (для надзирателя): GET ?token=<секрет>
function doGet(e) {
  const params = e.parameter || {};
  if (!checkToken_(params)) return json_({ error: 'unauthorized' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  return json_({ rows: rows });
}
