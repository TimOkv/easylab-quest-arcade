# Интеграция с платформой EasyLab (postMessage)

Документ для разработчиков `easycode-lab.ru`. Модуль встраивается в страницу платформы через `<iframe>` и обменивается
с ней сообщениями `window.postMessage`. Вне iframe модуль работает автономно (гостевой режим) и ничего не отправляет.

Живой пример родительской страницы — стенд `parent_test.html` из этого проекта (`npm run dev` →
`http://localhost:5173/parent_test.html`): iframe модуля, форма `EASYLAB_AUTH_INIT`, журнал всех сообщений с JSON.

## Встраивание

```html
<iframe
  id="ezq-frame"
  src="https://<адрес-модуля>/index.html"
  allow="clipboard-write; autoplay"
  style="width: 100%; height: 100%; border: 0"
></iframe>
```

`<адрес-модуля>` — плейсхолдер: конкретный адрес, по которому выложена сборка модуля, подставляет команда EasyLab.

- `clipboard-write` — чтобы кнопка «Скопировать личный ID» работала внутри iframe (без неё модуль выделит код для ручного копирования).
- Модуль сам подстраивается под размер iframe (квест 16:9, аркада 450×800, по краям декоративные поля). Удобно от 360×560.
- Не ставьте родительской странице `Referrer-Policy: no-referrer`: по `document.referrer` модуль узнаёт адрес родителя и сразу шлёт ему `EASYLAB_READY`.
  (Если referrer пуст, `EASYLAB_READY` не придёт — отправьте `EASYLAB_AUTH_INIT` по событию `load` iframe, см. пример ниже.)

## Белый список адресов (origin)

Модуль принимает `EASYLAB_AUTH_INIT` только если одновременно:

1. сообщение пришло от `window.parent` (не от другого окна или вкладки);
2. адрес отправителя — из белого списка:
   - `https://easycode-lab.ru` и любой поддомен `https://*.easycode-lab.ru` (только `https`, стандартный порт);
   - собственный адрес модуля (так работает стенд `parent_test.html`, лежащий рядом);
   - адреса из переменной сборки `VITE_BRIDGE_EXTRA_ORIGINS` (через запятую, точные `https://host[:port]` или маска `https://*.домен`).

Остальные сообщения молча игнорируются. Исходящие сообщения модуль отправляет **только на проверенный адрес родителя**
(`targetOrigin` = origin из referrer или из пришедшего `EASYLAB_AUTH_INIT`), никогда на `*`.
Родителю тоже нужно проверять `event.origin` (адрес, где выложен модуль) и `event.source === iframe.contentWindow`.

## Формат сообщений

Все сообщения **от модуля** завёрнуты в конверт:

```json
{ "source": "ezq", "version": 1, "type": "EASYLAB_…", "payload": { … } }
```

Сообщение **в модуль** — `{ "type": "EASYLAB_AUTH_INIT", "payload": { … } }` (конверт `source/version` не обязателен).

### Последовательность

```
Модуль (iframe)                                   Платформа (parent)
   │ загрузился, показывает «Загружаем квест…»
   │ ── EASYLAB_READY {} ──────────────────────────▶ │
   │ ◀────────────── EASYLAB_AUTH_INIT {studentId, name, theme} ── │
   │ (ждёт AUTH_INIT до 1,5 с, потом стартует как гость;
   │  AUTH_INIT, пришедший позже, всё равно применится)
   │ … ученик решает 4 загадки …
   │ ── EASYLAB_QUEST_COMPLETED {coinsEarned, maxCoins, verificationCode, …} ▶ │  начислить монеты
   │ … ученик играет в аркаду …
   │ ── EASYLAB_GAME_FINISHED {score, highScore, …} ▶ │  после каждого забега
```

Сообщения, которые модуль хотел отправить до того, как узнал адрес родителя, копятся (до 20) и уходят сразу после `EASYLAB_AUTH_INIT`.

### `EASYLAB_READY` (модуль → платформа)

`payload: {}` — модуль загружен и ждёт `EASYLAB_AUTH_INIT`.

### `EASYLAB_AUTH_INIT` (платформа → модуль)

