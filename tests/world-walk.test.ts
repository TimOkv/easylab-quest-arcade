import { describe, expect, it } from 'vitest';
import { buildGrid, findPath, isWalkable } from '../src/quest/world/walk';
import { exitZoneAt, type Pt, type Rect } from '../src/quest/world/rooms';

const R = (x1: number, y1: number, x2: number, y2: number): Rect => ({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });

/** Отрезок a→b не заходит в прямоугольник (проверка с шагом 2 px). */
function segmentHits(a: Pt, b: Pt, r: Rect): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2) || 1;
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
  }
  return false;
}

// Комната 400×300 со стеной посередине: проход только снизу (y > 240).
const WALL = R(190, 0, 210, 240);
const TOY = { floor: [R(0, 0, 400, 300)], obstacles: [WALL] };

describe('walk: сетка и путь', () => {
  it('путь в обход стены: доходит до цели и нигде не пересекает препятствие', () => {
    const grid = buildGrid(TOY);
    const from = { x: 50, y: 50 };
    const to = { x: 350, y: 50 };
    const path = findPath(grid, from, to);
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toEqual(to);
    let prev = from;
    for (const p of path) {
      expect(isWalkable(grid, p)).toBe(true);
      expect(segmentHits(prev, p, WALL)).toBe(false);
      prev = p;
    }
  });
});

import { ROOMS_DEF } from '../src/quest/world/rooms';
import { createWalker, nearestWalkable } from '../src/quest/world/walk';
import { createFixedClock, advanceClock } from '../src/core/clock';
import { PUZZLES_BY_ROOM, type RoomIndex } from '../src/core/types';

const ROOMS: RoomIndex[] = [1, 2, 3, 4];
const inside = (pt: Pt, r: Rect) => pt.x > r.x && pt.x < r.x + r.w && pt.y > r.y && pt.y < r.y + r.h;

describe('ROOMS_DEF: разметка комнат', () => {
  it.each(ROOMS)('комната %i: по 2 загадки своей комнаты и 2 декоративных предмета', (room) => {
    const def = ROOMS_DEF[room];
    const puzzles = def.objects.filter((o) => o.puzzleId).map((o) => o.puzzleId).sort();
    expect(puzzles).toEqual([...PUZZLES_BY_ROOM[room]].sort());
    expect(def.objects.filter((o) => o.decor).length).toBe(2);
  });

  it('бренд: экраны компьютеров в спальне и библиотеке, магнит на холодильнике, постер на чердаке', () => {
    const brands = ROOMS.flatMap((room) => ROOMS_DEF[room].objects.filter((o) => o.brand).map((o) => `${room}:${o.puzzleId ?? o.id}:${o.brand}`));
    expect(brands.sort()).toEqual(['1:var_types:screen', '2:if_fridge:magnet', '3:while_pc:screen', '4:poster:poster']);
  });

  it('двери: спальня без входа, чердак без выхода, остальные с обоими', () => {
    expect(ROOMS_DEF[1].door.entry).toBeNull();
    expect(ROOMS_DEF[4].door.exit).toBeNull();
    for (const room of [1, 2, 3] as const) expect(ROOMS_DEF[room].door.exit).not.toBeNull();
    for (const room of [2, 3, 4] as const) expect(ROOMS_DEF[room].door.entry).not.toBeNull();
  });

  it.each(ROOMS)('комната %i: от точки появления есть путь к каждому предмету и к двери, мимо мебели', (room) => {
    const def = ROOMS_DEF[room];
    const grid = buildGrid(def);
    const targets = def.objects.filter((o) => o.radius > 0).map((o) => ({ name: o.id, pt: o.approach }));
    if (def.door.exit) targets.push({ name: 'door', pt: def.door.exit.approach });
    expect(isWalkable(grid, def.spawn)).toBe(true);
    for (const t of targets) {
      expect(isWalkable(grid, t.pt), `${t.name}: точка подхода на полу`).toBe(true);
      const path = findPath(grid, def.spawn, t.pt);
      expect(path.at(-1), `${t.name}: путь дошёл`).toEqual(t.pt);
      let prev = def.spawn;
      for (const q of path) {
        for (const o of def.obstacles) expect(segmentHits(prev, q, o), `${t.name}: путь через мебель`).toBe(false);
        prev = q;
      }
    }
  });

  it.each(ROOMS)('комната %i: зоны подхода к загадкам и двери не пересекаются', (room) => {
    const def = ROOMS_DEF[room];
    const zones = def.objects.filter((o) => o.puzzleId).map((o) => ({ c: o.approach, r: o.radius }));
    if (def.door.exit) zones.push({ c: def.door.exit.approach, r: def.door.exit.radius });
    for (let i = 0; i < zones.length; i++)
      for (let j = i + 1; j < zones.length; j++)
        expect(Math.hypot(zones[i].c.x - zones[j].c.x, zones[i].c.y - zones[j].c.y)).toBeGreaterThan(zones[i].r + zones[j].r);
  });

  it.each(ROOMS)('комната %i: тап в мебель ведёт в ближайшую проходимую точку, и туда можно дойти', (room) => {
    const def = ROOMS_DEF[room];
    const grid = buildGrid(def);
    for (const o of def.obstacles) {
      const tap = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
      const near = nearestWalkable(grid, tap)!;
      expect(isWalkable(grid, near)).toBe(true);
      for (const ob of def.obstacles) expect(inside(near, ob)).toBe(false);
      const path = findPath(grid, def.spawn, tap);
      if (path.length) expect(isWalkable(grid, path.at(-1)!)).toBe(true);
    }
  });
});

