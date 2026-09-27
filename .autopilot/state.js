window.STATE =
{
  "slug": "easylab-quest-arcade",
  "dir": "2026-09-26-easylab-quest-arcade--wip",
  "title": "EasyLab Quest & Endless Arcade",
  "mode": "interview",
  "depth": "deep",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-09-26-brief.md",
  "memoryFile": "CLAUDE.md",
  "skillDir": "/Users/timofejokunev/.claude/skills/autopilot",
  "startedAt": "2026-09-26T17:21:46+03:00",
  "updatedAt": "2026-09-27T12:21:56+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-09-26T17:21:46+03:00",
      "finishedAt": "2026-09-26T17:27:10+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-09-26T17:23:30+03:00",
      "finishedAt": "2026-09-26T17:27:10+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-09-26T17:27:10+03:00",
      "finishedAt": "2026-09-26T17:46:12+03:00",
      "note": "9 вопросов (семи + интервью deep)"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-09-26T17:46:12+03:00",
      "finishedAt": "2026-09-26T17:55:07+03:00",
      "note": "G2: 8 находок, дописано"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-09-26T17:55:07+03:00",
      "finishedAt": "2026-09-26T17:58:13+03:00",
      "note": "7 тасков, ярус T2, 4 волны"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-09-26T17:58:13+03:00",
      "note": "7 из 7 тасков готовы",
      "finishedAt": "2026-09-27T12:21:56+03:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-09-26T18:09:03+03:00",
      "note": "проверено 7 из 7",
      "finishedAt": "2026-09-27T12:21:56+03:00"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 79,
    "done": 0,
    "inTicket": 79,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Каркас: сборка, состояние, правила, оболочка",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R07",
        "R08",
        "R09",
        "R10",
        "R11",
        "R12",
        "R13",
        "R16",
        "R17",
        "R26",
        "R30",
        "R47",
        "R60",
        "R66",
        "G04",
        "G07",
        "G08"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "package.json",
        "vite.config.ts",
        "tsconfig.json",
        "index.html",
        "verify.html",
        "parent_test.html",
        "src/core/",
        "src/app/",
        "src/services/sfx*",
        "src/assets/",
        "tests/",
        ".env.example"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-09-26T17:58:13+03:00",
      "repairFindings": [
        "DEFAULT_DAILY_LIMIT 60 → 3000 (G09)",
        "touch-action:none на всём .ezq-root → только canvas"
      ],
      "finishedAt": "2026-09-26T18:11:55+03:00",
      "commit": "4d54def",
      "tests": {
        "passed": 75,
        "failed": 0
      }
    },
    {
      "id": "02",
      "title": "База Supabase и сетевые сервисы",
      "requirements": [
        "R41",
        "R42",
        "R43",
        "R44",
        "R45",
        "R46",
        "R47",
        "R48",
        "R49",
        "R50",
        "R58",
        "R64i",
        "R65i",
        "R67",
        "G01",
        "G02",
        "G03",
        "G04",
        "G05",
        "G09",
        "G11",
        "R26"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "supabase/",
        "src/services/",
        "sfx*",
        "bridge*",
        "tests/sql/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-26T18:11:55+03:00",
      "finishedAt": "2026-09-26T18:24:42+03:00",
      "commit": "3e5a575",
      "tests": {
        "passed": 54,
        "failed": 0
      }
    },
    {
      "id": "03",
      "title": "Квест: 4 комнаты, загадки, монеты, триумф",
      "requirements": [
        "R07",
        "R14",
        "R15",
        "R16",
        "R17",
        "R18",
        "R19",
        "R20",
        "R21",
        "R22",
        "R23",
        "R24",
        "R25",
        "R26",
        "R27",
        "R28",
        "R29",
        "R61",
        "R63i",
        "G04",
        "G06",
        "G07",
        "G08"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/quest/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-09-26T18:11:55+03:00",
      "repairFindings": [
        "тест атомарного завершения не может упасть (BLOCKING)",
        "триумф: пояснение о призах видно без прокрутки",
        "ряд действий панели закреплён",
        "нарисованные UI-иконки картинки скрыты"
      ],
      "finishedAt": "2026-09-26T20:50:17+03:00",
      "commit": "d59a822",
      "tests": {
        "passed": 40,
        "failed": 0
      }
    },
    {
      "id": "04",
      "title": "Аркада: движок, спрайты, управление",
      "requirements": [
        "R08",
        "R10",
        "R30",
        "R31",
        "R32",
        "R33",
        "R34",
        "R35",
        "R36",
        "R37",
        "R38",
        "R45",
        "R60",
        "G08",
        "G10",
        "G12",
        "R29"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/arcade/"
      ],
      "status": "done",
      "retries": 1,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-26T18:11:55+03:00",
      "finishedAt": "2026-09-26T21:02:08+03:00",
      "commit": "33a04a6",
      "tests": {
        "passed": 19,
        "failed": 0
      }
    },
    {
      "id": "05",
      "title": "Рейтинг, мост EasyLab и проводка",
      "requirements": [
        "R06",
        "R13",
        "R29",
        "R30",
        "R37",
        "R39",
        "R40",
        "R42",
        "R48",
        "R53",
        "R54",
        "R55",
        "R56",
        "R57",
        "R62",
        "R67",
        "G01",
        "G02",
        "G03",
        "G05",
        "G11",
        "R61"
      ],
      "blockedBy": [
        "02",
        "03",
        "04"
      ],
      "wave": 3,
      "zone": [
        "src/leaderboard/",
        "src/services/bridge*",
        "src/app/",
        "parent_test.html"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 2,
      "handoffs": 0,
      "startedAt": "2026-09-26T21:02:08+03:00",
      "repairFindings": [
        "«Сегодня в рейтинг» в профиле аркады (ист. 60)",
        "текст «Твоя запись скрыта куратором» (ист. 67)",
        "подсветка своей строки при ничьей (ист. 63)",
        "демо-режим без противоречивого «Стань первым» (ист. 68/69)",
        "счётчик «Сегодня в рейтинг» в аркаде не обновляется со вчерашнего дня"
      ],
      "finishedAt": "2026-09-26T21:38:04+03:00",
      "commit": "bb33d5a",
      "tests": {
        "passed": 37,
        "failed": 0
      }
    },
    {
      "id": "06",
      "title": "Страница куратора и Google-таблица",
      "requirements": [
        "R50",
        "R51",
        "R52",
        "R65i",
        "G02",
        "G04",
        "G09",
        "G03",
        "R58",
        "R59"
      ],
      "blockedBy": [
        "02"
      ],
      "wave": 3,
      "zone": [
        "src/verify/",
        "verify.html",
        "integrations/",
        "docs/SUPABASE_SETUP.md",
        "docs/GOOGLE_SHEETS.md"
      ],
      "status": "done",
      "retries": 1,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-26T18:24:42+03:00",
      "finishedAt": "2026-09-26T21:02:08+03:00",
      "commit": "59775b4",
      "tests": {
        "passed": 6,
        "failed": 0
      }
    },
    {
      "id": "07",
      "title": "Сквозная проверка и документация",
      "requirements": [
        "R03",
        "R04",
        "R05",
        "R31",
        "R57",
        "R59",
        "R60",
        "R66",
        "R13",
        "R29",
        "R17",
        "R55"
      ],
      "blockedBy": [
        "05",
        "06"
      ],
      "wave": 4,
      "zone": [
        "tests/e2e/",
        "README.md",
        "docs/INTEGRATION.md"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-09-26T21:38:04+03:00",
      "repairFindings": [
        "выдуманный адрес модуля в INTEGRATION.md → плейсхолдер (BLOCKING)",
        "скриншоты — в tests/e2e/__screenshots__ по критерию тикета",
        "e2e не затирает боевой dist/"
      ],
      "finishedAt": "2026-09-27T12:21:56+03:00",
      "tests": {
        "passed": 232,
        "failed": 0
      }
    }
  ],
  "singlePass": null,
  "tests": {
    "passed": 232,
    "failed": 0
  },
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [
    "A01 — пауза в аркаде (ради R31)",
    "A02 — сообщение EASYLAB_READY (ради R54)"
  ],
  "coverage": {
    "findings": 9,
    "missing": 3,
    "half": 5,
    "extra": "список углублений R##.n",
    "actions": "дописаны: электроника К2, аудиосистема К4, completed_at с клиента, метки высоты, повтор подсказки = подсказка 2, замер FPS, доп. цвета бренда; RPC вместо прямого POST — оставлено осознанно (G03 + приватность), в отчёт"
  },
  "concerns": [
    "T01 tests/rules.test.ts:41 — проверка «никогда < 0» не может упасть; Math.max мёртвый",
    "T01 src/app/router.ts:19-27 — нет тестов охраны маршрутов",
    "T01 src/core/types.ts:141 — arcade.isUnlocked дублирует quest.isCompleted (ставит таск 03)",
    "T01 src/core/state.ts:35 — максимумы комнат дублируют REWARDS",
    "T01 src/core/rules.ts:54,102 — две таблицы кириллица↔латиница",
    "T01 src/core/rules.ts:20 — HintsUsed | number сводится к number",
    "T01 src/core/state.ts:91 — mergeInto не проверяет форму nullable-полей",
    "T01 src/app/shell.ts:109 — подписка createMuteButton без явного destroy",
    "T01 src/app/shell.ts:83,134 — copyText/showToast ищут .ezq-root глобально",
    "T01 tsconfig.json:7 — types:[node] держится на транзитивном @types/node",
    "T01 src/app/shell.ts:9 — опция align:'top' без потребителя",
    "T01 src/services/sfx.ts:97 — play() создаёт AudioContext до жеста (должен только unlock)",
    "T02 supabase/schema.sql:312 — повтор регистрации тем же кодом+ником+монетами без student_id = успех (две одноимённых гостя с одним кодом склеятся) — учитывать completed_at",
    "T02 supabase/schema.sql:381 — дневной лимит считается по сезону+дню: после завершения сезона днём можно получить ещё лимит",
    "T02 src/services/curator.ts:122 — restoreByStudent пишет navigation сам (роутер не узнает) — обходится в T05",
    "T02 src/services/rest.ts:70 — код RpcError из любого заглавного префикса («JWT») вместо белого списка",
    "T02 supabase/schema.sql:364 — повтор run_id не сверяет p_code",
    "T02 R50 — pg_net-триггер и doPost не проверены (нет pg_net в PGlite)",
    "T02 src/services/leaderboard.ts:211 — не-UUID runId засчитывается дважды (требование UUID передано в interfaces)",
    "T02 curator.ts/leaderboard.ts — дублированный цикл повторов и генератор UUID (Reinvention core/state)",
    "T02 curator.ts:71,111 — серверная запись применяется к store двумя разными путями",
    "T02 curator.ts:90 — неустранимые отказы BAD_NAME/BAD_COINS повторяются бесконечно",
    "T02 SQL schema.sql:36 — БЕЗОПАСНОСТЬ: leaderboard_legacy_v0 сохраняет гранты anon без RLS",
    "T02 SQL schema.sql:361,408 — БЕЗОПАСНОСТЬ: get_my_standing — оракул существования кода, перебор 1 млн без лимита",
    "T02 SQL schema.sql:304,337 — код отдаётся любому, знающему student_id (следствие G03)",
    "T02 SQL schema.sql:150 — ezq_fail объявлена immutable",
    "T02 schema.sql:175 ↔ rules.ts:88 — списки мата в SQL и TS не связаны тестом",
    "T03 screen.ts:33 / puzzle-ui.ts:11 — button() объявлен дважды",
    "T03 controller/screen/scene — список комнат [1,2,3,4] в трёх местах",
    "T03 puzzle-ui.ts:147 — createTokenLine возвращает тип SlotBoard",
    "T03 screen.ts:49-569 — 520-строчное замыкание: интро, панель, HUD, триумф делят mutable refs",
    "T03 effects.ts:7 — своя SVG-монетка вместо общего источника (drawCoinIcon)",
    "T03 controller.ts:75 — порядок attempts++ перед isSolved не проверен на верном ответе",
    "T03 puzzles.ts:14 — getAnswer перенесён из api в view (косметика)",
    "T03 screen.ts:555 — триумф может появиться раньше 2.6 с при смене isSyncedWithCurator",
    "T06 docs/SUPABASE_SETUP.md:73 — упомянуть и publishable-ключ sb_publishable_…",
    "T06 Code.gs:48 — статус «Начислено» в таблице без даты",
    "T06 schema.sql:600 — pg_net не повторяет неудачный вебхук (в доке сказано)",
    "T06 verify.css:38 — тёмная тема по prefers-color-scheme не заказывалась",
    "T06 season.ts:99 — пустое название сезона уходит в curator_set_countdown",
    "T04 engine.ts:26 — пружина 20×10 px еле видна на телефоне (G12)",
    "T04 arcade.css:8 — touch-action:none на всей области аркады, кнопки тоже none",
    "T04 input.ts:123 — обе стороны зажаты → едет вправо",
    "T04 render.ts:14 — неограниченный кэш подписей очков",
    "T06 page.ts:153 — секрет, введённый в форму, дописывается в #k= (остаётся в истории)",
    "T06 page.ts:89 — нет теста на FORBIDDEN посреди сессии → экран входа",
    "T03/T04/T06 — четыре копии DOM-хелперов el/button (quest, arcade, verify)",
    "T06 season.ts:51 — границы лимита дублируют schema.sql",
    "T04 tests/e2e/arcade.spec.ts:51 — highScore=max не проверен (старт с 0), bestHeightPx не проверен",
    "T04 game.ts:66 / leaderboard.ts:78 — две реализации UUID v4",
    "T04 screen.ts:205 — режим over мёртвый",
    "T04 screen.ts:162 — таймер «Скопировано» не снимается в destroy",
    "T04 input.ts:33 — коды клавиш перечислены дважды",
    "T03/T04 — quest-shots.mjs и arcade e2e оба на порту 5199",
    "T05 app.ts:165 — любая ошибка submitRun (включая баг) показывается как «ждёт интернета» без лога",
    "T05 leaderboard/screen.ts:340 — при сбое flush после смены ника карточка зависает на «Отправляем…»",
    "T05 app.ts:204,61 — литералы 16 и 75 вместо PLAYER_NAME_MAX/MAX_TOTAL_COINS",
    "T05 app.ts:62 — questCompletedPayload может выдать пустой код и выдуманную дату на незавершённом состоянии",
    "T05 app.ts:252 — destroy будит AudioContext через unlock()",
    "T05 tests/app-wiring.test.ts:120 — highScore в GAME_FINISHED не отличим от score забега",
    "T05 screen.ts:189 — лишняя ветка при ничьей; смена ника снимает подсветку до ответа сервера",
    "T07-приёмка src/quest/screen.ts:207 — в маленьком iframe (≈850×530) панель подсказки перекрывает хотспот книги комнаты 3 (кнопка «Открыть загадку» работает)",
    "T07-приёмка src/services/bridge.ts:141 — при Referrer-Policy: no-referrer EASYLAB_READY выбрасывается, модуль стартует гостем (обход в INTEGRATION.md)",
    "T07-приёмка — двойной тап проверить на реальном телефоне (headless не зумит)",
    "T07-приёмка tests/e2e/arcade.spec.ts:69 — EZQ_SHOTS трактуется как путь",
    "T07 tests/e2e/acceptance.spec.ts:217 — двойной тап стережёт мета user-scalable=no; touch-action проверен только у кнопок (headless не зумит)",
    "T07 tests/e2e/support/flow.ts:140 — playRun спит 6,5 с вместо ожидания времени забега ≥ MIN_RUN_SECONDS",
    "T07 tests/e2e/support/flow.ts:24 — saveOf находит iframe по подстроке index.html",
    "T07 tests/e2e/support/supabase-mock.ts:120 — пороги античита 5/120 литералами, а не из rules.ts",
    "T07 README.md:39 — размер сборки «0,43 МБ» вписан текстом",
    "T07 стенд parent_test под npm run dev проверен только curl'ом оркестратора (200), e2e — на vite preview",
    "T07 arcade.spec.ts:65 / README.md:134 — скриншоты аркады включает EZQ_SHOTS, остальные EZQ_FINAL_SHOTS; команда из README не снимает аркаду",
    "T07 arcade.spec.ts:73 — const dir = SHOTS_DIR лишний псевдоним"
  ],
  "reviewers": {
    "manifestSpec": "rev-ms3",
    "craft": "rev-craft3"
  },
  "blind": null
}
