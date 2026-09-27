import { describe, it, expect, vi } from 'vitest';
import { createStore, SAVE_KEY } from '../src/core/state';
import type { KeyValueStorage, PuzzleId, RoomIndex } from '../src/core/types';
import { createQuestController } from '../src/quest/controller';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

// Верные и неверные ответы — из таблицы «Загадки» спецификации.
const RIGHT: Record<PuzzleId, unknown> = {
  var_types: { name: 'izik', age: 'num12', likes: 'true' },
  var_assign: 'five',
  if_fridge: 'else',
  and_kettle: ['yy'],
  for_shelf: ['for_0_lt5', 'put', 'close'],
  while_pc: 'five',
  fn_play: ['play', 'lparen', 'str_jazz', 'comma', 'n3', 'rparen'],
  fn_mission: ['runMission', 'lparen', 'str_arcade', 'rparen'],
};
const WRONG: Record<PuzzleId, unknown> = {
  var_types: { name: 'izik', age: 'str12', likes: 'true' },
  var_assign: 'two',
  if_fridge: 'if',
  and_kettle: ['yy', 'yn'],
  for_shelf: ['for_0_le5', 'put', 'close'],
  while_pc: 'ten',
  fn_play: ['play', 'lparen', 'n3', 'comma', 'str_jazz', 'rparen'],
  fn_mission: ['runMission', 'lparen', 'bare_arcade', 'rparen'],
};
const ROOM_PUZZLES: Record<RoomIndex, [PuzzleId, PuzzleId]> = {
  1: ['var_types', 'var_assign'],
  2: ['if_fridge', 'and_kettle'],
  3: ['for_shelf', 'while_pc'],
  4: ['fn_play', 'fn_mission'],
};

const NOW = 1_790_000_000_000;

function setup(storage = new FakeStorage()) {
  const store = createStore({ storage, now: () => NOW, win: null, newSessionId: () => 'sess-1' });
  const onCompleted = vi.fn();
  const ctl = createQuestController(store, { onCompleted, now: () => NOW });
  return { storage, store, ctl, onCompleted };
}

type Ctl = ReturnType<typeof setup>['ctl'];

/** Решает комнату с первой попытки (в заданном порядке загадок) и переходит дальше. */
function clearRoom(ctl: Ctl, room: RoomIndex, order: [PuzzleId, PuzzleId] = ROOM_PUZZLES[room]): number[] {
  const rewards = order.map((pid) => ctl.submit(pid, RIGHT[pid]).reward!);
  if (room < 4) expect(ctl.advance()).toBe(true);
  return rewards;
}

