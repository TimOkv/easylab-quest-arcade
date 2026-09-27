import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCuratorSync } from '../../src/services/curator';
import { fakeServer, rpcError, demoRest, makeStore } from './helpers';

afterEach(() => vi.useRealTimers());

const okRegister = (args: any) => ({
  body: { verification_code: args.p_code, coins_earned: args.p_coins, completed_at: args.p_completed_at, restored: false },
});

describe('createCuratorSync.syncNow', () => {
  it('демо-режим → "demo", без сети', async () => {
    const store = makeStore();
    expect(await createCuratorSync(demoRest(), store).syncNow()).toBe('demo');
    expect(store.get().quest.isSyncedWithCurator).toBe(false);
  });

  it('отправляет точные монеты, код, имя, student_id и время финиша; ставит isSyncedWithCurator', async () => {
    const srv = fakeServer({ register_quest_completion: okRegister });
    const store = makeStore((d) => { d.meta.platformStudentId = 'st-42'; });
    const sync = createCuratorSync(srv.rest, store);
    expect(sync.isConfigured).toBe(true);
    expect(await sync.syncNow()).toBe('synced');
    expect(srv.rpcCalls('register_quest_completion')[0].args).toEqual({
      p_code: 'EZ-AB2C', p_player_name: 'Аня', p_student_id: 'st-42', p_coins: 58,
      p_completed_at: new Date(1_699_000_000_000).toISOString(),
    });
    expect(store.get().quest).toMatchObject({ isSyncedWithCurator: true, lastSyncError: null });
    // уже синхронизировано — повторно не шлёт
    expect(await sync.syncNow()).toBe('synced');
    expect(srv.rpcCalls('register_quest_completion')).toHaveLength(1);
  });

  it('квест не завершён → "pending", ничего не шлёт', async () => {
    const srv = fakeServer({ register_quest_completion: okRegister });
    const store = makeStore((d) => { d.quest.isCompleted = false; d.quest.verificationCode = null; });
    expect(await createCuratorSync(srv.rest, store).syncNow()).toBe('pending');
    expect(srv.calls).toHaveLength(0);
  });

  it('CODE_TAKEN → новый код, store и колбэк обновлены, повтор с новым кодом', async () => {
    let n = 0;
    const srv = fakeServer({ register_quest_completion: (a) => (n++ < 2 ? rpcError('CODE_TAKEN') : okRegister(a)) });
    const store = makeStore();
    const onCodeChanged = vi.fn();
    expect(await createCuratorSync(srv.rest, store, { onCodeChanged }).syncNow()).toBe('synced');
    const codes = srv.rpcCalls('register_quest_completion').map((c) => c.args.p_code);
    expect(codes).toHaveLength(3);
    expect(codes[0]).toBe('EZ-AB2C');
    expect(new Set(codes).size).toBe(3);
    for (const c of codes) expect(c).toMatch(/^EZ-[2-9A-HJ-NP-Z]{4}$/);
    expect(store.get().quest.verificationCode).toBe(codes[2]);
    expect(onCodeChanged).toHaveBeenLastCalledWith(codes[2]);
  });

  it('CODE_TAKEN больше 5 перевыпусков → "pending" с ошибкой', async () => {
    const srv = fakeServer({ register_quest_completion: () => rpcError('CODE_TAKEN') });
    const store = makeStore();
    expect(await createCuratorSync(srv.rest, store).syncNow()).toBe('pending');
    expect(srv.rpcCalls('register_quest_completion')).toHaveLength(6); // исходный + 5 новых
    expect(store.get().quest).toMatchObject({ isSyncedWithCurator: false, lastSyncError: 'CODE_TAKEN' });
  });

  it('restored=true → принимает серверные код и монеты', async () => {
    const srv = fakeServer({
      register_quest_completion: () => ({ body: { verification_code: 'EZ-ZZZZ', coins_earned: 40, completed_at: '2023-11-01T10:00:00.000Z', restored: true } }),
    });
    const store = makeStore((d) => { d.meta.platformStudentId = 'st-1'; });
    const onCodeChanged = vi.fn();
    expect(await createCuratorSync(srv.rest, store, { onCodeChanged }).syncNow()).toBe('synced');
    expect(store.get().quest).toMatchObject({ verificationCode: 'EZ-ZZZZ', totalCoinsEarned: 40, isSyncedWithCurator: true, completedAt: Date.parse('2023-11-01T10:00:00.000Z') });
    expect(onCodeChanged).toHaveBeenCalledWith('EZ-ZZZZ');
  });

  it('restored=true с coins_max → максимум из записи сервера', async () => {
    const srv = fakeServer({
      register_quest_completion: () => ({ body: { verification_code: 'EZ-ZZZZ', coins_earned: 70, coins_max: 75, completed_at: '2023-11-01T10:00:00.000Z', restored: true } }),
    });
    const store = makeStore((d) => { d.meta.platformStudentId = 'st-1'; d.quest.maxPossibleCoins = 150; });
    expect(await createCuratorSync(srv.rest, store).syncNow()).toBe('synced');
    expect(store.get().quest).toMatchObject({ totalCoinsEarned: 70, maxPossibleCoins: 75 });
  });

  it('restored=false, но сервер выдал другой код (присланный занят) → код из ответа в store и колбэке', async () => {
    const srv = fakeServer({
      register_quest_completion: (a) => ({ body: { verification_code: 'EZ-Q7RT', coins_earned: a.p_coins, completed_at: a.p_completed_at, restored: false } }),
    });
    const store = makeStore();
    const onCodeChanged = vi.fn();
    expect(await createCuratorSync(srv.rest, store, { onCodeChanged }).syncNow()).toBe('synced');
    expect(store.get().quest).toMatchObject({ verificationCode: 'EZ-Q7RT', totalCoinsEarned: 58, isSyncedWithCurator: true });
    expect(onCodeChanged).toHaveBeenCalledWith('EZ-Q7RT');
    expect(srv.rpcCalls('register_quest_completion')).toHaveLength(1);
  });

  it('нет сети → "pending", попытка учтена', async () => {
    const srv = fakeServer({ register_quest_completion: () => ({ networkDown: true }) });
    const store = makeStore();
    expect(await createCuratorSync(srv.rest, store).syncNow()).toBe('pending');
    expect(store.get().quest).toMatchObject({ isSyncedWithCurator: false, syncAttempts: 1, lastSyncError: 'NETWORK' });
  });
});

