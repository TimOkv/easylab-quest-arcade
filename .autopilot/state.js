window.STATE =
{
  "slug": "corrections-library-coin-sound",
  "dir": "2026-09-28-corrections-library-coin-sound",
  "title": "Правки: баги библиотеки, иконка EasyCoin, музыка и звуки",
  "mode": "semi",
  "depth": "strict",
  "polish": null,
  "tier": "T1",
  "briefFile": "2026-09-28-brief.md",
  "memoryFile": "CLAUDE.md",
  "skillDir": "/Users/timofejokunev/.claude/skills/autopilot",
  "startedAt": "2026-09-28T12:53:03+03:00",
  "updatedAt": "2026-09-28T18:50:00+03:00",
  "finishedAt": "2026-09-28T18:50:00+03:00",
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-09-28T12:53:03+03:00",
      "finishedAt": "2026-09-28T12:55:00+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-09-28T12:55:00+03:00",
      "finishedAt": "2026-09-28T12:55:00+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-09-28T12:55:00+03:00",
      "finishedAt": "2026-09-28T12:57:39+03:00",
      "note": "1 вопрос: выход из библиотеки"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-09-28T12:57:39+03:00",
      "finishedAt": "2026-09-28T13:01:00+03:00",
      "note": "G2: 0 пропусков"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-09-28T13:01:00+03:00",
      "finishedAt": "2026-09-28T13:02:13+03:00",
      "note": "3 таска, ярус T1, 2 волны"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-09-28T13:02:13+03:00",
      "note": "3 из 3 тасков готовы",
      "finishedAt": "2026-09-28T15:39:53+03:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-09-28T13:10:29+03:00",
      "note": "проверено 3 из 3",
      "finishedAt": "2026-09-28T15:39:53+03:00"
    },
    {
      "id": "final",
      "status": "done",
      "startedAt": "2026-09-28T15:39:53+03:00",
      "note": "слепая приёмка: 1 расхождение → таск 04, исправлено; 381/381 тестов",
      "finishedAt": "2026-09-28T18:50:00+03:00"
    }
  ],
  "requirements": {
    "total": 7,
    "done": 7,
    "inTicket": 0,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Музыка и звуковые эффекты снова звучат",
      "requirements": [
        "R05",
        "R06",
        "R07"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/services/",
        "src/app/"
      ],
      "status": "done",
      "finishedAt": "2026-09-28T15:02:05+03:00",
      "tests": {
        "passed": 358,
        "failed": 0
      },
      "commit": "0c91b43",
      "files": [
        "src/app/app.ts",
        "src/services/sfx.ts",
        "tests/services/audio-unlock.test.ts"
      ],
      "startedAt": "2026-09-28T13:02:13+03:00",
      "retries": 0,
      "repairs": 1,
      "repairFindings": [
        "убрать audioSession=playback (лишнее поведение, strict); доказать причину для десктопа с мышью через --autoplay-policy=user-gesture-required"
      ],
      "handoffs": 0
    },
    {
      "id": "02",
      "title": "Фирменная монетка EasyCoin",
      "requirements": [
        "R04",
        "R07"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/quest/effects.ts",
        "src/arcade/sprites.ts"
      ],
      "status": "done",
      "finishedAt": "2026-09-28T13:12:16+03:00",
      "tests": {
        "passed": 354,
        "failed": 0
      },
      "commit": "caa90c2",
      "files": [
        "src/quest/effects.ts",
        "src/arcade/sprites.ts",
        "src/quest/quest.css",
        "src/arcade/arcade.css",
        "tests/easycoin.test.ts"
      ],
      "startedAt": "2026-09-28T13:02:13+03:00",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
    },
    {
      "id": "03",
      "title": "Библиотека: не по столу, выход в нижнюю дверь, логотип на мониторе",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R07"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/quest/world/rooms.ts",
        "tests/world-walk.test.ts"
      ],
      "status": "done",
      "finishedAt": "2026-09-28T15:39:06+03:00",
      "tests": {
        "passed": 364,
        "failed": 0
      },
      "commit": "0318fee",
      "files": [
        "src/quest/world/rooms.ts",
        "src/quest/screen.ts",
        "src/quest/quest.css",
        "tests/world-walk.test.ts"
      ],
      "startedAt": "2026-09-28T13:18:24+03:00",
      "retries": 0,
      "repairs": 2,
      "repairFindings": [
        "выход: Изик идёт по книгам и прячется под плашкой — ноги перед стопками, плашка не закрывает approach, клавиатурой не встать на книгу",
        "выход должен срабатывать и со стрелок (радиус 10 у кромки недостижим с клавиатуры)"
      ],
      "handoffs": 0
    },
    {
      "id": "04",
      "title": "Библиотека: к выходу стрелками и от стола (находка слепой приёмки)",
      "requirements": [
        "R02",
        "R07"
      ],
      "blockedBy": [
        "03"
      ],
      "wave": 3,
      "zone": [
        "src/quest/world/rooms.ts",
        "src/quest/screen.ts",
        "tests/world-walk.test.ts"
      ],
      "status": "done",
      "finishedAt": "2026-09-28T16:15:29+03:00",
      "tests": {
        "passed": 381,
        "failed": 0
      },
      "commit": "078f16b",
      "files": [
        "src/quest/world/rooms.ts",
        "src/quest/screen.ts",
        "tests/world-walk.test.ts",
        "tests/quest-screen.test.ts"
      ],
      "startedAt": "2026-09-28T15:52:40+03:00",
      "retries": 0,
      "repairs": 1,
      "repairFindings": [
        "длинный маршрут выхода пробегается за 1 с — нужна обычная скорость шага"
      ],
      "handoffs": 0
    }
  ],
  "singlePass": null,
  "tests": {
    "passed": 381,
    "failed": 0
  },
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "findings": 0,
    "note": "G2: пропусков нет; 3 строки «сверх брифа» — проверки R04/R05/R07, привязаны к ним"
  },
  "concerns": [
    "REPORT: src/arcade/sprites.ts drawCoinIcon (canvas) не покрыт юнит-тестом — happy-dom не рисует canvas; проверен скриншотом",
    "DROP: однобуквенные имена k/px в drawCoinIcon — дело вкуса, код читается"
  ],
  "reviewers": {
    "manifestSpec": "rev-ms",
    "craft": "rev-craft"
  },
  "blind": {
    "agreed": [
      "R01",
      "R03",
      "R04",
      "R05",
      "R06",
      "R07"
    ],
    "drift": [
      "R02 — от стола стрелками вниз→влево Изик застревал у корзины/стопок, выход не срабатывал → исправлено таском 04 (078f16b)"
    ]
  },
  "memory": "CLAUDE.md дополнен в ходе разработки (монетка, звук, startDoor, библиотека); полная перепись не нужна — прогон правок T1 поверх актуального файла, строки сверены с кодом"
}