describe('quest/controller — 8 загадок', () => {
  it('всё с первой попытки → 150 монет, атомарное завершение с кодом и разблокировкой аркады', () => {
    const { store, ctl, onCompleted } = setup();
    expect(ctl.startQuest('Тимофей')).toMatchObject({ ok: true });
    const rewards = ([1, 2, 3, 4] as const).flatMap((n) => clearRoom(ctl, n));
    expect(rewards).toEqual([10, 10, 15, 15, 20, 20, 30, 30]);
    const s = store.get();
    expect(s.quest.totalCoinsEarned).toBe(150);
    expect(s.quest.isCompleted).toBe(true);
    expect(s.quest.completedAt).toBe(NOW);
    expect(s.quest.verificationCode).toMatch(/^EZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    expect(s.arcade.isUnlocked).toBe(true);
    expect(s.leaderboard.playerName).toBe('Тимофей');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('загадки комнаты решаются в любом порядке; финал — когда решена последняя из 8, какая бы она ни была', () => {
    const { store, ctl, onCompleted } = setup();
    for (const n of [1, 2, 3] as const) clearRoom(ctl, n, [ROOM_PUZZLES[n][1], ROOM_PUZZLES[n][0]]);
    expect(ctl.submit('fn_mission', RIGHT.fn_mission).correct).toBe(true);
    expect(store.get().quest.isCompleted).toBe(false);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(ctl.submit('fn_play', RIGHT.fn_play).correct).toBe(true);
    expect(store.get().quest.isCompleted).toBe(true);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('подписчик ни разу не видит завершение без кода, времени и разблокировки; верная попытка сохраняется', () => {
    const { store, ctl } = setup();
    const seen: { completed: boolean; code: string | null; at: number | null; unlocked: boolean }[] = [];
    store.subscribe((s) => {
      seen.push({ completed: s.quest.isCompleted, code: s.quest.verificationCode, at: s.quest.completedAt, unlocked: s.arcade.isUnlocked });
    });
    for (const n of [1, 2, 3] as const) clearRoom(ctl, n);
    ctl.submit('fn_play', RIGHT.fn_play);
    expect(ctl.submit('fn_mission', RIGHT.fn_mission).correct).toBe(true);
    expect(store.get().quest.puzzles.fn_mission.attempts).toBe(1); // верная попытка тоже записана
    const done = seen.filter((x) => x.completed);
    expect(done.length).toBeGreaterThan(0);
    for (const x of done) {
      expect(x.code).toMatch(/^EZ-/);
      expect(x.at).toBe(NOW);
      expect(x.unlocked).toBe(true);
    }
  });

  it('минимум без второй подсказки: по две ошибки в каждой загадке → (5+8+10+15)·2 = 76', () => {
    const { store, ctl } = setup();
    for (const n of [1, 2, 3, 4] as const) {
      for (const pid of ROOM_PUZZLES[n]) {
        expect(ctl.submit(pid, WRONG[pid]).correct).toBe(false);
        ctl.submit(pid, WRONG[pid]);
        expect(ctl.submit(pid, RIGHT[pid]).reward).toBe([5, 8, 10, 15][n - 1]);
      }
      ctl.advance();
    }
    expect(store.get().quest.totalCoinsEarned).toBe(76);
    expect(store.get().quest.puzzles.while_pc.attempts).toBe(3);
  });

  it('quest.rooms[n] — суммы двух загадок комнаты; isSolved — только когда решены обе', () => {
    const { store, ctl } = setup();
    ctl.submit('var_types', WRONG.var_types);
    ctl.useHint('var_types');
    ctl.submit('var_types', RIGHT.var_types); // 2-я попытка → 7
    expect(store.get().quest.rooms[1]).toMatchObject({ isSolved: false, earnedCoins: 7, attempts: 2, hintsUsed: 1, maxReward: 20 });
    expect(ctl.isRoomCleared(1)).toBe(false);
    ctl.submit('var_assign', RIGHT.var_assign); // → 10
    expect(store.get().quest.rooms[1]).toMatchObject({ isSolved: true, earnedCoins: 17, attempts: 3, hintsUsed: 1 });
    expect(ctl.isRoomCleared(1)).toBe(true);
    expect(store.get().quest.totalCoinsEarned).toBe(17);
  });

  it('advance — только когда обе загадки текущей комнаты решены', () => {
    const { store, ctl } = setup();
    expect(ctl.advance()).toBe(false);
    ctl.submit('var_assign', RIGHT.var_assign);
    expect(ctl.advance()).toBe(false);
    expect(store.get().navigation.currentRoomIndex).toBe(1);
    ctl.submit('var_types', RIGHT.var_types);
    expect(ctl.advance()).toBe(true);
    expect(store.get().navigation.currentRoomIndex).toBe(2);
  });

  it('неверный ответ возвращает код ошибки и объяснение', () => {
    const { ctl } = setup();
    const r = ctl.submit('var_types', WRONG.var_types);
    expect(r).toMatchObject({ correct: false, mistake: 'QUOTED_NUMBER' });
    expect(r.message).toBeTruthy();
  });

  it('подсказки считаются для каждой загадки отдельно: 1-я — после ошибки, 2-я обнуляет монеты только этой загадки', () => {
    const { store, ctl } = setup();
    expect(ctl.canUseHint('var_types', 1)).toBe(false);
    expect(ctl.useHint('var_types')).toBeNull();

    ctl.submit('var_types', WRONG.var_types);
    expect(ctl.canUseHint('var_types', 1)).toBe(true);
    expect(ctl.canUseHint('var_assign', 1)).toBe(false); // у соседней загадки попыток ещё нет
    expect(ctl.canUseHint('var_types', 2)).toBe(false);
    expect(ctl.useHint('var_types')).toMatch(/кавычк/i);
    expect(ctl.currentReward('var_types')).toBe(7); // первая подсказка бесплатна

    expect(ctl.useHint('var_types')).toMatch(/"12"/);
    expect(store.get().quest.puzzles.var_types.hintsUsed).toBe(2);
    expect(ctl.currentReward('var_types')).toBe(0);
    expect(ctl.canUseHint('var_types', 2)).toBe(false);
    expect(ctl.currentReward('var_assign')).toBe(10);

    expect(ctl.submit('var_types', RIGHT.var_types)).toMatchObject({ correct: true, reward: 0 });
    expect(ctl.submit('var_assign', RIGHT.var_assign)).toMatchObject({ correct: true, reward: 10 });
    expect(store.get().quest.totalCoinsEarned).toBe(10);
  });

  it('«Сейчас за верный ответ» падает по таблице и не уходит ниже третьей колонки', () => {
    const { ctl } = setup();
    expect(ctl.currentReward('var_assign')).toBe(10);
    ctl.submit('var_assign', WRONG.var_assign);
    expect(ctl.currentReward('var_assign')).toBe(7);
    for (let i = 0; i < 3; i++) ctl.submit('var_assign', WRONG.var_assign);
    expect(ctl.currentReward('var_assign')).toBe(5);
  });

  it('попытка сохраняется до показа результата: перезагрузка между попытками её не обнуляет', () => {
    const first = setup();
    clearRoom(first.ctl, 1);
    first.ctl.submit('and_kettle', WRONG.and_kettle);
    expect(JSON.parse(first.storage.getItem(SAVE_KEY)!).quest.puzzles.and_kettle.attempts).toBe(1);

    const again = setup(first.storage); // «перезагрузка вкладки»
    expect(again.store.get().navigation.currentRoomIndex).toBe(2);
    expect(again.ctl.currentReward('and_kettle')).toBe(11);
    expect(again.ctl.submit('and_kettle', RIGHT.and_kettle)).toMatchObject({ correct: true, reward: 11 });
    expect(again.store.get().quest.totalCoinsEarned).toBe(31);
  });

  it('несобранный ответ не считается попыткой', () => {
    const { store, ctl } = setup();
    expect(ctl.submit('var_types', { name: 'izik', age: null, likes: null })).toMatchObject({ correct: false, rejected: 'INCOMPLETE' });
    expect(ctl.submit('var_assign', null)).toMatchObject({ correct: false, rejected: 'INCOMPLETE' });
    expect(store.get().quest.puzzles.var_types.attempts).toBe(0);
    expect(store.get().quest.puzzles.var_assign.attempts).toBe(0);
  });

  it('загадка чужой комнаты → NOT_CURRENT; перескочить нельзя ни через advance, ни через подмену currentRoomIndex', () => {
    const { store, ctl } = setup();
    expect(ctl.submit('and_kettle', RIGHT.and_kettle)).toMatchObject({ correct: false, rejected: 'NOT_CURRENT' });
    expect(store.get().quest.puzzles.and_kettle.attempts).toBe(0);
    expect(ctl.canUseHint('and_kettle', 1)).toBe(false);
    expect(ctl.submit('nope' as PuzzleId, 1)).toMatchObject({ correct: false, rejected: 'NOT_CURRENT' });

    store.update((s) => { s.navigation.currentRoomIndex = 3; }); // подмена
    expect(ctl.submit('for_shelf', RIGHT.for_shelf)).toMatchObject({ correct: false, rejected: 'NOT_CURRENT' });
    expect(store.get().quest.puzzles.for_shelf.isSolved).toBe(false);
  });

  it('решённую загадку нельзя «перерешать» ради монет → ALREADY_SOLVED', () => {
    const { store, ctl } = setup();
    ctl.submit('var_types', WRONG.var_types);
    ctl.submit('var_types', RIGHT.var_types);
    expect(ctl.submit('var_types', RIGHT.var_types)).toMatchObject({ correct: false, rejected: 'ALREADY_SOLVED' });
    expect(store.get().quest.puzzles.var_types).toMatchObject({ earnedCoins: 7, attempts: 2 });
    expect(store.get().quest.totalCoinsEarned).toBe(7);
    expect(ctl.currentReward('var_types')).toBe(7);
  });

  it('после завершения все методы — no-op', () => {
    const { store, ctl, onCompleted } = setup();
    for (const n of [1, 2, 3, 4] as const) clearRoom(ctl, n);
    const snapshot = JSON.stringify(store.get());
    expect(ctl.submit('fn_mission', RIGHT.fn_mission)).toMatchObject({ correct: false, rejected: 'LOCKED' });
    expect(ctl.useHint('fn_mission')).toBeNull();
    expect(ctl.canUseHint('fn_mission', 1)).toBe(false);
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