describe('walk: тап в мебель и в недоступное место', () => {
  it.each(ROOMS)('комната %i: тап в любое препятствие — путь от точки появления непустой и кончается в выбранной точке', (room) => {
    const def = ROOMS_DEF[room];
    const grid = buildGrid(def);
    const taps: Pt[] = [];
    for (const o of def.obstacles) {
      taps.push({ x: o.x + o.w / 2, y: o.y + o.h / 2 }, { x: o.x + 2, y: o.y + o.h - 2 }, { x: o.x + o.w - 2, y: o.y + o.h - 2 });
    }
    // и в каждую клетку сцены, где пола нет или он отрезан мебелью
    for (let y = 10; y < 900; y += 40) for (let x = 10; x < 1600; x += 40) taps.push({ x, y });
    for (const tap of taps) {
      const target = nearestWalkable(grid, tap, def.spawn);
      expect(target, `цель для (${tap.x},${tap.y})`).not.toBeNull();
      const path = findPath(grid, def.spawn, tap);
      expect(path.length, `путь к (${tap.x},${tap.y})`).toBeGreaterThan(0);
      expect(path.at(-1)).toEqual(target);
    }
  });

  it('цель выбирается в той же связной области, что и герой, даже если чужой карман ближе', () => {
    // две комнаты без прохода между ними: тап у стены справа ведёт к ближайшей точке своей половины
    const grid = buildGrid({ floor: [R(0, 0, 400, 300)], obstacles: [R(190, 0, 210, 300)] });
    const t = nearestWalkable(grid, { x: 200, y: 150 }, { x: 50, y: 150 })!;
    expect(t.x).toBeLessThan(190);
    expect(findPath(grid, { x: 50, y: 150 }, { x: 260, y: 150 }).at(-1)!.x).toBeLessThan(190);
  });
});

describe('walk: герой', () => {
  const grid = buildGrid(TOY);

  it('скорость не зависит от частоты кадров: за 1 с на 30/60/120/144 Гц — одно и то же место', () => {
    const run = (hz: number) => {
      const w = createWalker(grid, { x: 20, y: 270 });
      w.setPath([{ x: 390, y: 270 }]);
      const clock = createFixedClock();
      for (let t = 0; t < 1000 - 1e-6; t += 1000 / hz) {
        const n = advanceClock(clock, 1000 / hz);
        for (let i = 0; i < n; i++) w.step(1 / 60);
      }
      return w.pos.x;
    };
    const x60 = run(60);
    expect(x60).toBeCloseTo(20 + 260, 0); // ≈ 260 px/с
    for (const hz of [30, 120, 144]) expect(Math.abs(run(hz) - x60)).toBeLessThanOrEqual(260 / 60 + 1e-6);
  });

  it('ручной ввод не проходит сквозь стену и скользит вдоль неё', () => {
    const w = createWalker(grid, { x: 120, y: 100 });
    w.setInput({ x: 1, y: 0 });
    for (let i = 0; i < 180; i++) w.step(1 / 60);
    expect(w.pos.x).toBeLessThan(WALL.x);
    expect(w.dir).toBe('right');
    const y0 = w.pos.y;
    w.setInput({ x: 1, y: 1 }); // по диагонали в стену — съезжает вниз вдоль неё
    for (let i = 0; i < 20; i++) w.step(1 / 60);
    expect(w.pos.x).toBeLessThan(WALL.x);
    expect(w.pos.y).toBeGreaterThan(y0 + 20);
  });

  it('клавиша во время пути отменяет путь; отпустил — стоит', () => {
    const w = createWalker(grid, { x: 50, y: 270 });
    w.setPath(findPath(grid, w.pos, { x: 350, y: 50 }));
    w.step(1 / 60);
    expect(w.moving).toBe(true);
    w.setInput({ x: 0, y: -1 });
    expect(w.path.length).toBe(0);
    w.step(1 / 60);
    expect(w.dir).toBe('up');
    w.setInput({ x: 0, y: 0 });
    const at = { ...w.pos };
    w.step(1 / 60);
    expect(w.moving).toBe(false);
    expect(w.pos).toEqual(at);
  });
});

