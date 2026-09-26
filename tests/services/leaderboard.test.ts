import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLeaderboardService, PENDING_KEY } from '../../src/services/leaderboard';
import { NetworkError } from '../../src/services/rest';
import type { RunResult } from '../../src/core/types';
import { FakeStorage, fakeServer, rpcError, demoRest, makeStore, type Handler } from './helpers';

afterEach(() => vi.useRealTimers());

let seq = 0;
const run = (score: number, durationSeconds = 100, extra: Partial<RunResult> = {}): RunResult => ({
  runId: crypto.randomUUID(), score, durationSeconds, jumpsCount: 12, seed: ++seq, heightPx: score * 10, isNewRecord: false, ...extra,
});

const standing = (over: object = {}) => ({
  counted: 400, season_total: 1400, today_counted: 900, daily_limit: 3000, rank: 2, gap_to_top10: null,
  is_hidden: false, season_ends_at: null, season_closed: false, ...over,
});

function setup(submit: Handler, patch?: Parameters<typeof makeStore>[0]) {
  const srv = fakeServer({ submit_arcade_score: submit });
  const store = makeStore((d) => { d.quest.isSyncedWithCurator = true; d.meta.platformStudentId = 'st-1'; patch?.(d); });
  const storage = new FakeStorage();
  const svc = createLeaderboardService(srv.rest, store, storage, { win: null });
  return { srv, store, storage, svc, sent: () => srv.rpcCalls('submit_arcade_score') };
}

describe('leaderboard: демо-режим', () => {
  it('без сервера — demo, пустой ТОП, ни одной выдуманной строки', async () => {
    const store = makeStore();
    const svc = createLeaderboardService(demoRest(), store, new FakeStorage(), { win: null });
    expect(svc.isConfigured).toBe(false);
    expect(await svc.submitRun(run(400))).toEqual({ kind: 'demo' });
    expect(await svc.fetchTop()).toEqual([]);
    expect(await svc.fetchStanding()).toBeNull();
    expect(await svc.fetchSeason()).toBeNull();
    expect(svc.pendingCount()).toBe(0);
  });
});

