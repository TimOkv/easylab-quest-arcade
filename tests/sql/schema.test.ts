// RPC-контракт supabase/schema.sql в PGlite (реальный Postgres в WASM).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const SCHEMA = readFileSync(resolve(import.meta.dirname, '../../supabase/schema.sql'), 'utf8');
const SECRET = 'curator-secret-42';

let db: PGlite;

/** Вызов RPC от имени анонимной роли (как через PostgREST с anon-ключом). */
async function rpc<T = any>(fn: string, args: unknown[] = []): Promise<T> {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  await db.exec('SET ROLE anon');
  try {
    const res = await db.query<{ r: T }>(`select public.${fn}(${ph}) as r`, args);
    return res.rows[0].r;
  } finally {
    await db.exec('RESET ROLE');
  }
}

const uuid = () => crypto.randomUUID();
const names = new Map<string, string>(); // код → ник, с которым ученик играет
const register = (code: string, name = 'Аня', student: string | null = null, coins = 60, at: string | null = null) => {
  names.set(code, name.trim());
  return rpc('register_quest_completion', [code, name, student, coins, at]);
};
const submit = (code: string, score: number, time = 100, opts: { run?: string; name?: string; jumps?: number } = {}) =>
  rpc('submit_arcade_score', [opts.run ?? uuid(), code, 'sess-1', null, opts.name ?? names.get(code) ?? 'Аня', score, time, opts.jumps ?? 10]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // повторный прогон — без ошибок
  await db.query('select public.ezq_set_curator_secret($1)', [SECRET]);
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    truncate public.arcade_runs, public.leaderboard_entries, public.season_winners, public.quest_completions cascade;
    delete from public.seasons where not is_active;
    update public.seasons set ends_at = null, title = 'Сезон 1' where is_active;
    update public.ezq_settings set daily_score_limit = 3000;
  `);
});

describe('schema.sql: развёртывание и доступ', () => {
  it('сид: активный «Сезон 1» и лимит 3000', async () => {
    expect(await rpc('get_season_info')).toEqual({ title: 'Сезон 1', ends_at: null, daily_limit: 3000, is_closed: false });
  });

  it('anon не читает и не пишет таблицы напрямую', async () => {
    await db.exec('SET ROLE anon');
    try {
      for (const t of ['quest_completions', 'leaderboard_entries', 'arcade_runs', 'seasons', 'season_winners', 'ezq_settings']) {
        await expect(db.query(`select * from public.${t}`), t).rejects.toThrow(/permission denied/);
      }
      await expect(db.query(`insert into public.quest_completions (verification_code, player_name, coins_earned) values ('EZ-2222','x',75)`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`update public.ezq_settings set daily_score_limit = 999999`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select public.ezq_set_curator_secret('hack')`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('RESET ROLE');
    }
  });

  it('представление leaderboard читается anon и не содержит кодов и student_id', async () => {
    await register('EZ-AAAA', 'Аня', 'st-1');
    await submit('EZ-AAAA', 500);
    await db.exec('SET ROLE anon');
    try {
      const res = await db.query<Record<string, unknown>>('select * from public.leaderboard order by score desc, created_at asc limit 10');
      expect(res.fields.map((f) => f.name).sort()).toEqual(['created_at', 'player_name', 'runs_count', 'score']);
      expect(res.rows[0]).toMatchObject({ player_name: 'Аня', score: 500, runs_count: 1 });
    } finally {
      await db.exec('RESET ROLE');
    }
  });
});

