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
  "updatedAt": "2026-09-26T17:57:58+03:00",
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
      "status": "active",
      "startedAt": "2026-09-26T17:27:10+03:00"
    },
    {
      "id": "spec",
      "status": "pending"
    },
    {
      "id": "plan",
      "status": "pending"
    },
    {
      "id": "build",
      "status": "pending"
    },
    {
      "id": "review",
      "status": "pending"
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
    }
  ],
  "singlePass": null,
  "tests": null,
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
  "concerns": [],
  "reviewers": {
    "manifestSpec": null,
    "craft": null
  },
  "blind": null
}
