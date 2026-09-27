// @vitest-environment happy-dom
// Экран квеста: точечные DOM-проверки (остальное — e2e).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStore } from '../src/core/state';
import { createQuestController } from '../src/quest/controller';
import { mountQuestScreen } from '../src/quest/screen';
import type { PuzzleId } from '../src/core/types';
import { FakeStorage } from './services/helpers';

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