describe('register_quest_completion / restore_by_student', () => {
  it('регистрирует прохождение с точными монетами', async () => {
    const r = await register('EZ-2345', 'Петя', null, 58);
    expect(r).toMatchObject({ verification_code: 'EZ-2345', coins_earned: 58, restored: false });
    const row = (await db.query<any>(`select * from public.quest_completions where verification_code='EZ-2345'`)).rows[0];
    expect(row).toMatchObject({ player_name: 'Петя', coins_earned: 58, rooms_solved: 4, is_awarded: false });
  });

  it('повтор с тем же student_id → restored=true и прежняя запись', async () => {
    await register('EZ-2345', 'Петя', 'stud-7', 58);
    const again = await register('EZ-9999', 'Петя', 'stud-7', 75);
    expect(again).toMatchObject({ verification_code: 'EZ-2345', coins_earned: 58, restored: true });
    expect((await db.query<any>('select count(*)::int n from public.quest_completions')).rows[0].n).toBe(1);
    expect(await rpc('restore_by_student', ['stud-7'])).toMatchObject({ verification_code: 'EZ-2345', coins_earned: 58, player_name: 'Петя' });
    expect(await rpc('restore_by_student', ['nobody'])).toBeNull();
  });

  it('занятый код другим учеником → CODE_TAKEN', async () => {
    await register('EZ-2345', 'Петя', null, 58);
    await expect(register('EZ-2345', 'Маша', null, 40)).rejects.toThrow(/^CODE_TAKEN/);
  });

  it('повтор того же прохождения (ответ потерялся) → идемпотентно, без CODE_TAKEN', async () => {
    await register('EZ-2345', 'Петя', null, 58);
    await expect(register('EZ-2345', 'Петя', null, 58)).resolves.toMatchObject({ verification_code: 'EZ-2345', coins_earned: 58 });
  });

  it('валидация: код, ник, монеты 0..75', async () => {
    await expect(register('EZ-1111')).rejects.toThrow(/^BAD_CODE/); // 1 нет в алфавите
    await expect(register('EZ-2345', 'x')).rejects.toThrow(/^BAD_NAME/);
    await expect(register('EZ-2345', '<b>hi</b>')).rejects.toThrow(/^BAD_NAME/);
    await expect(register('EZ-2345', 'Сука123')).rejects.toThrow(/^BAD_NAME/);
    await expect(register('EZ-2345', 'fUcK_boy')).rejects.toThrow(/^BAD_NAME/);
    await expect(register('EZ-2345', 'Аня', null, 76)).rejects.toThrow(/^BAD_COINS/);
    await expect(register('EZ-2345', 'Аня', null, -1)).rejects.toThrow(/^BAD_COINS/);
  });

  it('completed_at клиента в окне [−30 д, +5 мин] принимается, вне окна — now()', async () => {
    const inWindow = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
    const r1 = await register('EZ-2345', 'Петя', null, 10, inWindow);
    expect(Date.parse(r1.completed_at)).toBe(Date.parse(inWindow));
    const tooOld = new Date(Date.now() - 40 * 24 * 3600_000).toISOString();
    const r2 = await register('EZ-3456', 'Маша', null, 10, tooOld);
    expect(Math.abs(Date.parse(r2.completed_at) - Date.now())).toBeLessThan(60_000);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const r3 = await register('EZ-4567', 'Коля', null, 10, future);
    expect(Math.abs(Date.parse(r3.completed_at) - Date.now())).toBeLessThan(60_000);
  });
});

