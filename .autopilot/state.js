window.STATE =
{
  "slug": "cat-avatar",
  "dir": "2026-09-28-cat-avatar--wip",
  "title": "Последний штрих: аватарка Изика в панели загадки",
  "mode": "semi",
  "depth": "strict",
  "polish": null,
  "tier": "T1",
  "briefFile": "2026-09-28-brief.md",
  "memoryFile": "CLAUDE.md",
  "skillDir": "/Users/timofejokunev/.claude/skills/autopilot",
  "startedAt": "2026-09-28T19:02:03+03:00",
  "updatedAt": "2026-09-28T19:06:02+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-09-28T19:02:03+03:00",
      "finishedAt": "2026-09-28T19:02:46+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-09-28T19:02:46+03:00",
      "finishedAt": "2026-09-28T19:02:54+03:00",
      "note": "4 требования"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "note": "вопросов не потребовалось"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-09-28T19:02:54+03:00",
      "finishedAt": "2026-09-28T19:05:29+03:00",
      "note": "G2: 1 наполовину → дописано"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-09-28T19:05:29+03:00",
      "finishedAt": "2026-09-28T19:06:02+03:00",
      "note": "1 таск — чтобы проверку и ремонт делал исполнитель"
    },
    {
      "id": "build",
      "status": "active",
      "startedAt": "2026-09-28T19:06:02+03:00",
      "note": "0 из 1 таска"
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
    "total": 4,
    "done": 0,
    "inTicket": 4,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Аватарка Изика вместо эмодзи + проверка на всех устройствах",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/quest/",
        "src/assets/",
        "tests/"
      ],
      "status": "in-progress",
      "startedAt": "2026-09-28T19:06:02+03:00",
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
    "findings": 2,
    "note": "1 наполовину: R04 без сценария ремонта → дописан в историю 5; 5 сверх брифа — ремесло (webp, список устройств, предзагрузка, имена скриншотов) и размер 64 вместо 48 → записан как решение ради R03, назван в отчёте"
  },
  "concerns": [],
  "reviewers": {
    "manifestSpec": null,
    "craft": null
  },
  "blind": null
}
