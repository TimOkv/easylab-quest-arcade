window.STATE =
{
  "slug": "cat-avatar",
  "dir": "2026-09-28-cat-avatar",
  "title": "Последний штрих: аватарка Изика в панели загадки",
  "mode": "semi",
  "depth": "strict",
  "polish": null,
  "tier": "T1",
  "briefFile": "2026-09-28-brief.md",
  "memoryFile": "CLAUDE.md",
  "skillDir": "/Users/timofejokunev/.claude/skills/autopilot",
  "startedAt": "2026-09-28T19:02:03+03:00",
  "updatedAt": "2026-09-28T19:20:22+03:00",
  "finishedAt": "2026-09-28T19:20:22+03:00",
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
      "status": "done",
      "startedAt": "2026-09-28T19:06:02+03:00",
      "note": "1 из 1 таска готов",
      "finishedAt": "2026-09-28T19:16:41+03:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-09-28T19:16:41+03:00",
      "finishedAt": "2026-09-28T19:16:41+03:00",
      "note": "проверено 1 из 1, находок нет"
    },
    {
      "id": "final",
      "status": "done",
      "startedAt": "2026-09-28T19:16:41+03:00",
      "finishedAt": "2026-09-28T19:20:22+03:00",
      "note": "слепая приёмка: расхождений нет, 9 устройств; 383/383 тестов"
    }
  ],
  "requirements": {
    "total": 4,
    "done": 4,
    "inTicket": 0,
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
      "status": "done",
      "startedAt": "2026-09-28T19:06:02+03:00",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "finishedAt": "2026-09-28T19:16:41+03:00",
      "tests": {
        "passed": 383,
        "failed": 0
      },
      "commit": "7bb530f",
      "files": [
        "src/assets/cat-avatar.webp",
        "src/quest/screen.ts",
        "src/quest/quest.css",
        "tests/quest-screen.test.ts",
        "tests/e2e/avatar.spec.ts"
      ]
    }
  ],
  "singlePass": null,
  "tests": {
    "passed": 383,
    "failed": 0,
    "e2e": "avatar 6/6, всего 14 passed + 2 skipped"
  },
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
  "concerns": [
    {
      "ticket": "01",
      "file": "tests/e2e/__screenshots__/final-*.png",
      "note": "старые скриншоты в репо ещё с эмодзи — перезаписываются только при EZQ_FINAL_SHOTS=1",
      "verdict": "report"
    }
  ],
  "reviewers": {
    "manifestSpec": null,
    "craft": null
  },
  "blind": {
    "drift": 0,
    "note": "все требования реализованы; iPad в вертикали — заглушка «Поверни телефон» (сделано раньше, не трогали)"
  }
}
