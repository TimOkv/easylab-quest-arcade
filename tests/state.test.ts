import { describe, it, expect, vi } from 'vitest';
import { createInitialState, createStore, loadState, SAVE_KEY, CORRUPT_KEY } from '../src/core/state';
import type { KeyValueStorage } from '../src/core/types';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  setCalls = 0;
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.setCalls++; this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

class ThrowingStorage implements KeyValueStorage {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
  removeItem(): void { throw new Error('SecurityError'); }
}

/** Фейковый window для событий storage. */
function fakeWindow() {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    fire(key: string, newValue: string | null) {
      const ev = new Event('storage') as Event & { key: string; newValue: string | null };
      Object.assign(ev, { key, newValue });
      target.dispatchEvent(ev);
    },
  };
}

const clock = () => { let t = 1_000; return () => (t += 10); };

describe('createInitialState', () => {
  it('форма §4.1 + §2', () => {
    const s = createInitialState(123, 'sess-1');
    expect(s.meta).toMatchObject({ version: '1.0.0', sessionId: 'sess-1', createdAt: 123, updatedAt: 123, theme: 'dark', platformStudentId: null });
    expect(s.navigation).toEqual({ currentScreen: 'quest', currentRoomIndex: 1, isAudioMuted: false });
    expect(s.quest).toMatchObject({ totalCoinsEarned: 0, maxPossibleCoins: 75, isCompleted: false, completedAt: null, verificationCode: null, isSyncedWithCurator: false, syncAttempts: 0, lastSyncError: null });
    expect(s.quest.rooms[1]).toEqual({ id: 'room_variables', title: 'Рабочее место', maxReward: 10, earnedCoins: 0, isSolved: false, attempts: 0, hintsUsed: 0 });
    expect(s.quest.rooms[4]).toMatchObject({ id: 'room_functions', maxReward: 30 });
    expect(s.arcade).toEqual({ isUnlocked: false, highScore: 0, totalRunsPlayed: 0, bestHeightPx: 0, lastRun: null });
    expect(s.leaderboard).toMatchObject({ playerName: '', hasSubmittedScore: false, currentRank: null, isTop3Winner: false, cachedTop: null, isHidden: false });
  });

  it('дневной лимит очков по умолчанию — 3000 (G09, история 60)', () => {
    expect(createInitialState(1, 's').leaderboard.dailyLimit).toBe(3000);
    const store = createStore({ storage: new FakeStorage(), now: clock(), win: null });
    expect(store.get().leaderboard.dailyLimit).toBe(3000);
  });
});