describe('submit_arcade_score', () => {
  beforeEach(async () => {
    await register('EZ-AAAA', 'Аня', 'st-a');
  });

  it('очки копятся в сумму сезона, одна строка на код', async () => {
    const r1 = await submit('EZ-AAAA', 400);
    expect(r1).toMatchObject({ counted: 400, season_total: 400, today_counted: 400, daily_limit: 3000, rank: 1, season_closed: false, is_hidden: false });
    const r2 = await submit('EZ-AAAA', 300);
    expect(r2).toMatchObject({ counted: 300, season_total: 700, today_counted: 700 });
    expect((await db.query<any>('select count(*)::int n, max(score) s, max(runs_count) rc from public.leaderboard_entries')).rows[0]).toEqual({ n: 1, s: 700, rc: 2 });
  });

  it('дневной лимит обрезает counted, дальше +0', async () => {
    await db.exec('update public.ezq_settings set daily_score_limit = 1000');
    expect(await submit('EZ-AAAA', 800)).toMatchObject({ counted: 800 });
    expect(await submit('EZ-AAAA', 800)).toMatchObject({ counted: 200, season_total: 1000, today_counted: 1000, daily_limit: 1000 });
    expect(await submit('EZ-AAAA', 500)).toMatchObject({ counted: 0, season_total: 1000 });
  });

  it('повтор run_id не удваивает начисление', async () => {
    const run = uuid();
    const a = await submit('EZ-AAAA', 400, 100, { run });
    const b = await submit('EZ-AAAA', 400, 100, { run });
    expect(b).toMatchObject({ counted: 400, season_total: 400 });
    expect(a.season_total).toBe(400);
    expect((await db.query<any>('select count(*)::int n from public.arcade_runs')).rows[0].n).toBe(1);
  });

  it('отказы: CHEAT_SPEED, TOO_SHORT, SCORE_RANGE, NO_QUEST, BAD_CODE, BAD_NAME', async () => {
    await expect(submit('EZ-AAAA', 1300, 10)).rejects.toThrow(/^CHEAT_SPEED/); // 130 очк/с
    await expect(submit('EZ-AAAA', 1200, 10)).resolves.toMatchObject({ counted: 1200 }); // ровно 120 — можно
    await expect(submit('EZ-AAAA', 10, 4)).rejects.toThrow(/^TOO_SHORT/);
    await expect(submit('EZ-AAAA', 50001, 1000)).rejects.toThrow(/^SCORE_RANGE/);
    await expect(submit('EZ-AAAA', -5, 100)).rejects.toThrow(/^SCORE_RANGE/);
    await expect(submit('EZ-BBBB', 100)).rejects.toThrow(/^NO_QUEST/);
    await expect(submit('ez-aaaa', 100)).rejects.toThrow(/^BAD_CODE/);
    await expect(submit('EZ-AAAA', 100, 100, { name: 'хуйло' })).rejects.toThrow(/^BAD_NAME/);
  });

  it('больше 60 забегов на код за сутки → RATE_LIMIT', async () => {
    for (let i = 0; i < 60; i++) await submit('EZ-AAAA', 1, 10);
    await expect(submit('EZ-AAAA', 1, 10)).rejects.toThrow(/^RATE_LIMIT/);
  });

  it('сезон с прошедшим ends_at: counted=0, season_closed=true, сумма не растёт', async () => {
    await submit('EZ-AAAA', 300);
    await db.exec(`update public.seasons set ends_at = now() - interval '1 minute' where is_active`);
    expect(await submit('EZ-AAAA', 500)).toMatchObject({ counted: 0, season_total: 300, season_closed: true });
    expect(await rpc('get_season_info')).toMatchObject({ is_closed: true });
  });

  it('ранги и gap_to_top10', async () => {
    const codes = ['EZ-2222', 'EZ-3333', 'EZ-4444', 'EZ-5555', 'EZ-6666', 'EZ-7777', 'EZ-8888', 'EZ-9999', 'EZ-CCCC', 'EZ-DDDD'];
    for (const [i, c] of codes.entries()) {
      await register(c, `Игрок${i}`);
      await submit(c, 1000 + i * 100); // 1000..1900; 10-е место — 1000
    }
    const me = await submit('EZ-AAAA', 400);
    expect(me).toMatchObject({ rank: 11, gap_to_top10: 601 }); // 1000 − 400 + 1
    expect(await rpc('get_my_standing', ['EZ-DDDD'])).toMatchObject({ rank: 1, gap_to_top10: null, season_total: 1900 });
    const top = (await db.query<any>('select player_name, score from public.leaderboard order by score desc, created_at asc limit 10')).rows;
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({ player_name: 'Игрок9', score: 1900 });
  });

  it('get_my_standing без записи — нули; неизвестный код — null', async () => {
    expect(await rpc('get_my_standing', ['EZ-AAAA'])).toMatchObject({ rank: null, season_total: 0, today_counted: 0, daily_limit: 3000, is_hidden: false });
    expect(await rpc('get_my_standing', ['EZ-ZZZZ'])).toBeNull();
  });
});