| Поле | Тип | Что делает |
|---|---|---|
| `studentId` | string (до 64 символов) или число | ID ученика в EasyLab. Попадает в реестр куратора и в рейтинг. Если этот ученик уже проходил квест (например, на другом устройстве), модуль восстановит его код и монеты из базы и сразу откроет аркаду — повторного прохождения не будет. |
| `name` | string | Имя ученика: подставится в поле «Как тебя зовут?» (ученик может поправить). Если имя не проходит проверку ника (2–16 символов, без мата), поле останется пустым. |
| `theme` | `"dark"` \| `"light"` | Тема оформления. |

Все поля необязательны. Можно прислать повторно — например, после смены темы.

### `EASYLAB_QUEST_COMPLETED` (модуль → платформа)

Отправляется один раз в момент решения последней, 8-й загадки (по две в каждой из 4 комнат). Повторно — только
если сервер выдал ученику другой код (совпадение кодов, редкость) — тогда платформе нужно обновить сохранённый код.

```json
{
  "source": "ezq", "version": 1, "type": "EASYLAB_QUEST_COMPLETED",
  "payload": {
    "coinsEarned": 110,
    "maxCoins": 150,
    "verificationCode": "EZ-7K3M",
    "completedAt": "2026-09-27T18:52:39.219Z",
    "studentId": "student-1024",
    "rooms": [
      { "room": 1, "id": "room_variables",  "earnedCoins": 17, "maxReward": 20, "attempts": 3, "hintsUsed": 0 },
      { "room": 2, "id": "room_conditions", "earnedCoins": 23, "maxReward": 30, "attempts": 4, "hintsUsed": 1 },
      { "room": 3, "id": "room_loops",      "earnedCoins": 40, "maxReward": 40, "attempts": 2, "hintsUsed": 0 },
      { "room": 4, "id": "room_functions",  "earnedCoins": 30, "maxReward": 60, "attempts": 3, "hintsUsed": 2 }
    ],
    "puzzles": [
      { "id": "var_types",  "room": 1, "earnedCoins": 7,  "maxReward": 10, "attempts": 2, "hintsUsed": 0 },
      { "id": "var_assign", "room": 1, "earnedCoins": 10, "maxReward": 10, "attempts": 1, "hintsUsed": 0 },
      { "id": "if_fridge",  "room": 2, "earnedCoins": 8,  "maxReward": 15, "attempts": 3, "hintsUsed": 1 },
      { "id": "and_kettle", "room": 2, "earnedCoins": 15, "maxReward": 15, "attempts": 1, "hintsUsed": 0 },
      { "id": "for_shelf",  "room": 3, "earnedCoins": 20, "maxReward": 20, "attempts": 1, "hintsUsed": 0 },
      { "id": "while_pc",   "room": 3, "earnedCoins": 20, "maxReward": 20, "attempts": 1, "hintsUsed": 0 },
      { "id": "fn_play",    "room": 4, "earnedCoins": 0,  "maxReward": 30, "attempts": 2, "hintsUsed": 2 },
      { "id": "fn_mission", "room": 4, "earnedCoins": 30, "maxReward": 30, "attempts": 1, "hintsUsed": 0 }
    ]
  }
}
```