describe('createStore — сохранение ezq_save_v1', () => {
  it('пишет на каждый update и переживает «перезагрузку»', () => {
    const storage = new FakeStorage();
    const a = createStore({ storage, now: clock(), win: null });
    a.update((s) => { s.navigation.currentRoomIndex = 2; s.quest.rooms[1].attempts = 3; });
    const before = storage.setCalls;
    a.update((s) => { s.quest.rooms[1].earnedCoins = 5; s.quest.totalCoinsEarned = 5; });
    expect(storage.setCalls).toBe(before + 1);
    a.update((s) => { s.arcade.highScore = 999; });

    const b = createStore({ storage, now: clock(), win: null });
    expect(b.get().navigation.currentRoomIndex).toBe(2);
    expect(b.get().quest.rooms[1]).toMatchObject({ attempts: 3, earnedCoins: 5 });
    expect(b.get().arcade.highScore).toBe(999);
    expect(b.get().meta.sessionId).toBe(a.get().meta.sessionId);
  });

  it('update обновляет updatedAt и оповещает подписчиков; unsubscribe работает', () => {
    const store = createStore({ storage: new FakeStorage(), now: clock(), win: null });
    const fn = vi.fn();
    const off = store.subscribe(fn);
    const t0 = store.get().meta.updatedAt;
    store.update((s) => { s.navigation.isAudioMuted = true; });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].navigation.isAudioMuted).toBe(true);
    expect(store.get().meta.updatedAt).toBeGreaterThan(t0);
    off();
    store.update((s) => { s.navigation.isAudioMuted = false; });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('get() не даёт мутировать состояние в обход update', () => {
    const storage = new FakeStorage();
    const store = createStore({ storage, now: clock(), win: null });
    const snap = store.get();
    try { (snap.quest as { totalCoinsEarned: number }).totalCoinsEarned = 70; } catch { /* frozen */ }
    expect(store.get().quest.totalCoinsEarned).toBe(0);
  });

  it('replace пишет и оповещает', () => {
    const storage = new FakeStorage();
    const store = createStore({ storage, now: clock(), win: null });
    const next = createInitialState(5, 'other');
    next.quest.isCompleted = true;
    store.replace(next);
    expect(store.get().meta.sessionId).toBe('other');
    expect(loadState(storage)?.quest.isCompleted).toBe(true);
  });

  it('хранилище бросает → работает в памяти, не падает', () => {
    const store = createStore({ storage: new ThrowingStorage(), now: clock(), win: null });
    expect(() => store.update((s) => { s.quest.totalCoinsEarned = 10; })).not.toThrow();
    expect(store.get().quest.totalCoinsEarned).toBe(10);
  });

  it('хранилище недоступно вовсе (null) → память', () => {
    const store = createStore({ storage: null, now: clock(), win: null });
    store.update((s) => { s.arcade.highScore = 3; });
    expect(store.get().arcade.highScore).toBe(3);
  });

  it('битый JSON → копия в ezq_save_v1_corrupt, новое состояние', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, '{oops');
    const store = createStore({ storage, now: clock(), win: null });
    expect(storage.getItem(CORRUPT_KEY)).toBe('{oops');
    expect(store.get().quest.isCompleted).toBe(false);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).meta.version).toBe('1.0.0');
  });

  it('неверная форма → резерв и новое состояние', () => {
    const storage = new FakeStorage();
    const bad = JSON.stringify({ meta: { version: '1.0.0' }, quest: { isCompleted: 'yes' } });
    storage.setItem(SAVE_KEY, bad);
    expect(loadState(storage)).toBeNull();
    expect(storage.getItem(CORRUPT_KEY)).toBe(bad);
  });

  it('старое сохранение без аддитивных полей §2 дополняется значениями по умолчанию', () => {
    const storage = new FakeStorage();
    const s = createInitialState(1, 'legacy') as unknown as Record<string, any>;
    delete s.meta.theme;
    delete s.arcade.bestHeightPx;
    delete s.quest.rooms[2].hintsUsed;
    s.quest.rooms[2].attempts = 4;
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    const loaded = loadState(storage)!;
    expect(loaded.meta.theme).toBe('dark');
    expect(loaded.arcade.bestHeightPx).toBe(0);
    expect(loaded.quest.rooms[2]).toMatchObject({ hintsUsed: 0, attempts: 4 });
  });

  it('событие storage перечитывает состояние (квест завершён в другой вкладке)', () => {
    const storage = new FakeStorage();
    const win = fakeWindow();
    const store = createStore({ storage, now: clock(), win });
    const fn = vi.fn();
    store.subscribe(fn);
    const other = JSON.parse(JSON.stringify(store.get()));
    other.quest.isCompleted = true;
    other.quest.verificationCode = 'EZ-8492';
    storage.map.set(SAVE_KEY, JSON.stringify(other));
    win.fire(SAVE_KEY, JSON.stringify(other));
    expect(store.get().quest.isCompleted).toBe(true);
    expect(store.get().quest.verificationCode).toBe('EZ-8492');
    expect(fn).toHaveBeenCalled();
    expect(fn.mock.calls.at(-1)?.[2]).toBe('external');
    win.fire('some_other_key', '{}');
    win.fire(SAVE_KEY, '{broken');
    expect(store.get().quest.isCompleted).toBe(true);
  });

  it('устаревшая вкладка не может «раззавершить» квест своей записью', () => {
    const storage = new FakeStorage();
    const stale = createStore({ storage, now: clock(), win: null });
    const done = JSON.parse(JSON.stringify(stale.get()));
    done.quest.isCompleted = true;
    done.quest.verificationCode = 'EZ-8492';
    storage.map.set(SAVE_KEY, JSON.stringify(done)); // другая вкладка без события
    stale.update((s) => { s.navigation.isAudioMuted = true; });
    expect(loadState(storage)?.quest.isCompleted).toBe(true);
    expect(stale.get().quest.verificationCode).toBe('EZ-8492');
    expect(stale.get().navigation.isAudioMuted).toBe(true);
  });
});