describe('leaderboard.submitRun', () => {
  it('засчитанный забег: аргументы RPC, исход и обновление store', async () => {
    const { svc, store, sent } = setup(() => ({ body: standing() }));
    const r = run(400, 100.7);
    const out = await svc.submitRun(r);
    expect(out).toEqual({ kind: 'counted', counted: 400, seasonTotal: 1400, todayCounted: 900, dailyLimit: 3000, rank: 2, gapToTop10: null, seasonClosed: false, isHidden: false });
    expect(sent()[0].args).toEqual({
      p_run_id: r.runId, p_code: 'EZ-AB2C', p_session_id: 'sess-test', p_student_id: 'st-1',
      p_player_name: 'Аня', p_score: 400, p_time_spent: 100, p_jumps: 12,
    });
    expect(store.get().leaderboard).toMatchObject({ seasonTotal: 1400, todayCounted: 900, dailyLimit: 3000, currentRank: 2, isTop3Winner: true, isHidden: false, hasSubmittedScore: true, lastSubmittedScore: 400 });
    expect(svc.pendingCount()).toBe(0);
  });

  it('клиентский античит: скорость, короткий забег, диапазон, нет квеста, битый код — без сети и без очереди', async () => {
    const { svc, sent } = setup(() => ({ body: standing() }));
    expect(await svc.submitRun(run(1300, 10))).toEqual({ kind: 'rejected', reason: 'CHEAT_SPEED' });
    expect(await svc.submitRun(run(10, 4))).toEqual({ kind: 'rejected', reason: 'TOO_SHORT' });
    expect(await svc.submitRun(run(60_000, 1000))).toEqual({ kind: 'rejected', reason: 'SCORE_RANGE' });
    // время уходит на сервер целыми секундами (floor), проверка — по тому же числу: 599/5 = 119,8 — можно
    expect((await svc.submitRun(run(599, 5.9))).kind).toBe('counted');
    expect(await svc.submitRun(run(700, 5.9))).toEqual({ kind: 'rejected', reason: 'CHEAT_SPEED' }); // 700/5 = 140
    expect(sent()).toHaveLength(1);
    expect(svc.pendingCount()).toBe(0);

    const noQuest = setup(() => ({ body: standing() }), (d) => { d.quest.isCompleted = false; });
    expect(await noQuest.svc.submitRun(run(400))).toEqual({ kind: 'rejected', reason: 'NO_QUEST' });
    const badCode = setup(() => ({ body: standing() }), (d) => { d.quest.verificationCode = 'EZ-0000'; });
    expect(await badCode.svc.submitRun(run(400))).toEqual({ kind: 'rejected', reason: 'BAD_CODE' });
    expect(noQuest.sent().length + badCode.sent().length).toBe(0);
  });

  it('нет сети → queued в ezq_pending_scores_v1, потом flushQueue отправляет тот же run_id один раз', async () => {
    let down = true;
    const { svc, storage, sent } = setup(() => (down ? { networkDown: true } : { body: standing() }));
    const r = run(400);
    expect(await svc.submitRun(r)).toEqual({ kind: 'queued' });
    expect(PENDING_KEY).toBe('ezq_pending_scores_v1');
    expect(JSON.parse(storage.getItem(PENDING_KEY)!)).toHaveLength(1);
    expect(svc.pendingCount()).toBe(1);
    down = false;
    await svc.flushQueue();
    await svc.flushQueue();
    expect(svc.pendingCount()).toBe(0);
    const ids = sent().map((c) => c.args.p_run_id);
    expect(ids).toEqual([r.runId, r.runId]); // 1 неудачная + 1 успешная
  });

  it('повторная отправка того же забега не дублирует очередь; не-uuid runId заменяется на uuid', async () => {
    const { svc, sent } = setup(() => ({ networkDown: true }));
    const r = run(400, 100, { runId: 'run-7' });
    await svc.submitRun(r);
    await svc.submitRun(r);
    expect(svc.pendingCount()).toBe(1);
    const ids = new Set(sent().map((c) => c.args.p_run_id));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('окончательный отказ сервера удаляется из очереди', async () => {
    const { svc } = setup(() => rpcError('NO_QUEST'));
    expect(await svc.submitRun(run(400))).toEqual({ kind: 'rejected', reason: 'NO_QUEST' });
    expect(svc.pendingCount()).toBe(0);
  });

  it('BAD_NAME держится в очереди до смены ника, затем уходит', async () => {
    const names: string[] = [];
    const { svc, store, sent } = setup((a) => { names.push(a.p_player_name); return a.p_player_name === 'Аня' ? rpcError('BAD_NAME') : { body: standing() }; });
    expect(await svc.submitRun(run(400))).toEqual({ kind: 'rejected', reason: 'BAD_NAME' });
    expect(svc.pendingCount()).toBe(1);
    await svc.flushQueue();
    expect(sent()).toHaveLength(1); // тот же ник — не отправляем
    store.update((d) => { d.leaderboard.playerName = 'Анна'; });
    await svc.flushQueue();
    expect(svc.pendingCount()).toBe(0);
    expect(names).toEqual(['Аня', 'Анна']);
  });

  it('очередь не больше 50 записей — старейшие вытесняются', async () => {
    const { svc, storage } = setup(() => ({ networkDown: true }));
    const runs = Array.from({ length: 55 }, () => run(100));
    for (const r of runs) await svc.submitRun(r);
    expect(svc.pendingCount()).toBe(50);
    const ids = JSON.parse(storage.getItem(PENDING_KEY)!).map((x: any) => x.runId);
    expect(ids).not.toContain(runs[0].runId);
    expect(ids).toContain(runs[54].runId);
  });

  it('квест ещё не зарегистрирован у куратора → сначала syncNow, иначе ждём в очереди', async () => {
    const srv = fakeServer({ submit_arcade_score: () => ({ body: standing() }) });
    const store = makeStore((d) => { d.quest.isSyncedWithCurator = false; });
    const curator = { syncNow: vi.fn(async () => 'pending' as const) };
    const svc = createLeaderboardService(srv.rest, store, new FakeStorage(), { win: null, curator });
    expect(await svc.submitRun(run(400))).toEqual({ kind: 'queued' });
    expect(srv.rpcCalls('submit_arcade_score')).toHaveLength(0);
    curator.syncNow.mockImplementation(async () => { store.update((d) => { d.quest.isSyncedWithCurator = true; }); return 'synced' as never; });
    await svc.flushQueue();
    expect(srv.rpcCalls('submit_arcade_score')).toHaveLength(1);
    expect(svc.pendingCount()).toBe(0);
  });

  it('startRetryLoop: сеть вернулась по online — очередь уходит; при сбоях backoff', async () => {
    vi.useFakeTimers();
    let down = true;
    const srv = fakeServer({ submit_arcade_score: () => (down ? { networkDown: true } : { body: standing() }) });
    const store = makeStore((d) => { d.quest.isSyncedWithCurator = true; });
    const win = new EventTarget();
    const svc = createLeaderboardService(srv.rest, store, new FakeStorage(), { win });
    await svc.submitRun(run(400)); // 1-я попытка
    const stop = svc.startRetryLoop();
    const n = () => srv.rpcCalls('submit_arcade_score').length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(n()).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(n()).toBe(2); // backoff записи: следующая не раньше чем через 60 с
    down = false;
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(n()).toBe(3);
    expect(svc.pendingCount()).toBe(0);
    stop();
  });
});

describe('leaderboard: чтение', () => {
  it('fetchTop: GET ТОП-10 буквально, строки в PublicRow и кэш в store', async () => {
    const srv = fakeServer({
      leaderboard: () => ({ body: [{ player_name: '<img src=x>', score: 900, created_at: '2026-09-26T10:00:00Z', runs_count: 3 }] }),
    });
    const store = makeStore();
    const svc = createLeaderboardService(srv.rest, store, new FakeStorage(), { win: null });
    const rows = await svc.fetchTop();
    expect(srv.calls[0].path).toBe('leaderboard?order=score.desc,created_at.asc&limit=10');
    expect(rows).toEqual([{ playerName: '<img src=x>', score: 900, createdAt: '2026-09-26T10:00:00Z', runsCount: 3 }]);
    expect(store.get().leaderboard.cachedTop?.rows).toEqual(rows);
  });

  it('fetchTop без сети бросает NetworkError, кэш сохраняется', async () => {
    const srv = fakeServer({ leaderboard: () => ({ networkDown: true }) });
    const store = makeStore((d) => { d.leaderboard.cachedTop = { rows: [{ playerName: 'A', score: 1, createdAt: 'x', runsCount: 1 }], fetchedAt: 1 }; });
    await expect(createLeaderboardService(srv.rest, store, new FakeStorage(), { win: null }).fetchTop()).rejects.toBeInstanceOf(NetworkError);
    expect(store.get().leaderboard.cachedTop?.rows).toHaveLength(1);
  });

  it('fetchStanding и fetchSeason: разбор и store', async () => {
    const srv = fakeServer({
      get_my_standing: (a) => ({ body: a.p_code === 'EZ-AB2C' ? standing({ rank: 47, season_total: 3420, gap_to_top10: 1280, today_counted: 1200, daily_limit: 2500, is_hidden: false }) : null }),
      get_season_info: () => ({ body: { title: 'Сезон 1', ends_at: '2026-10-01T12:00:00Z', daily_limit: 2500, is_closed: false } }),
    });
    const store = makeStore();
    const svc = createLeaderboardService(srv.rest, store, new FakeStorage(), { win: null });
    expect(await svc.fetchStanding()).toEqual({ rank: 47, seasonTotal: 3420, gapToTop10: 1280, todayCounted: 1200, dailyLimit: 2500, isHidden: false });
    expect(store.get().leaderboard).toMatchObject({ currentRank: 47, isTop3Winner: false, seasonTotal: 3420, todayCounted: 1200, dailyLimit: 2500 });
    expect(await svc.fetchSeason()).toEqual({ title: 'Сезон 1', endsAt: '2026-10-01T12:00:00Z', dailyLimit: 2500, isClosed: false });
  });
});
