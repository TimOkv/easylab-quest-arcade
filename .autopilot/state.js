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
  "updatedAt": "2026-09-27T16:19:53+03:00",
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
      "status": "active",
      "startedAt": "2026-09-27T16:19:40+03:00"
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
    "total": 31,
    "done": 0,
    "inTicket": 31,
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
      "status": "in-progress",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-27T16:19:53+03:00"
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
      "status": "in-progress",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-27T16:19:53+03:00"
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
  "additions": [],
  "coverage": {
    "findings": 3,
    "fixed": 3,
    "notes": "«ходил сам» — ответ 1 внесён в бриф; декор оживает анимацией; эталон расписан в истории 28"
  },
  "concerns": [],
  "reviewers": {
    "manifestSpec": null,
    "craft": null
  },
  "blind": null
}
