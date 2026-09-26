import { describe, it, expect, vi } from 'vitest';
import { createStore, SAVE_KEY } from '../src/core/state';
import type { KeyValueStorage, RoomIndex } from '../src/core/types';
import { createQuestController } from '../src/quest/controller';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

// Верные и неверные ответы — из «Решений §4».
const RIGHT: Record<RoomIndex, unknown> = {
  1: { name: 'murzik', age: 'num12', likes: 'true' },
  2: 'else',
  3: ['for_0_lt5', 'put', 'close'],
  4: ['runMission', 'lparen', 'str_arcade', 'rparen'],
};
const WRONG: Record<RoomIndex, unknown> = {
  1: { name: 'murzik', age: 'str12', likes: 'true' },
  2: 'if',
  3: ['for_0_le5', 'put', 'close'],
  4: ['runMission', 'lparen', 'bare_arcade', 'rparen'],
};

const NOW = 1_790_000_000_000;

function setup(storage = new FakeStorage()) {
  const store = createStore({ storage, now: () => NOW, win: null, newSessionId: () => 'sess-1' });
  const onCompleted = vi.fn();
  const ctl = createQuestController(store, { onCompleted, now: () => NOW });
  return { storage, store, ctl, onCompleted };
}

describe('quest/controller', () => {
  it('всё с первой попытки → 75 монет, атомарное завершение с кодом и разблокировкой аркады', () => {
    const { store, ctl, onCompleted } = setup();
    expect(ctl.startQuest('Тимофей')).toMatchObject({ ok: true });
    const rewards: number[] = [];
    for (const n of [1, 2, 3, 4] as const) {
      const r = ctl.submit(n, RIGHT[n]);
      expect(r.correct).toBe(true);
      rewards.push(r.reward!);
      if (n < 4) expect(ctl.advance()).toBe(true);
    }
    expect(rewards).toEqual([10, 15, 20, 30]);
    const s = store.get();
    expect(s.quest.totalCoinsEarned).toBe(75);
    expect(s.quest.isCompleted).toBe(true);
    expect(s.quest.completedAt).toBe(NOW);
    expect(s.quest.verificationCode).toMatch(/^EZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    expect(s.arcade.isUnlocked).toBe(true);
    expect(s.leaderboard.playerName).toBe('Тимофей');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('подписчик ни разу не видит завершение без кода, времени и разблокировки; верная попытка сохраняется', () => {
    const { store, ctl } = setup();
    const seen: { completed: boolean; code: string | null; at: number | null; unlocked: boolean }[] = [];
    store.subscribe((s) => {
      seen.push({ completed: s.quest.isCompleted, code: s.quest.verificationCode, at: s.quest.completedAt, unlocked: s.arcade.isUnlocked });
    });
    for (const n of [1, 2, 3] as const) {
      ctl.submit(n, RIGHT[n]);
      ctl.advance();
    }
    expect(ctl.submit(4, RIGHT[4]).correct).toBe(true);
    expect(store.get().quest.rooms[4].attempts).toBe(1); // верная попытка тоже записана
    const done = seen.filter((x) => x.completed);
    expect(done.length).toBeGreaterThan(0);
    for (const x of done) {
      expect(x.code).toMatch(/^EZ-/);
      expect(x.at).toBe(NOW);
      expect(x.unlocked).toBe(true);
    }
  });

  it('минимум без второй подсказки: по две ошибки в каждой комнате → 5+8+10+15 = 38', () => {
    const { store, ctl } = setup();
    for (const n of [1, 2, 3, 4] as const) {
      expect(ctl.submit(n, WRONG[n]).correct).toBe(false);
      ctl.submit(n, WRONG[n]);
      expect(ctl.submit(n, RIGHT[n]).reward).toBe([5, 8, 10, 15][n - 1]);
      ctl.advance();
    }
    expect(store.get().quest.totalCoinsEarned).toBe(38);
    expect(store.get().quest.rooms[3].attempts).toBe(3);
  });

  it('неверный ответ возвращает код ошибки и объяснение', () => {
    const { ctl } = setup();
    const r = ctl.submit(1, WRONG[1]);
    expect(r).toMatchObject({ correct: false, mistake: 'QUOTED_NUMBER' });
    expect(r.message).toBeTruthy();
  });

  it('подсказка 1 — только после ошибки; подсказка 2 — повторным нажатием, и монет за комнату 0', () => {
    const { store, ctl } = setup();
    expect(ctl.canUseHint(1, 1)).toBe(false);
    expect(ctl.useHint(1)).toBeNull();
    expect(store.get().quest.rooms[1].hintsUsed).toBe(0);

    ctl.submit(1, WRONG[1]);
    expect(ctl.canUseHint(1, 1)).toBe(true);
    expect(ctl.canUseHint(1, 2)).toBe(false);
    expect(ctl.useHint(1)).toMatch(/кавычк/i);
    expect(store.get().quest.rooms[1].hintsUsed).toBe(1);
    expect(ctl.currentReward(1)).toBe(7); // первая подсказка бесплатна

    expect(ctl.canUseHint(1, 2)).toBe(true);
    expect(ctl.useHint(1)).toMatch(/"12"/);
    expect(store.get().quest.rooms[1].hintsUsed).toBe(2);
    expect(ctl.currentReward(1)).toBe(0);
    expect(ctl.canUseHint(1, 2)).toBe(false);

    expect(ctl.submit(1, RIGHT[1])).toMatchObject({ correct: true, reward: 0 });
    expect(store.get().quest.rooms[1].earnedCoins).toBe(0);
  });

  it('«Сейчас за верный ответ» падает по таблице и не уходит ниже третьей колонки', () => {
    const { ctl } = setup();
    expect(ctl.currentReward(1)).toBe(10);
    ctl.submit(1, WRONG[1]);
    expect(ctl.currentReward(1)).toBe(7);
    ctl.submit(1, WRONG[1]);
    ctl.submit(1, WRONG[1]);
    ctl.submit(1, WRONG[1]);
    expect(ctl.currentReward(1)).toBe(5);
  });

  it('попытка сохраняется до показа результата: перезагрузка между попытками её не обнуляет', () => {
    const first = setup();
    first.ctl.submit(1, RIGHT[1]);
    first.ctl.advance();
    first.ctl.submit(2, WRONG[2]);
    expect(JSON.parse(first.storage.getItem(SAVE_KEY)!).quest.rooms[2].attempts).toBe(1);

    const again = setup(first.storage); // «перезагрузка вкладки»
    expect(again.store.get().navigation.currentRoomIndex).toBe(2);
    expect(again.ctl.currentReward(2)).toBe(11);
    expect(again.ctl.submit(2, RIGHT[2])).toMatchObject({ correct: true, reward: 11 });
    expect(again.store.get().quest.totalCoinsEarned).toBe(21);
  });

  it('несобранный ответ не считается попыткой', () => {
    const { store, ctl } = setup();
    expect(ctl.submit(1, { name: 'murzik', age: null, likes: null }).correct).toBe(false);
    expect(store.get().quest.rooms[1].attempts).toBe(0);
  });

  it('перескочить комнату нельзя: ни через submit, ни через advance, ни через подмену currentRoomIndex', () => {
    const { store, ctl } = setup();
    expect(ctl.submit(2, RIGHT[2]).correct).toBe(false);
    expect(store.get().quest.rooms[2].attempts).toBe(0);
    expect(ctl.advance()).toBe(false);
    expect(store.get().navigation.currentRoomIndex).toBe(1);

    store.update((s) => { s.navigation.currentRoomIndex = 3; }); // подмена
    expect(ctl.submit(3, RIGHT[3]).correct).toBe(false);
    expect(store.get().quest.rooms[3].isSolved).toBe(false);
  });

  it('решённую комнату нельзя «перерешать» ради монет', () => {
    const { store, ctl } = setup();
    ctl.submit(1, WRONG[1]);
    ctl.submit(1, RIGHT[1]);
    expect(ctl.submit(1, RIGHT[1]).correct).toBe(false);
    expect(store.get().quest.rooms[1].earnedCoins).toBe(7);
    expect(store.get().quest.totalCoinsEarned).toBe(7);
  });

  it('после завершения все методы — no-op', () => {
    const { store, ctl, onCompleted } = setup();
    for (const n of [1, 2, 3, 4] as const) {
      ctl.submit(n, RIGHT[n]);
      ctl.advance();
    }
    const snapshot = JSON.stringify(store.get());
    expect(ctl.submit(4, RIGHT[4]).correct).toBe(false);
    expect(ctl.useHint(4)).toBeNull();
    expect(ctl.canUseHint(4, 1)).toBe(false);
    expect(ctl.advance()).toBe(false);
    expect(ctl.startQuest('Другой').ok).toBe(false);
    expect(JSON.stringify(store.get())).toBe(snapshot);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('startQuest проверяет имя и не пишет плохое', () => {
    const { store, ctl } = setup();
    expect(ctl.startQuest('a')).toMatchObject({ ok: false, error: 'TOO_SHORT' });
    expect(store.get().leaderboard.playerName).toBe('');
    expect(ctl.startQuest('  Маша  ')).toMatchObject({ ok: true, value: 'Маша' });
    expect(store.get().leaderboard.playerName).toBe('Маша');
  });
});