`coinsEarned` — фактически заработанные монеты (0–150), ровно столько же записано в реестр куратора.
`maxCoins` — максимум квеста, который проходил ученик: **150** (8 загадок). У прохождений старого квеста
из 4 загадок, завершённых до обновления, — 75; начислять нужно `coinsEarned`, а не долю от максимума.
`rooms` — 4 записи-суммы по комнатам (как раньше, поля не менялись): `maxReward` 20 / 30 / 40 / 60 — сумма пулов
двух загадок, `attempts` и `hintsUsed` — суммы по двум загадкам комнаты.
`puzzles` — 8 записей по загадкам (новое поле): `maxReward` — пул загадки (10 / 15 / 20 / 30 по комнате),
`hintsUsed` — 0, 1 или 2 (вторая подсказка обнуляет монеты за загадку). У старых прохождений (максимум 75) — пустой массив.
Прохождение, восстановленное с сервера (ученик уже проходил квест, и модуль взял запись реестра — по `studentId` при AUTH_INIT или из ответа реестра при регистрации), отдаёт `rooms: []` и `puzzles: []`: итог `coinsEarned` серверный, а разбивка по комнатам и загадкам на этом устройстве неизвестна. Пустой массив значит «разбивка неизвестна», а не «ноль монет»; начислять нужно `coinsEarned`. Если `rooms` не пустой, сумма `rooms[].earnedCoins` равна `coinsEarned`.
`verificationCode` — формат `EZ-` + 4 символа из `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. `studentId` — `null`, если AUTH_INIT не приходил.

### `EASYLAB_GAME_FINISHED` (модуль → платформа)

После каждого забега в аркаде (когда результат отправлен в рейтинг или поставлен в очередь).

```json
{
  "source": "ezq", "version": 1, "type": "EASYLAB_GAME_FINISHED",
  "payload": {
    "score": 80,
    "highScore": 80,
    "seasonTotal": 1580,
    "durationSeconds": 8.8,
    "jumpsCount": 11,
    "verificationCode": "EZ-7K3M"
  }
}
```

`score` — очки забега, `highScore` — личный рекорд, `seasonTotal` — сумма засчитанных очков ученика в текущем сезоне рейтинга
(в демо-режиме или без сети — последнее известное значение).

## Пример кода родительской страницы

```html
<iframe id="ezq-frame" src="https://<адрес-модуля>/index.html" allow="clipboard-write; autoplay"></iframe>
<script>
  const MODULE_ORIGIN = 'https://<адрес-модуля>'; // где выложен модуль (origin без пути)
  const frame = document.getElementById('ezq-frame');

  function sendAuth() {
    frame.contentWindow.postMessage(
      { type: 'EASYLAB_AUTH_INIT', payload: { studentId: currentUser.id, name: currentUser.firstName, theme: 'dark' } },
      MODULE_ORIGIN,
    );
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== MODULE_ORIGIN || event.source !== frame.contentWindow) return;
    const msg = event.data;
    if (!msg || msg.source !== 'ezq' || msg.version !== 1) return;

    switch (msg.type) {
      case 'EASYLAB_READY':
        sendAuth();
        break;
      case 'EASYLAB_QUEST_COMPLETED':
        // Для отображения. Начисление делает куратор по реестру (verify.html / Google-таблица),
        // сообщение из браузера можно подделать — не начисляйте монеты только по нему.
        showQuestResult(msg.payload.coinsEarned, msg.payload.verificationCode);
        break;
      case 'EASYLAB_GAME_FINISHED':
        updateArcadeRecord(msg.payload.highScore, msg.payload.seasonTotal);
        break;
    }
  });

  // Подстраховка, если referrer не передаётся и EASYLAB_READY не придёт:
  frame.addEventListener('load', () => setTimeout(sendAuth, 300));
</script>
```

Повторная отправка `EASYLAB_AUTH_INIT` безопасна: модуль применит её ещё раз, прогресс не сбросится.

## Проверка на стенде

1. `npm run dev` (или `npm run build && npm run preview`) и открыть `parent_test.html`.
2. В журнале появятся `EASYLAB_READY` (← от модуля) и `EASYLAB_AUTH_INIT` (→ в модуль, отправляется автоматически).
3. Пройти квест — придёт `EASYLAB_QUEST_COMPLETED`, плитки «EasyCoins» и «Код EZ-XXXX» заполнятся.
4. Сыграть забег — придёт `EASYLAB_GAME_FINISHED`, заполнятся «Последний забег» и «Рекорд».
5. «Сбросить сохранение модуля» стирает прогресс (ключи `ezq_*` в localStorage) и перезагружает iframe.

Этот же сценарий автоматически проверяет `tests/e2e/acceptance.spec.ts` (на экранах 1440×900 и 390×844).

## Хранение на стороне модуля

Прогресс — в `localStorage` домена модуля: `ezq_save_v1` (состояние), `ezq_pending_scores_v1` (забеги, ждущие сети).
Если браузер запрещает хранилище в стороннем iframe, модуль работает в памяти вкладки; при переданном `studentId`
пройденный квест всё равно восстановится из базы.