describe('curator_*', () => {
  it('неверный секрет → FORBIDDEN во всех curator_*', async () => {
    const calls: Array<[string, unknown[]]> = [
      ['curator_check', ['bad']],
      ['curator_find', ['bad', 'EZ-AAAA']],
      ['curator_recent', ['bad', 10]],
      ['curator_set_awarded', ['bad', 'EZ-AAAA', true]],
      ['curator_leaderboard', ['bad']],
      ['curator_set_hidden', ['bad', 'EZ-AAAA', true]],
      ['curator_set_daily_limit', ['bad', 5000]],
      ['curator_set_countdown', ['bad', 'x', null]],
      ['curator_finish_season', ['bad', 'x']],
      ['curator_winners', ['bad']],
    ];
    for (const [fn, args] of calls) await expect(rpc(fn, args), fn).rejects.toThrow(/^FORBIDDEN/);
    expect(await rpc('curator_check', [SECRET])).toBe(true);
  });

  it('find / set_awarded / recent и флаг «возможный дубль»', async () => {
    await register('EZ-AAAA', 'Аня', null, 60);
    await register('EZ-BBBB', 'Петя', 'st-p', 70);
    expect(await rpc('curator_find', [SECRET, 'ez-bbbb'])).toMatchObject({ verification_code: 'EZ-BBBB', coins_earned: 70, is_awarded: false, possible_duplicate: false });
    await register('EZ-CCCC', ' аня ', null, 75); // тот же ник гостем
    expect(await rpc('curator_find', [SECRET, 'EZ-AAAA'])).toMatchObject({ possible_duplicate: true });
    const awarded = await rpc('curator_set_awarded', [SECRET, 'EZ-BBBB', true]);
    expect(awarded).toMatchObject({ is_awarded: true });
    expect(awarded.awarded_at).not.toBeNull();
    const recent = await rpc<any[]>('curator_recent', [SECRET, 500]);
    expect(recent.map((r) => r.verification_code).sort()).toEqual(['EZ-AAAA', 'EZ-BBBB', 'EZ-CCCC']);
    expect(await rpc('curator_find', [SECRET, 'EZ-ZZZZ'])).toBeNull();
  });

  it('скрытие: нет в leaderboard, но get_my_standing сообщает is_hidden', async () => {
    await register('EZ-AAAA', 'Аня');
    await register('EZ-BBBB', 'Петя');
    await submit('EZ-AAAA', 500);
    await submit('EZ-BBBB', 300);
    await rpc('curator_set_hidden', [SECRET, 'EZ-AAAA', true]);
    const names = (await db.query<any>('select player_name from public.leaderboard')).rows.map((r) => r.player_name);
    expect(names).toEqual(['Петя']);
    expect(await rpc('get_my_standing', ['EZ-AAAA'])).toMatchObject({ is_hidden: true, rank: null, season_total: 500 });
    expect(await rpc('get_my_standing', ['EZ-BBBB'])).toMatchObject({ rank: 1 });
    const lb = await rpc<any[]>('curator_leaderboard', [SECRET]);
    expect(lb.find((r) => r.verification_code === 'EZ-AAAA')).toMatchObject({ is_hidden: true, score: 500 });
  });

  it('лимит и отсчёт меняются куратором', async () => {
    await expect(rpc('curator_set_daily_limit', [SECRET, 50])).rejects.toThrow(/^BAD_LIMIT/);
    await rpc('curator_set_daily_limit', [SECRET, 1200]);
    const ends = new Date(Date.now() + 5 * 24 * 3600_000).toISOString();
    await rpc('curator_set_countdown', [SECRET, 'Осенний кубок', ends]);
    const info = await rpc('get_season_info');
    expect(info).toMatchObject({ title: 'Осенний кубок', daily_limit: 1200, is_closed: false });
    expect(Date.parse(info.ends_at)).toBe(Date.parse(ends));
  });

  it('finish_season архивирует ТОП-3 и открывает новый сезон с нуля', async () => {
    const players: Array<[string, string, number]> = [['EZ-AAAA', 'Аня', 900], ['EZ-BBBB', 'Петя', 700], ['EZ-CCCC', 'Маша', 800], ['EZ-DDDD', 'Коля', 100]];
    for (const [c, n, s] of players) {
      await register(c, n);
      await submit(c, s);
    }
    await rpc('curator_finish_season', [SECRET, 'Сезон 2']);
    const winners = await rpc<any[]>('curator_winners', [SECRET]);
    expect(winners.map((w) => [w.place, w.player_name, w.verification_code, w.score])).toEqual([
      [1, 'Аня', 'EZ-AAAA', 900],
      [2, 'Маша', 'EZ-CCCC', 800],
      [3, 'Петя', 'EZ-BBBB', 700],
    ]);
    expect(winners[0].season_title).toBe('Сезон 1');
    expect(await rpc('get_season_info')).toMatchObject({ title: 'Сезон 2', ends_at: null, is_closed: false });
    expect((await db.query('select * from public.leaderboard')).rows).toHaveLength(0);
    expect(await rpc('get_my_standing', ['EZ-AAAA'])).toMatchObject({ season_total: 0, rank: null });
    expect(await submit('EZ-AAAA', 100)).toMatchObject({ counted: 100, season_total: 100, rank: 1 });
  });
});
