// @vitest-environment happy-dom
// Экран квеста: точечные DOM-проверки (остальное — e2e).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createInitialState, createStore, SAVE_KEY } from '../src/core/state';
import { createQuestController } from '../src/quest/controller';
import { doorWalkSeconds, mountQuestScreen } from '../src/quest/screen';
import { ROOMS_DEF, type Pt } from '../src/quest/world/rooms';
import { buildGrid, findPath, isWalkable } from '../src/quest/world/walk';
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

describe('экран квеста: библиотека, выход из закутка у стола (таск 04)', () => {
  it('у старого компьютера ←/↓ до решения загадок — ни «Дверь закрыта», ни ухода; после решения ← уводит в дверь', () => {
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
    const key = (type: 'keydown' | 'keyup', code: string): void => {
      window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    };

    const store = createStore({ storage: new FakeStorage() });
    const c = createQuestController(store);
    expect(c.startQuest('Аня').ok).toBe(true);
    for (const n of [1, 2] as const) {
      for (const pid of PUZZLES_BY_ROOM[n]) expect(c.submit(pid, RIGHT[pid]).correct).toBe(true);
      expect(c.advance()).toBe(true);
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    destroy = mountQuestScreen(host, { store, sfx: sfx as never, controller: c, isServerConfigured: false, onGoToArcade() {} }).destroy;
    const q = <T extends Element = HTMLElement>(sel: string): T | null => host.querySelector<T>(sel as never) as T | null;
    const root = q('.ezq-quest')!;
    const doorSay = (): boolean => !!q('.ezq-qsay--door') && !q('.ezq-qsay--door')!.hidden;

    // Изик идёт к старому компьютеру и встаёт в закутке у стола.
    q<HTMLButtonElement>('.ezq-qobj[data-puzzle="while_pc"]')!.click();
    for (let i = 0; i < 60 && !q('.ezq-qact__go'); i++) pump(100);
    expect(q('.ezq-qact__go')).not.toBeNull();
    for (const code of ['ArrowLeft', 'ArrowDown']) {
      key('keydown', code);
      pump(1000);
      key('keyup', code);
      expect(doorSay(), `${code}: «Дверь закрыта» у компьютера`).toBe(false);
      expect(root.dataset.mode).toBe('walk');
    }

    for (const pid of PUZZLES_BY_ROOM[3]) expect(c.submit(pid, RIGHT[pid]).correct).toBe(true);
    pump(100);
    expect(root.dataset.mode).toBe('walk');
    key('keydown', 'ArrowLeft');
    pump(200);
    key('keyup', 'ArrowLeft');
    expect(root.dataset.mode).toBe('door');
    expect(store.get().navigation.currentRoomIndex).toBe(4);
  });
});

describe('экран квеста: уход в дверь идёт шагом (таск 04, доработка)', () => {
  const STEP_SPEED = 170; // px/с — скорость шага Изика при уходе в дверь
  const len = (route: Pt[]): number => route.slice(1).reduce((sum, b, i) => sum + Math.hypot(b.x - route[i].x, b.y - route[i].y), 0);
  const exitRoute = (room: 1 | 2 | 3, from: Pt): Pt[] => {
    const def = ROOMS_DEF[room];
    const exit = def.door.exit!;
    return [from, ...findPath(buildGrid(def), from, exit.approach), exit.walkTo];
  };

  it('библиотека: из закутка у стола и от точки появления средняя скорость ≈ скорости шага, а не 800 px за секунду', () => {
    for (const from of [{ x: 410, y: 745 }, ROOMS_DEF[3].objects.find((o) => o.id === 'old_pc')!.approach, { x: 602, y: 897 }]) {
      const route = exitRoute(3, from);
      const speed = len(route) / doorWalkSeconds(route);
      expect(speed, `из (${from.x},${from.y}), путь ${len(route).toFixed(0)} px`).toBeGreaterThan(STEP_SPEED * 0.95);
      expect(speed).toBeLessThan(STEP_SPEED * 1.05);
    }
  });

  it('спальня и кухня: длительность из любой точки зоны выхода та же, что на HEAD (0,4…1 с); на чердаке выхода нет', () => {
    const head = (route: Pt[]): number => Math.min(1, Math.max(0.4, len(route) / STEP_SPEED)); // формула HEAD 0318fee
    for (const room of [1, 2] as const) {
      const def = ROOMS_DEF[room];
      const grid = buildGrid(def);
      const exit = def.door.exit!;
      let n = 0;
      for (let y = exit.approach.y - exit.radius; y <= exit.approach.y + exit.radius; y += 4)
        for (let x = exit.approach.x - exit.radius; x <= exit.approach.x + exit.radius; x += 4) {
          const p = { x, y };
          if (!isWalkable(grid, p) || Math.hypot(x - exit.approach.x, y - exit.approach.y) > exit.radius) continue;
          const route = exitRoute(room, p);
          expect(doorWalkSeconds(route), `комната ${room}, (${x},${y})`).toBeCloseTo(head(route), 9);
          n++;
        }
      expect(n).toBeGreaterThan(10);
    }
    expect(ROOMS_DEF[4].door.exit).toBeNull();
  });
});

describe('экран квеста: аватарка Изика у реплики (прогон cat-avatar)', () => {
  const mount = (store: ReturnType<typeof createStore>) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const c = createQuestController(store);
    destroy = mountQuestScreen(host, { store, sfx: sfx as never, controller: c, isServerConfigured: false, onGoToArcade() {} }).destroy;
    return { host, c };
  };
  const expectAvatar = (cat: Element | null): void => {
    expect(cat).not.toBeNull();
    expect(cat!.textContent).not.toContain('🐱');
    const img = cat!.querySelector<HTMLImageElement>('img.ezq-cat__face');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toMatch(/cat-avatar\.webp/);
    expect(img!.getAttribute('alt')).toBe('');
    expect(img!.getAttribute('aria-hidden')).toBe('true');
    expect(img!.draggable).toBe(false);
  };

  it('вступление: рядом с репликой — картинка-аватарка, эмодзи нет; картинка подгружается при монтировании', () => {
    const loaded: string[] = [];
    const RealImage = globalThis.Image;
    vi.stubGlobal('Image', class extends RealImage {
      set src(v: string) { loaded.push(v); }
      get src(): string { return loaded[loaded.length - 1] ?? ''; }
    });
    const { host } = mount(createStore({ storage: new FakeStorage() }));
    expect(loaded.some((u) => /cat-avatar\.webp/.test(u))).toBe(true);
    expectAvatar(host.querySelector('.ezq-cat'));
  });

  it('панель загадки комнаты 1: в реплике та же аватарка, без «🐱»', () => {
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
    const store = createStore({ storage: new FakeStorage() });
    const pre = createQuestController(store);
    expect(pre.startQuest('Аня').ok).toBe(true);
    expect(pre.submit('var_assign', RIGHT.var_assign).correct).toBe(true); // есть прогресс → без вступления, сразу ходьба
    const { host } = mount(store);
    host.querySelector<HTMLButtonElement>('.ezq-qobj[data-puzzle="var_types"]')!.click();
    for (let i = 0; i < 60 && !host.querySelector('.ezq-qact__go'); i++) pump(100);
    host.querySelector<HTMLButtonElement>('.ezq-qact__go')!.click();
    expect(host.querySelector('.ezq-pz-card, .ezq-qpanel__check')).not.toBeNull();
    expectAvatar(host.querySelector('.ezq-cat'));
  });
});
