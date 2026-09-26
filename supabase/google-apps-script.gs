/**
 * EasyLab Quest — приёмник вебхука для Google-таблицы куратора (R50).
 * Установка: Расширения → Apps Script → вставить этот файл → Настройки проекта →
 * Script Properties: WEBHOOK_SECRET = тот же, что в ezq_settings.sheets_webhook_secret →
 * Развернуть → Веб-приложение (выполнять от моего имени, доступ: все) → URL в ezq_settings.sheets_webhook_url.
 * Столбцы: Время | Код EZ-XXXX | Имя ученика | ID | Заработано коинов | Статус
 */
var HEADER = ['Время', 'Код EZ-XXXX', 'Имя ученика', 'ID', 'Заработано коинов', 'Статус'];

function doPost(e) {
  var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret || data.secret !== secret) return reply({ ok: false, error: 'FORBIDDEN' });
  var row = data.row || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADER);
    var found = findRow(sheet, row.verification_code);
    if (data.event === 'awarded' && found > 0) {
      sheet.getRange(found, 6).setValue(row.status);
    } else if (found < 0) {
      // Код пишем как текст (апостроф), чтобы таблица не превращала его в формулу.
      sheet.appendRow([row.time, "'" + row.verification_code, "'" + row.player_name, "'" + row.student_id, row.coins_earned, row.status]);
    }
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function findRow(sheet, code) {
  var last = sheet.getLastRow();
  if (last < 2 || !code) return -1;
  var codes = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) if (String(codes[i][0]).replace(/^'/, '') === code) return i + 2;
  return -1;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
