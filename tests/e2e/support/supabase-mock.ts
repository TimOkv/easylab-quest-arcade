// Фейковый Supabase для приёмочных e2e: перехват /rest/v1/* через page.route (BrowserContext.route —
// чтобы iframe стенда и страница куратора шли в ту же «базу»). Состояние — в памяти теста.
// Ведёт себя как RPC-контракт из supabase/schema.sql в той мере, в какой его видит клиент.
import type { BrowserContext, Route } from 'playwright/test';

export const MOCK_SUPABASE = 'https://ezq-e2e.supabase.test';
export const DEMO_URL = 'http://127.0.0.1:5231/';
export const MOCK_URL = 'http://127.0.0.1:5232/';
export const CURATOR_SECRET = 'e2e-curator-secret';

export interface Completion {
  verification_code: string;
  player_name: string;
  student_id: string | null;
  coins_earned: number;
  rooms_solved: number;
  completed_at: string;
  is_awarded: boolean;
  awarded_at: string | null;
  possible_duplicate: boolean;
}

export interface ScoreRow {
  run_id: string;
  code: string;
  player_name: string;
  score: number;
  time_spent: number;
  jumps: number;
}

/** Соперники по сезону (очки сезона). Ученик до этого забега уже набрал PRIOR_SEASON — чтобы попасть в ТОП-10. */
export const RIVALS: ReadonlyArray<[string, number]> = [
  ['Лиза', 9100], ['Артём', 7400], ['Соня', 5250], ['Макс', 4100], ['Вика', 3320],
  ['Даня', 2640], ['Ева', 2010], ['Гоша', 1300], ['Кира', 880], ['Тимур', 400],
];
export const PRIOR_SEASON = 1500;

export interface MockDb {
  completions: Map<string, Completion>;
  scores: ScoreRow[];
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  seasonTotal(code: string): number;
}

export async function installSupabaseMock(context: BrowserContext): Promise<MockDb> {
  const db: MockDb = {
    completions: new Map(),
    scores: [],
    calls: [],
    seasonTotal: (code) => PRIOR_SEASON + db.scores.filter((s) => s.code === code).reduce((a, s) => a + s.score, 0),
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const fail = (route: Route, code: string) => json(route, { code: 'P0001', message: `${code}: e2e mock` }, 400);

  const board = () => {
    const mine = new Map<string, { name: string; total: number }>();
    for (const c of db.completions.values()) {
      if (db.scores.some((s) => s.code === c.verification_code)) {
        mine.set(c.verification_code, { name: c.player_name, total: db.seasonTotal(c.verification_code) });
      }
    }
    const rows = [
      ...RIVALS.map(([name, score], i) => ({ code: `EZ-R${i}R${i}`, player_name: name, score, runs_count: 3 + i })),
      ...[...mine].map(([code, m]) => ({ code, player_name: m.name, score: m.total, runs_count: 2 })),
    ];
    rows.sort((a, b) => b.score - a.score);
    return rows.map((r, i) => ({ ...r, rank: i + 1, created_at: '2026-09-20T10:00:00Z' }));
  };
  const standing = (code: string) => {
    const b = board();
    const i = b.findIndex((r) => r.code === code);
    return {
      season_total: db.seasonTotal(code),
      today_counted: db.scores.filter((s) => s.code === code).reduce((a, s) => a + s.score, 0),
      daily_limit: 3000,
      rank: i >= 0 ? i + 1 : null,
      gap_to_top10: null,
      is_hidden: false,
      season_ends_at: '2026-10-31T21:00:00Z',
      season_closed: false,
    };
  };

  await context.route(`${MOCK_SUPABASE}/rest/v1/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const url = new URL(req.url());
    const path = url.pathname.replace('/rest/v1/', '');
    if (req.method() === 'GET' && path === 'leaderboard') {
      const limit = Number(url.searchParams.get('limit') ?? 10);
      return json(route, board().slice(0, limit).map(({ player_name, score, runs_count, created_at }) => ({ player_name, score, runs_count, created_at })));
    }
    if (!path.startsWith('rpc/')) return json(route, { message: `e2e mock: неизвестный путь ${path}` }, 404);
    const name = path.slice(4);
    const a = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    db.calls.push({ name, args: a });
    if (name.startsWith('curator_') && a.p_secret !== CURATOR_SECRET) return fail(route, 'FORBIDDEN');

    switch (name) {
      case 'register_quest_completion': {
        const code = String(a.p_code);
        const existing = db.completions.get(code);
        if (existing) return json(route, { ...existing, restored: false });
        const c: Completion = {
          verification_code: code, player_name: String(a.p_player_name), student_id: (a.p_student_id as string | null) ?? null,
          coins_earned: Number(a.p_coins), rooms_solved: 4, completed_at: String(a.p_completed_at),
          is_awarded: false, awarded_at: null, possible_duplicate: false,
        };
        db.completions.set(code, c);
        return json(route, { verification_code: code, coins_earned: c.coins_earned, completed_at: c.completed_at, player_name: c.player_name, restored: false });
      }
      case 'restore_by_student':
        return json(route, null);
      case 'submit_arcade_score': {
        const code = String(a.p_code);
        if (!db.completions.has(code)) return fail(route, 'NO_QUEST');
        const t = Number(a.p_time_spent);
        if (t < 5) return fail(route, 'TOO_SHORT');
        if (Number(a.p_score) / t > 120) return fail(route, 'CHEAT_SPEED');
        if (!db.scores.some((s) => s.run_id === a.p_run_id)) {
          db.scores.push({ run_id: String(a.p_run_id), code, player_name: String(a.p_player_name), score: Number(a.p_score), time_spent: t, jumps: Number(a.p_jumps) });
        }
        return json(route, { counted: Number(a.p_score), ...standing(code) });
      }
      case 'get_my_standing':
        return json(route, db.completions.has(String(a.p_code)) ? standing(String(a.p_code)) : null);
      case 'get_season_info':
        return json(route, { title: 'Осень 2026', ends_at: '2026-10-31T21:00:00Z', daily_limit: 3000, is_closed: false });
      case 'curator_check':
        return json(route, true);
      case 'curator_recent':
        return json(route, [...db.completions.values()].reverse().slice(0, Number(a.p_limit ?? 50)));
      case 'curator_find':
        return json(route, db.completions.get(String(a.p_code)) ?? null);
      case 'curator_set_awarded': {
        const c = db.completions.get(String(a.p_code));
        if (!c) return json(route, null);
        c.is_awarded = !!a.p_awarded;
        c.awarded_at = c.is_awarded ? new Date().toISOString() : null;
        return json(route, c);
      }
      case 'curator_leaderboard':
        return json(route, board().map((r) => ({ rank: r.rank, verification_code: r.code, player_name: r.player_name, score: r.score, runs_count: r.runs_count, is_hidden: false, created_at: r.created_at })));
      case 'curator_winners':
        return json(route, []);
      default:
        return json(route, { message: `e2e mock: нет RPC ${name}` }, 404);
    }
  });
  return db;
}
