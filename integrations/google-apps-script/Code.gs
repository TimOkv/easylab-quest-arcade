/**
 * EasyLab Quest — приёмник для Google-таблицы куратора (Формат А).
 *
 * База Supabase сама присылает сюда каждое новое прохождение квеста и каждую отметку
 * «начислено». Скрипт добавляет строку или меняет «Статус» у строки с этим кодом.
 *
 * Столбцы: Время | Код EZ-XXXX | Имя ученика | ID | Заработано коинов | Статус
 *
 * Установка — пошагово в docs/GOOGLE_SHEETS.md. Коротко:
 *   1. Таблица → Расширения → Apps Script → заменить всё содержимое этим файлом.
 *   2. Настройки проекта → Свойства скрипта → WEBHOOK_SECRET = <ваш-секрет-таблицы>.
 *   3. Начать развёртывание → Веб-приложение → «Запуск от имени: я», «Доступ: все».
 *   4. Адрес веб-приложения и тот же секрет — в ezq_settings (docs/SUPABASE_SETUP.md, шаг 6).
 *
 * Что приходит от базы (триггер ezq_notify_sheets в supabase/schema.sql):
 *   { "secret": "...", "event": "insert" | "awarded",
 *     "row": { "time": "ДД.ММ.ГГГГ ЧЧ:ММ", "verification_code": "EZ-8492", "player_name": "Аня",
 *              "student_id": "", "coins_earned": 58, "status": "Ожидает начисления" | "Начислено" } }
 */

var SHEET_NAME = 'Прохождения';
var HEADER = ['Время', 'Код EZ-XXXX', 'Имя ученика', 'ID', 'Заработано коинов', 'Статус'];
var COL_CODE = 2;
var COL_STATUS = 6;

function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return reply({ ok: false, error: 'BAD_JSON' });
  }

  var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret || data.secret !== secret) return reply({ ok: false, error: 'FORBIDDEN' });

  var row = data.row || {};
  var code = String(row.verification_code || '').trim().toUpperCase();
  if (!/^EZ-[A-Z0-9]{4}$/.test(code)) return reply({ ok: false, error: 'BAD_CODE' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return reply({ ok: false, error: 'BUSY' });
  try {
    var sheet = getSheet();
    var found = findRow(sheet, code);
    if (found > 0) {
      // Запись уже есть: меняем только статус (повторный insert ничего не дублирует).
      if (data.event === 'awarded') sheet.getRange(found, COL_STATUS).setValue(text(row.status));
      return reply({ ok: true, updated: data.event === 'awarded' });
    }
    // Строки нет (обычный insert или «начислено» пришло раньше вставки) — добавляем.
    sheet.appendRow([
      text(row.time),
      text(code),
      text(row.player_name),
      text(row.student_id),
      Number(row.coins_earned) || 0,
      text(row.status || 'Ожидает начисления'),
    ]);
    return reply({ ok: true, inserted: true });
  } finally {
    lock.releaseLock();
  }
}

/** Открой адрес веб-приложения в браузере — увидишь, что приёмник работает. */
function doGet() {
  return reply({ ok: true, message: 'Приёмник EasyLab Quest работает. Данные сюда присылает база Supabase.' });
}

/** Проверка из редактора: ▶ Выполнить → в таблице появится тестовая строка EZ-TEST. */
function ezqSelfTest() {
  var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret) throw new Error('Сначала добавь свойство WEBHOOK_SECRET (Настройки проекта → Свойства скрипта).');
  var now = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm');
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        secret: secret,
        event: 'insert',
        row: { time: now, verification_code: 'EZ-TEST', player_name: 'Проверка', student_id: '', coins_earned: 75, status: 'Ожидает начисления' },
      }),
    },
  });
  Logger.log(res.getContent());
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
    sheet.getRange('A:D').setNumberFormat('@'); // время, код, имя, ID — как текст
  }
  return sheet;
}

function findRow(sheet, code) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var codes = sheet.getRange(2, COL_CODE, last - 1, 1).getDisplayValues();
  for (var i = codes.length - 1; i >= 0; i--) {
    if (String(codes[i][0]).trim().toUpperCase() === code) return i + 2;
  }
  return -1;
}

/** Строка как текст: всё, что похоже на формулу (=, +, -, @), таблица не выполнит. */
function text(value) {
  var s = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