describe('walk: Изик не наезжает на мебель сбоку', () => {
  // Тело Изика — 20 колонок спрайта × 3 px = 60 px, т.е. ±30 px от точки между лапами.
  const BODY_HALF_W = 30;

  it.each(ROOMS)('комната %i: в любой точке, где Изик может стоять, до мебели на той же высоте ≥ 30 px по горизонтали', (room) => {
    const def = ROOMS_DEF[room];
    const grid = buildGrid(def);
    const bad: string[] = [];
    for (let y = 1; y < 900; y += 5) {
      for (let x = 1; x < 1600; x += 3) {
        if (!isWalkable(grid, { x, y })) continue;
        for (const o of def.obstacles) {
          if (y < o.y || y > o.y + o.h) continue;
          const gap = x < o.x ? o.x - x : x > o.x + o.w ? x - (o.x + o.w) : 0;
          if (gap < BODY_HALF_W) bad.push(`(${x},${y}) у (${o.x},${o.y},${o.w},${o.h}) зазор ${gap}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe('библиотека: Изик не стоит на столе', () => {
  // Силуэт стола по фону library.webp (снято по сетке, не из разметки): столешница, передняя
  // панель, левая ножка и тумба с ящиками доходят до пола на y≈770; правый край стола с ящиками — до y≈620.
  const DESK = [R(150, 625, 378, 770), R(378, 450, 470, 620)];
  const def = ROOMS_DEF[3];
  const grid = buildGrid(def);
  const onDesk = (p: Pt) => DESK.some((d) => inside(p, d));

  it('ни одна точка, где может стоять Изик, не лежит на силуэте стола (полоса под столешницей)', () => {
    const bad: string[] = [];
    for (let y = 600; y <= 790; y += 2) for (let x = 100; x <= 500; x += 2) if (isWalkable(grid, { x, y }) && onDesk({ x, y })) bad.push(`(${x},${y})`);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('точка появления, точки подхода и путь входа — не на столе', () => {
    const pts = [def.spawn, ...def.objects.map((o) => o.approach), def.door.exit!.approach];
    for (const p of pts) expect(onDesk(p), `(${p.x},${p.y})`).toBe(false);
    const entry = def.door.entry!;
    for (const d of DESK) expect(segmentHits(entry.from, def.spawn, d)).toBe(false);
  });

  it('вход снизу экрана: Изик идёт вверх к точке появления, не задевая мебель', () => {
    const entry = def.door.entry!;
    expect(entry.dir).toBe('up');
    expect(entry.from.y).toBeGreaterThanOrEqual(880);
    expect(def.spawn.y).toBeLessThan(entry.from.y);
    for (const o of def.obstacles) expect(segmentHits(entry.from, def.spawn, o)).toBe(false);
  });

  it('выход — нижняя левая дверь (x≈40–150, y≈475–900), верхняя левая дверь (x≈285–378, y≈125–405) не светится', () => {
    const exit = def.door.exit!;
    const c = { x: exit.rect.x + exit.rect.w / 2, y: exit.rect.y + exit.rect.h / 2 };
    expect(inside(c, R(40, 475, 150, 900))).toBe(true);
    expect(exit.rect.x + exit.rect.w).toBeLessThanOrEqual(160);
    expect(inside(c, R(285, 125, 378, 405))).toBe(false);
    expect(exit.walkTo.x).toBeLessThan(150); // уходит в проём нижней левой двери
    expect(exit.walkTo.y).toBeGreaterThanOrEqual(890); // к низу двери, у кромки сцены
    // точка появления не в зоне выхода: после входа и перезагрузки переход сам не запускается
    expect(Math.hypot(def.spawn.x - exit.approach.x, def.spawn.y - exit.approach.y)).toBeGreaterThan(exit.radius);
  });

  it('уход в дверь идёт перед стопками книг: отрезок approach→walkTo не пересекает ни одно препятствие', () => {
    const exit = def.door.exit!;
    for (const o of def.obstacles) expect(segmentHits(exit.approach, exit.walkTo, o), `через (${o.x},${o.y},${o.w},${o.h})`).toBe(false);
  });

  it('логотип — на стекле ЭЛТ-экрана (тёмное стекло в светлой рамке x≈286–338, y≈445–500), не на папках справа (x≥340)', () => {
    const pc = def.objects.find((o) => o.id === 'old_pc')!;
    const b = pc.brandRect!;
    expect(b.x).toBeGreaterThanOrEqual(286);
    expect(b.x + b.w).toBeLessThanOrEqual(338);
    expect(b.y).toBeGreaterThanOrEqual(445);
    expect(b.y + b.h).toBeLessThanOrEqual(500);
    // свечение предмета охватывает весь монитор (x≈237–340, y≈395–535)
    for (const p of [{ x: 238, y: 396 }, { x: 339, y: 534 }]) expect(inside(p, pc.rect)).toBe(true);
  });
});

describe('библиотека: к светящейся двери стрелками', () => {
  // Та же проверка, что на экране (exitZoneAt); после двух решённых загадок любая зона выхода
  // запускает уход: Изик идёт по сетке до exit.approach, затем по прямой к exit.walkTo.
  const def = ROOMS_DEF[3];
  const grid = buildGrid(def);
  const exit = def.door.exit!;
  const pc = def.objects.find((o) => o.id === 'old_pc')!;
  const LEFT = { x: -1, y: 0 };
  const DOWN = { x: 0, y: 1 };
  const LEFT_DOWN = { x: -1, y: 1 };
  const NOOK = { x: 410, y: 745 }; // закуток у стола: слева стол, справа кресло, внизу корзина и стопки

  /** Держит стрелки по плану (вектор, секунд) из точки start; где сработала зона выхода, или null. */
  function hold(start: Pt, plan: Array<[Pt, number]>): Pt | null {
    const w = createWalker(grid, start);
    for (const [v, sec] of plan) {
      w.setInput(v);
      for (let i = 0; i < sec * 60; i++) {
        w.step(1 / 60);
        if (exitZoneAt(exit, w.pos, v)) return { ...w.pos };
      }
    }
    return null;
  }

  const PLANS = [
    ['↓', [[DOWN, 4]]],
    ['←', [[LEFT, 4]]],
    ['↓, потом ←', [[DOWN, 4], [LEFT, 4]]],
    ['← и ↓ вместе', [[LEFT_DOWN, 6]]],
    ['←, потом ↓', [[LEFT, 4], [DOWN, 4]]],
    ['←, потом ↓, потом ← и ↓', [[LEFT, 4], [DOWN, 4], [LEFT_DOWN, 4]]],
  ] as Array<[string, Array<[Pt, number]>]>;
  const STARTS = [
    ['закуток у стола (410,745)', NOOK],
    ['точка подхода к старому компьютеру', pc.approach],
    ['точка появления', def.spawn],
  ] as Array<[string, Pt]>;
  const CASES = STARTS.flatMap(([where, start]) => PLANS.map(([keys, plan]) => [where, keys, start, plan] as const));

  it.each(CASES)('%s, %s: зона выхода срабатывает, уход в дверь — в обход мебели и перед стопками', (_w, _k, start, plan) => {
    const at = hold(start, plan);
    expect(at, 'зона выхода не сработала').not.toBeNull();
    const route = [at!, ...findPath(grid, at!, exit.approach), exit.walkTo];
    expect(route.at(-2)).toEqual(exit.approach);
    for (let i = 1; i < route.length; i++)
      for (const o of def.obstacles) expect(segmentHits(route[i - 1], route[i], o), `отрезок ${i} через (${o.x},${o.y},${o.w},${o.h})`).toBe(false);
  });

  it('стоя на месте, Изик не в зоне выхода ни в точке появления, ни у старого компьютера', () => {
    for (const p of [def.spawn, pc.approach, NOOK]) expect(exitZoneAt(exit, p), `(${p.x},${p.y})`).toBeNull();
  });
});
