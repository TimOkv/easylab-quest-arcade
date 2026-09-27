// @vitest-environment happy-dom
// Экран квеста: точечные DOM-проверки (остальное — e2e).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createInitialState, createStore, SAVE_KEY } from '../src/core/state';
import { createQuestController } from '../src/quest/controller';
import { mountQuestScreen } from '../src/quest/screen';
import { PUZZLES_BY_ROOM, type PuzzleId } from '../src/core/types';
import { FakeStorage, fakeServer } from './services/helpers';
import { createCuratorSync } from '../src/services/curator';

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
const WRONG: Partial<Record<PuzzleId, unknown>> = {
  if_fridge: 'if',
  for_shelf: ['for_0_le5', 'put', 'close'],
  while_pc: 'four',
  fn_play: ['play', 'lparen', 'bare_jazz', 'comma', 'n3', 'rparen'],
};

const sfx = { play() {}, unlock() {} };
let destroy: (() => void) | null = null;
afterEach(() => {
  destroy?.();
  destroy = null;
  document.body.textContent = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('экран квеста: триумф', () => {
  it('отметки комнаты: «с первой попытки» — каждая загадка с первого раза; «с подсказкой» — вторая подсказка у одной из загадок', () => {
    const store = createStore({ storage: new FakeStorage() });
    const c = createQuestController(store);
    expect(c.startQuest('Аня').ok).toBe(true);
    const wrong = (pid: PuzzleId) => expect(c.submit(pid, WRONG[pid]).correct).toBe(false);
    const right = (pid: PuzzleId) => expect(c.submit(pid, RIGHT[pid]).correct).toBe(true);
    // Спальня: обе загадки с первого раза (сумма попыток комнаты = 2).
    right('var_types');
    right('var_assign');
    expect(c.advance()).toBe(true);
    // Кухня: одна ошибка — 3 попытки.
    wrong('if_fridge');
    right('if_fridge');
    right('and_kettle');
    expect(c.advance()).toBe(true);
    // Библиотека: по одной первой подсказке у каждой загадки (сумма = 2, но большой подсказки нет).
    wrong('for_shelf');
    expect(c.useHint('for_shelf')).not.toBeNull();
    right('for_shelf');
    wrong('while_pc');
    expect(c.useHint('while_pc')).not.toBeNull();
    right('while_pc');
    expect(c.advance()).toBe(true);
    // Чердак: вторая подсказка у проигрывателя.
    wrong('fn_play');
    c.useHint('fn_play');
    c.useHint('fn_play');
    expect(store.get().quest.puzzles.fn_play.hintsUsed).toBe(2);
    right('fn_play');
    right('fn_mission');
    expect(store.get().quest.isCompleted).toBe(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    destroy = mountQuestScreen(host, { store, sfx: sfx as never, controller: c, isServerConfigured: false, onGoToArcade() {} }).destroy;
    const tries = [...host.querySelectorAll('.ezq-triumph__room-tries')].map((n) => n.textContent);
    expect(tries).toEqual(['с первой попытки', 'попыток: 3', 'попыток: 4', 'попыток: 3, с подсказкой']);
  });
});

describe('экран квеста: триумф старого прохождения', () => {
  it('квест на 75 из сохранения: «из 75 возможных», отметки и монеты — по суммам комнат (по загадкам данных нет)', () => {
    // Сохранение старого квеста: 4 загадки по одной на комнату, без format и puzzles.
    const old = createInitialState(500, 'old-sess') as unknown as Record<string, any>;
    delete old.quest.format;
    delete old.quest.puzzles;
    delete old.quest.isRestored;
    const rooms: Array<[number, number, number, number]> = [[7, 10, 2, 0], [15, 15, 1, 0], [20, 20, 1, 1], [30, 30, 3, 2]];
    rooms.forEach(([earnedCoins, maxReward, attempts, hintsUsed], i) =>
      Object.assign(old.quest.rooms[i + 1], { earnedCoins, maxReward, attempts, hintsUsed, isSolved: true }));
    Object.assign(old.quest, { maxPossibleCoins: 75, totalCoinsEarned: 72, isCompleted: true, completedAt: 900, verificationCode: 'EZ-AB2C' });
    old.leaderboard.playerName = 'Аня';
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(old));
    const store = createStore({ storage });
    expect(store.get().quest).toMatchObject({ maxPossibleCoins: 75, isCompleted: true, isRestored: false });

    const host = document.createElement('div');
    document.body.appendChild(host);
    destroy = mountQuestScreen(host, { store, sfx: sfx as never, controller: createQuestController(store), isServerConfigured: false, onGoToArcade() {} }).destroy;
    expect(host.querySelector('.ezq-triumph__lead')?.textContent?.trim()).toBe('Ты заработал 72 EasyCoins из 75 возможных!');
    const texts = (sel: string) => [...host.querySelectorAll(sel)].map((n) => n.textContent);
    expect(texts('.ezq-triumph__room-tries')).toEqual(['попыток: 2', 'с первой попытки', 'с первой попытки', 'попыток: 3, с подсказкой']);
    expect(texts('.ezq-triumph__room-coins')).toEqual(['7 / 10', '15 / 15', '20 / 20', '30 / 30']);
    expect(host.querySelector('.ezq-triumph__code')?.textContent).toBe('EZ-AB2C');
  });
});

describe('экран квеста: триумф восстановленного с сервера прохождения', () => {
  it('register ответил restored: true, пока открыт триумф → серверные монеты и код, местные попытки и монеты по комнатам скрыты', async () => {
    const store = createStore({ storage: new FakeStorage() });
    const c = createQuestController(store);
    expect(c.startQuest('Аня').ok).toBe(true);
    for (const n of [1, 2, 3, 4] as const) {
      if (n === 2) expect(c.submit('if_fridge', WRONG.if_fridge).correct).toBe(false);
      for (const pid of PUZZLES_BY_ROOM[n]) expect(c.submit(pid, RIGHT[pid]).correct).toBe(true);
      if (n < 4) expect(c.advance()).toBe(true);
    }
    expect(store.get().quest).toMatchObject({ isCompleted: true, totalCoinsEarned: 146 });

    const host = document.createElement('div');
    document.body.appendChild(host);
    destroy = mountQuestScreen(host, { store, sfx: sfx as never, controller: c, isServerConfigured: true, onGoToArcade() {} }).destroy;
    const texts = (sel: string) => [...host.querySelectorAll(sel)].map((n) => n.textContent);
    // До ответа сервера — местное прохождение с разбивкой.
    expect(host.querySelector('.ezq-triumph__lead')?.textContent?.trim()).toBe('Ты заработал 146 EasyCoins из 150 возможных!');
    expect(texts('.ezq-triumph__room-coins')).toEqual(['20 / 20', '26 / 30', '40 / 40', '60 / 60']);

    const srv = fakeServer({
      register_quest_completion: () => ({ body: { verification_code: 'EZ-7K3P', coins_earned: 120, coins_max: 150, completed_at: '2026-09-20T09:00:00Z', restored: true } }),
    });
    expect(await createCuratorSync(srv.rest, store).syncNow()).toBe('synced');

    expect(host.querySelector('.ezq-triumph__lead')?.textContent?.trim()).toBe('Ты заработал 120 EasyCoins из 150 возможных!');
    expect(host.querySelector('.ezq-triumph__code')?.textContent).toBe('EZ-7K3P');
    const table = host.querySelector<HTMLElement>('.ezq-triumph__rooms')!;
    expect(table.hidden).toBe(true);
    expect(texts('.ezq-triumph__room-tries')).toEqual([]);
    expect(texts('.ezq-triumph__room-coins')).toEqual([]);
  });
});

describe('экран квеста: «Поверни телефон» (Решение §14)', () => {
  it('пока виден оверлей, хореография финала стоит: постер и триумф идут по часам сцены', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Кадры — вручную; ориентация — управляемый media query.
    let frames: FrameRequestCallback[] = [];
    let ts = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const pump = (ms: number): void => {
      for (let t = 0; t < ms; t += 16) {
        ts += 16;
        const run = frames;
        frames = [];
        for (const cb of run) cb(ts);
      }
    };
    const rotateListeners = new Set<() => void>();
    let portrait = false;
    vi.stubGlobal('matchMedia', (q: string) => ({
      get matches() {
        return q.includes('orientation: portrait') ? portrait : false;
      },
      media: q,
      addEventListener: (_: string, fn: () => void) => { if (q.includes('orientation')) rotateListeners.add(fn); },
      removeEventListener: (_: string, fn: () => void) => rotateListeners.delete(fn),
    }));
    const setPortrait = (on: boolean): void => {
      portrait = on;
      for (const fn of rotateListeners) fn();
    };

    const store = createStore({ storage: new FakeStorage() });
    const c = createQuestController(store);
    expect(c.startQuest('Аня').ok).toBe(true);
    const order: PuzzleId[][] = [['var_types', 'var_assign'], ['if_fridge', 'and_kettle'], ['for_shelf', 'while_pc']];
    for (const room of order) {
      for (const pid of room) expect(c.submit(pid, RIGHT[pid]).correct).toBe(true);
      expect(c.advance()).toBe(true);
    }
    expect(c.submit('fn_play', RIGHT.fn_play).correct).toBe(true);

    const host = document.createElement('div');
    document.body.appendChild(host);
    destroy = mountQuestScreen(host, { store, sfx: sfx as never, controller: c, isServerConfigured: false, onGoToArcade() {} }).destroy;
    const q = <T extends Element = HTMLElement>(sel: string): T | null => host.querySelector<T>(sel as never) as T | null;

    // Изик идёт к сундуку → «Пройти задачу» → собрать runMission("ARCADE") → «Проверить».
    q<HTMLButtonElement>('.ezq-qobj[data-puzzle="fn_mission"]')!.click();
    for (let i = 0; i < 60 && !q('.ezq-qact__go'); i++) pump(100);
    q<HTMLButtonElement>('.ezq-qact__go')!.click();
    for (const label of ['runMission', '(', '"ARCADE"', ')']) {
      const card = [...host.querySelectorAll<HTMLButtonElement>('.ezq-pz-pool .ezq-pz-card')].find((b) => b.textContent === label && !b.disabled && !b.hidden);
      card!.click();
    }
    q<HTMLButtonElement>('.ezq-qpanel__check')!.click();
    vi.advanceTimersByTime(500); // пауза проверки ответа
    expect(store.get().quest.isCompleted).toBe(true);
    const poster = q('.ezq-qbrand--poster')!;
    expect(poster.classList.contains('ezq-qbrand--on')).toBe(false);

    // Телефон повернули вертикально: ни кадры, ни обычные таймеры финал не продвигают.
    setPortrait(true);
    expect(q('.ezq-qrotate')!.hidden).toBe(false);
    pump(5000);
    vi.advanceTimersByTime(5000);
    expect(poster.classList.contains('ezq-qbrand--on')).toBe(false);
    expect(q('.ezq-triumph')).toBeNull();

    // Обратно в горизонталь: ≈1,4 с — постер, ≈3 с — триумф.
    setPortrait(false);
    expect(q('.ezq-qrotate')!.hidden).toBe(true);
    pump(1600);
    expect(poster.classList.contains('ezq-qbrand--on')).toBe(true);
    expect(q('.ezq-triumph')).toBeNull();
    setPortrait(true); // пауза между постером и триумфом тоже держит
    pump(3000);
    vi.advanceTimersByTime(3000);
    expect(q('.ezq-triumph')).toBeNull();
    setPortrait(false);
    pump(1600);
    expect(q('.ezq-triumph')).not.toBeNull();
  });
});