describe('createCuratorSync.restoreByStudent', () => {
  it.each([
    [{ coins_max: 150, coins_earned: 70 }, 150],
    [{ coins_max: 75, coins_earned: 70 }, 75],
    [{ coins_earned: 120 }, 150], // ответ старого сервера, но монет больше 75 — новый квест
  ])('максимум из ответа: %j → %i', async (extra, expected) => {
    const srv = fakeServer({
      restore_by_student: () => ({ body: { verification_code: 'EZ-KKKK', player_name: 'Петя', completed_at: '2026-09-20T09:00:00Z', ...extra } }),
    });
    const store = makeStore((d) => { d.quest.isCompleted = false; d.quest.verificationCode = null; d.quest.completedAt = null; });
    expect(await createCuratorSync(srv.rest, store).restoreByStudent('st-9')).toBe(true);
    expect(store.get().quest).toMatchObject({ maxPossibleCoins: expected, totalCoinsEarned: extra.coins_earned });
  });

  it('найдено на сервере → квест завершён с серверными кодом/монетами, аркада открыта', async () => {
    const srv = fakeServer({
      restore_by_student: (a) => ({ body: a.p_student_id === 'st-9' ? { verification_code: 'EZ-KKKK', coins_earned: 65, player_name: 'Петя', completed_at: '2026-09-20T09:00:00Z' } : null }),
    });
    const store = makeStore((d) => {
      d.quest.isCompleted = false; d.quest.verificationCode = null; d.quest.completedAt = null; d.quest.totalCoinsEarned = 10;
      d.arcade.isUnlocked = false; d.leaderboard.playerName = '';
    });
    const sync = createCuratorSync(srv.rest, store);
    expect(await sync.restoreByStudent('nobody')).toBe(false);
    expect(store.get().quest.isCompleted).toBe(false);
    expect(await sync.restoreByStudent('st-9')).toBe(true);
    const s = store.get();
    expect(s.quest).toMatchObject({ isCompleted: true, verificationCode: 'EZ-KKKK', totalCoinsEarned: 65, isSyncedWithCurator: true, completedAt: Date.parse('2026-09-20T09:00:00Z') });
    expect(s.quest.maxPossibleCoins).toBe(75); // старый сервер без coins_max, монет ≤ 75 → прохождение старого квеста
    expect(s.arcade.isUnlocked).toBe(true);
    expect(s.leaderboard.playerName).toBe('Петя');
    expect(s.meta.platformStudentId).toBe('st-9');
  });

  it('локальный квест уже завершён или демо → false без запроса', async () => {
    const srv = fakeServer({ restore_by_student: () => ({ body: null }) });
    expect(await createCuratorSync(srv.rest, makeStore()).restoreByStudent('st-1')).toBe(false);
    expect(srv.calls).toHaveLength(0);
    expect(await createCuratorSync(demoRest(), makeStore((d) => { d.quest.isCompleted = false; })).restoreByStudent('st-1')).toBe(false);
  });
});

