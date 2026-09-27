window.STATE =
{
  "slug": "quest-walkable-rooms",
  "dir": "2026-09-27-quest-walkable-rooms--wip",
  "title": "Котик ходит по 4 комнатам, 8 загадок, 8-бит музыка",
  "mode": "interview",
  "depth": "deep",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-09-27-brief.md",
  "memoryFile": "CLAUDE.md",
  "skillDir": "/Users/timofejokunev/.claude/skills/autopilot",
  "startedAt": "2026-09-27T14:38:15+03:00",
  "updatedAt": "2026-09-27T23:58:00+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-09-27T14:38:15+03:00",
      "finishedAt": "2026-09-27T14:39:17+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-09-27T14:38:15+03:00",
      "finishedAt": "2026-09-27T14:39:17+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-09-27T14:39:17+03:00",
      "finishedAt": "2026-09-27T16:11:45+03:00",
      "note": "13 вопросов (интервью, deep)"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-09-27T16:11:45+03:00",
      "finishedAt": "2026-09-27T16:17:11+03:00",
      "note": "G2: 3 находки, дописано"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-09-27T16:17:11+03:00",
      "finishedAt": "2026-09-27T16:19:40+03:00",
      "note": "6 тасков, ярус T2, 4 волны"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-09-27T16:19:40+03:00",
      "note": "6 из 6 тасков готовы",
      "finishedAt": "2026-09-27T23:58:00+03:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-09-27T16:23:30+03:00",
      "note": "проверено 6 из 6; таск 06 — 1 ремонт (R19)",
      "finishedAt": "2026-09-27T23:58:00+03:00"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 31,
    "done": 31,
    "inTicket": 0,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Ядро: 8 загадок, до 150 монет, миграция",
      "requirements": [
        "R06",
        "R13",
        "R14",
        "R15",
        "R20i",
        "R23i",
        "R24i",
        "R26i",
        "R27i",
        "G03",
        "R28i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/core/",
        "src/quest/puzzles.ts",
        "src/quest/controller.ts",
        "src/app/app.ts",
        "src/services/curator.ts",
        "src/services/bridge.ts"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-27T16:19:53+03:00",
      "finishedAt": "2026-09-27T18:14:00+03:00",
      "commit": "b7a261b",
      "tests": {
        "passed": 288,
        "failed": 0
      },
      "files": [
        "src/core/types.ts",
        "src/core/state.ts",
        "src/core/rules.ts",
        "src/quest/puzzles.ts",
        "src/quest/puzzle-ui.ts",
        "src/quest/controller.ts",
        "src/quest/screen.ts",
        "src/quest/quest.css",
        "src/app/app.ts",
        "src/services/curator.ts",
        "src/services/bridge.ts",
        "src/arcade/screen.ts"
      ]
    },
    {
      "id": "02",
      "title": "Сервер и куратор: 150 и coins_max",
      "requirements": [
        "R20i",
        "R24i",
        "R28i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "supabase/",
        "integrations/",
        "src/verify/",
        "tests/sql/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-27T16:19:53+03:00",
      "finishedAt": "2026-09-27T16:25:07+03:00",
      "commit": "50b1389",
      "tests": {
        "passed": 48,
        "failed": 0
      },
      "files": [
        "supabase/schema.sql",
        "src/verify/page.ts",
        "integrations/google-apps-script/Code.gs",
        "tests/sql/schema.test.ts",
        "tests/verify-page.test.ts",
        "docs/SUPABASE_SETUP.md",
        "docs/GOOGLE_SHEETS.md"
      ]
    },
    {
      "id": "03",
      "title": "8-бит музыка и кнопка 🎵",
      "requirements": [
        "R11",
        "R12",
        "R25i",
        "R28i"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/services/music.ts",
        "src/app/shell.ts",
        "src/arcade/screen.ts",
        "src/leaderboard/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-27T18:14:00+03:00",
      "finishedAt": "2026-09-27T18:31:00+03:00",
      "commit": "2c74f2a",
      "tests": {
        "passed": 298,
        "failed": 0
      },
      "files": [
        "src/services/music.ts",
        "src/services/sfx.ts",
        "src/app/shell.ts",
        "src/app/screens.ts",
        "src/app/app.ts",
        "src/arcade/screen.ts",
        "src/leaderboard/screen.ts",
        "tests/music.test.ts",
        "tests/sfx.test.ts"
      ]
    },
    {
      "id": "04",
      "title": "Мир: 4 комнаты, разметка, ходьба, спрайт Изика",
      "requirements": [
        "R01",
        "R03",
        "R04",
        "R05",
        "R07",
        "R08",
        "R09",
        "R21i",
        "R22i",
        "R28i"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "scripts/",
        "src/assets/rooms/",
        "src/quest/world/",
        "src/core/clock.ts"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 1,
      "startedAt": "2026-09-27T18:14:00+03:00",
      "finishedAt": "2026-09-27T19:05:00+03:00",
      "commit": "99c0368",
      "tests": {
        "passed": 320,
        "failed": 0
      },
      "files": [
        "scripts/prep-rooms.py",
        "src/assets/rooms/*.webp",
        "src/core/clock.ts",
        "src/arcade/clock.ts",
        "src/arcade/game.ts",
        "src/arcade/engine.ts",
        "src/quest/world/rooms.ts",
        "src/quest/world/walk.ts",
        "src/quest/world/cat-sprite.ts",
        "src/quest/world/brand.ts",
        "tests/world-walk.test.ts",
        "tests/e2e/world-harness.html",
        "tests/e2e/world-harness.ts"
      ]
    },
    {
      "id": "05",
      "title": "Экран квеста: Изик ходит, «Пройти задачу»",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R08",
        "R13",
        "R15",
        "R21i",
        "R22i",
        "R26i",
        "R27i",
        "R11",
        "G03",
        "R28i"
      ],
      "blockedBy": [
        "03",
        "04"
      ],
      "wave": 3,
      "zone": [
        "src/quest/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-27T19:05:00+03:00",
      "finishedAt": "2026-09-27T19:34:00+03:00",
      "commit": "3534f97",
      "tests": {
        "passed": 329,
        "failed": 0
      },
      "files": [
        "src/quest/screen.ts",
        "src/quest/scene.ts",
        "src/quest/quest.css",
        "src/quest/world/walk.ts",
        "src/quest/world/rooms.ts",
        "src/app/screens.ts",
        "tests/world-walk.test.ts",
        "tests/e2e/support/flow.ts"
      ]
    },
    {
      "id": "06",
      "title": "Дверь и переход, декор, бренд, поворот телефона",
      "requirements": [
        "R16",
        "R17",
        "R18",
        "R19",
        "R09",
        "R10",
        "G01",
        "G02",
        "R13",
        "R28i"
      ],
      "blockedBy": [
        "05"
      ],
      "wave": 4,
      "zone": [
        "src/quest/",
        "tests/e2e/",
        "docs/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-09-27T19:34:00+03:00",
      "finishedAt": "2026-09-27T23:58:00+03:00",
      "tests": {
        "passed": 331,
        "failed": 0
      },
      "files": [
        "src/quest/screen.ts",
        "src/quest/quest.css",
        "src/quest/texts.ts",
        "scripts/prep-rooms.py",
        "src/assets/rooms/attic.webp",
        "tests/quest-screen.test.ts",
        "tests/e2e/acceptance.spec.ts",
        "tests/e2e/support/flow.ts",
        "docs/INTEGRATION.md",
        "docs/adr/0004-coin-formula.md"
      ]
    }
  ],
  "singlePass": null,
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "findings": 3,
    "fixed": 3,
    "notes": "«ходил сам» — ответ 1 внесён в бриф; декор оживает анимацией; эталон расписан в истории 28"
  },
  "concerns": [
    "T02 docs/SUPABASE_SETUP.md:47 — цитирует «Реестр не принял данные — покажи код куратору», которого пока нет в UI (закроют T01/T05)",
    "T02 supabase/schema.sql — максимум 150 записан 4 раза (DEFAULT, INSERT, CHECK, guard)",
    "T02 supabase/schema.sql — цикл снятия CHECK по like %coins_earned% снимет и будущие ограничения",
    "T02 Code.gs:112 — столбец монет: числа в старых строках, текст «N из M» в новых — сумма/сортировка в таблице ломается",
    "T02 тесты — payload вебхука с coins_max ничем не проверен (в PGlite нет pg_net)",
    "T01 src/app/app.ts:71 — puzzles в payload моста выбираются по maxPossibleCoins===150: восстановленное с сервера прохождение отдаст 8 нулевых записей при ненулевых coinsEarned",
    "T01 tests/quest-puzzles.test.ts:229 — тест «Мурзика больше нет» не мог покраснеть (смотрит не туда, где был Мурзик)",
    "T01 src/quest/puzzles.ts — дубли: разбор вызова функции (checkPlay/checkFunctions), нормализация массива строк ×3, фабрика choiceRenderer только для части загадок",
    "T01 список комнат [1,2,3,4] перечисляется в 6 местах; rewardFor/currentReward молча дают 0 на чужой id; ветка нормализации maxPossibleCoins в hydrate без теста",
    "T01 spec — вводные var_types и fn_mission длиннее 2 фраз, while_pc не от лица Изика («Вводные — от лица Изика, 1–2 фразы»)",
    "T01 puzzle-ui — добавлены примитивы createChoice/createCheckRows (тикет просил существующие; поверхность внутренняя)",
    "T03 src/app/shell.ts:146 — «музыка выключена» у 🎵 inline-стилями с зашитым цветом, мимо токенов и светлой темы (app.css был вне зоны)",
    "T03 src/services/music.ts:290 — опрос isMuted() каждые 25 мс крутится и при выключенной музыке (следствие сигнатуры createMusic(isMuted) в interfaces)",
    "T03 src/services/music.ts — setTimeout в dropBus не отменяется в destroy(); дубль «ленивый ресурс на контекст» (pulse25/noise)",
    "T03 tests/music.test.ts:155,180 — тесты держатся за имя метода AudioParam и порядок создания шин",
    "T03 music? необязателен в зависимостях экранов аркады и рейтинга — лишние ветки без кнопки 🎵",
    "T04 src/assets/rooms/attic.webp — заплатки на месте кнопок в углах чердака заметны (размытый прямоугольник справа, тёмно-красное пятно слева); kitchen.webp — светлый прямоугольник у стены ≈1300×100",
    "T04 scripts/prep-rooms.py:7 — при полях < 16 px картинка растягивается (искажение < 1 %), не строгий contain; мёртвая ветка clone_soft, у split позиционные поля",
    "T04 src/quest/world/rooms.ts — постер «не для тапа» через radius: 0; прямоугольники предмета и препятствия дублируются у гитары, кресла, телескопа, спящего кота",
    "T04 arcade/clock — прослойка реэкспорта при том, что game.ts уже импортирует core/clock под псевдонимом",
    "T04 brand.ts — EASYCODE_LIGHT назван брендовым цветом без источника; копия hex в палитре спрайта; sym20 назван неверно",
    "T04 tests/world-walk.test.ts:102 — проверка пути в мебель обёрнута в if(path.length), покраснеть не может; импорты посреди файла",
    "T05 src/quest/screen.ts — постер исключается по radius <= 0 (sentinel из T04); openPuzzle перекрывает имена room/def; renderAction играет звук; текст управления дважды",
    "T05 src/quest/world/walk.ts:110,163 — правило «8 направлений без срезания углов» продублировано в BFS и A*",
    "T05 quest.css/screen.ts:333 — зашитые цвета вместо токенов --ezq-navy-deep/--ezq-gold/--ezq-blue",
    "T05 e2e — не покрыты стрелки/WASD, клавиша E, отмена пути, скрытие подсказки, «Решено ✓ +N», «Загадки k/2», спавн после перезагрузки",
    "T05 → передано в таск 06: пороги триумфа по комнатным суммам; мёртвый CSS камеры/хотспотов; rAF в режимах puzzle/triumph",
    "T06 src/quest/screen.ts:535-641 — машина состояний перехода через дверь живёт в экране (1139 строк), проверяема только e2e; расчёт фаз стоит вынести в модуль без DOM с unit-тестами",
    "T06 src/quest/screen.ts:594,632,252 — дубли: интерполяция from→to дважды, расстояние до предмета через Math.hypot при готовом within",
    "T06 src/quest/screen.ts:618 — шаги из проёма решаются сравнением по ссылке from === def.spawn",
    "T06 src/quest/screen.ts:1021 — «старое прохождение» по maxPossibleCoins === 75, та же проверка в services/curator.ts:37; нет одного понятия в core",
    "T06 src/quest/screen.ts:1086 — класс ezq-quest--rotate ставится, но в CSS не используется",
    "T06 screen.ts:48,51 / quest.css:1306,1517 — длительности карточки (1.5 с) и оживания декора (0.4 с) заданы и в TS, и в CSS",
    "T06 src/quest/screen.ts:938 — постер→триумф идёт по setTimeout, а переход через дверь по времени сцены: на паузе «Поверни телефон» первое идёт, второе стоит",
    "T06 quest.css:1330–1499 — усугублён долг зашитых цветов: #fff8ea, #ffe9e0, #070a18, фирменный синий мимо токенов, 1600/900px копией STAGE_W/H",
    "T06 tests/quest-screen.test.ts — текст триумфа для старого прохождения на 75 монет не покрыт",
    "T06 src/quest/screen.ts:57 — звуки декора: «мурр (низкий тон)» у спящего кота звучит как click, «нота» у гитары — как jump (таблица «Декор» просит свои звуки)",
    "T06 src/assets/rooms/kitchen.webp — светлый прямоугольник у стены так и остался (не входил в ремонт)",
    "T06 скриншот спальни — «Решено ✓ +10» частично закрывает ✓ своего же шкафа",
    "T06 src/quest/screen.ts:899,1056,1083 — отклик панели и шаги триумфа по-прежнему на setTimeout, на паузе поворота идут"
  ],
  "reviewers": {
    "manifestSpec": "rev-ms-06 (a07a8c30f1ceb1979)",
    "craft": "rev-craft-06 (a6a532f5158bd6a5e)"
  },
  "blind": null
}