describe('createCuratorSync.startRetryLoop', () => {
  it('повторяет каждые 30 с с backoff до 5 мин, по online — сразу, после успеха — стоп', async () => {
    vi.useFakeTimers();
    let down = true;
    const srv = fakeServer({ register_quest_completion: (a) => (down ? { networkDown: true } : okRegister(a)) });
    const store = makeStore();
    const win = new EventTarget();
    const stop = createCuratorSync(srv.rest, store, { win }).startRetryLoop();
    const count = () => srv.rpcCalls('register_quest_completion').length;
    await vi.advanceTimersByTimeAsync(0);
    expect(count()).toBe(1); // сразу при старте
    await vi.advanceTimersByTimeAsync(30_000);
    expect(count()).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(count()).toBe(2); // backoff: следующая через 60 с
    await vi.advanceTimersByTimeAsync(30_000);
    expect(count()).toBe(3);
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    const before = count();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(count() - before).toBe(1); // потолок 5 мин
    down = false;
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get().quest.isSyncedWithCurator).toBe(true);
    const done = count();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(count()).toBe(done);
    stop();
  });

  it('финиш квеста при работающем цикле → отправка сразу', async () => {
    vi.useFakeTimers();
    const srv = fakeServer({ register_quest_completion: okRegister });
    const store = makeStore((d) => { d.quest.isCompleted = false; d.quest.verificationCode = null; });
    const stop = createCuratorSync(srv.rest, store, { win: new EventTarget() }).startRetryLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(srv.calls).toHaveLength(0);
    store.update((d) => { d.quest.isCompleted = true; d.quest.verificationCode = 'EZ-QQQQ'; d.quest.completedAt = Date.now(); });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get().quest.isSyncedWithCurator).toBe(true);
    stop();
  });
});

describe('createCuratorSync — безнадёжные отказы', () => {
  it.each(['BAD_NAME', 'BAD_COINS'])('%s не повторяется в цикле; код и монеты остаются локально', async (code) => {
    vi.useFakeTimers();
    const srv = fakeServer({ register_quest_completion: () => rpcError(`${code}: rejected`) });
    const store = makeStore();
    const sync = createCuratorSync(srv.rest, store, { win: new EventTarget() });
    const stop = sync.startRetryLoop();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4 * 30_000 + 60_000 + 120_000);
    expect(await sync.syncNow()).toBe('pending'); // и прямой вызов (из рейтинга) не долбит сервер
    expect(srv.rpcCalls('register_quest_completion')).toHaveLength(1);
    expect(store.get().quest).toMatchObject({ verificationCode: 'EZ-AB2C', totalCoinsEarned: 58, isCompleted: true, lastSyncError: code });
    stop();
  });

  it('BAD_NAME: после смены ника регистрация уходит снова', async () => {
    vi.useFakeTimers();
    const srv = fakeServer({ register_quest_completion: (a) => (a.p_player_name === 'Аня' ? rpcError('BAD_NAME') : okRegister(a)) });
    const store = makeStore();
    const stop = createCuratorSync(srv.rest, store, { win: new EventTarget() }).startRetryLoop();
    await vi.advanceTimersByTimeAsync(0);
    store.update((d) => { d.leaderboard.playerName = 'Котлета'; });
    await vi.advanceTimersByTimeAsync(0);
    expect(srv.rpcCalls('register_quest_completion')).toHaveLength(2);
    expect(store.get().quest.isSyncedWithCurator).toBe(true);
    stop();
  });
});
