// Ходьба Изика — чистый модуль без DOM: сетка проходимости 20 px, A* (8 направлений,
// без срезания углов) со сглаживанием по линии видимости, герой на фиксированном шаге.
// Все координаты — пиксели сцены 1600×900; позиция героя — точка между лапами (низ спрайта).

import type { Dir, Pt, Rect, RoomDef } from './rooms';

export const CELL = 20;
/** Скорость ходьбы, px сцены в секунду. */
export const WALK_SPEED = 260;
/**
 * Поля вокруг мебели: половина ширины тела Изика по бокам (20 колонок спрайта × 3 px / 2)
 * и немного сверху/снизу — чтобы спрайт не наезжал на предмет, который стоит на той же глубине.
 * Поле выдерживается для любой точки, где может стоять Изик (isWalkable), а не только для центров клеток.
 */
export const PAD_X = 30;
export const PAD_Y = 6;

export interface Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** 1 — клетка проходима; индекс row * cols + col. */
  readonly walkable: Uint8Array;
  /** Мебель, расширенная на PAD_X/PAD_Y: сюда не встаёт ни одна точка героя. */
  readonly blocked: readonly Rect[];
}

const inRect = (x: number, y: number, r: Rect): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Сетка: центр клетки лежит на полу и не попадает в препятствие, расширенное на PAD_X/PAD_Y. */
export function buildGrid(def: Pick<RoomDef, 'floor' | 'obstacles'>, cell: number = CELL): Grid {
  let maxX = 0;
  let maxY = 0;
  for (const f of def.floor) {
    maxX = Math.max(maxX, f.x + f.w);
    maxY = Math.max(maxY, f.y + f.h);
  }
  const cols = Math.ceil(maxX / cell);
  const rows = Math.ceil(maxY / cell);
  const walkable = new Uint8Array(cols * rows);
  const pads = def.obstacles.map((o) => ({ x: o.x - PAD_X, y: o.y - PAD_Y, w: o.w + PAD_X * 2, h: o.h + PAD_Y * 2 }));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell + cell / 2;
      const y = r * cell + cell / 2;
      if (def.floor.some((f) => inRect(x, y, f)) && !pads.some((o) => inRect(x, y, o))) walkable[r * cols + c] = 1;
    }
  }
  return { cols, rows, cell, walkable, blocked: pads };
}

const cellOf = (grid: Grid, p: Pt): [number, number] => [Math.floor(p.x / grid.cell), Math.floor(p.y / grid.cell)];

function cellOpen(grid: Grid, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.walkable[r * grid.cols + c] === 1;
}

const center = (grid: Grid, c: number, r: number): Pt => ({ x: c * grid.cell + grid.cell / 2, y: r * grid.cell + grid.cell / 2 });

/** Точка стоит на проходимой клетке и сама не заходит в поле вокруг мебели. */
export function isWalkable(grid: Grid, p: Pt): boolean {
  if (!(p.x >= 0 && p.y >= 0)) return false;
  const [c, r] = cellOf(grid, p);
  return cellOpen(grid, c, r) && !grid.blocked.some((o) => inRect(p.x, p.y, o));
}

/**
 * Сама точка, если проходима; иначе центр ближайшей проходимой клетки (null — идти некуда).
 * С `from` — только среди клеток, до которых можно дойти от `from` (та же связная область),
 * чтобы тап по мебели не выбрал отрезанный карман пола.
 */
export function nearestWalkable(grid: Grid, p: Pt, from?: Pt): Pt | null {
  let reach: Uint8Array | null = null;
  if (from) {
    const start = nearestWalkable(grid, from);
    if (!start) return null;
    reach = reachable(grid, start);
  }
  const ok = (c: number, r: number): boolean => grid.walkable[r * grid.cols + c] === 1 && (!reach || reach[r * grid.cols + c] === 1);
  if (isWalkable(grid, p)) {
    const [c, r] = cellOf(grid, p);
    if (ok(c, r)) return { x: p.x, y: p.y };
  }
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (!ok(c, r)) continue;
      const q = center(grid, c, r);
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}

/** Клетки, достижимые от проходимой точки (те же шаги, что у A*: 8 направлений без срезания углов). */
function reachable(grid: Grid, from: Pt): Uint8Array {
  const seen = new Uint8Array(grid.cols * grid.rows);
  const [sc, sr] = cellOf(grid, from);
  const stack = [sr * grid.cols + sc];
  seen[stack[0]] = 1;
  while (stack.length) {
    const cur = stack.pop()!;
    const cc = cur % grid.cols;
    const cr = (cur - cc) / grid.cols;
    for (const [dx, dy] of NEIGH) {
      const nc = cc + dx;
      const nr = cr + dy;
      if (!cellOpen(grid, nc, nr)) continue;
      if (dx && dy && (!cellOpen(grid, cc + dx, cr) || !cellOpen(grid, cc, cr + dy))) continue;
      const ni = nr * grid.cols + nc;
      if (seen[ni]) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return seen;
}

/** Прямая a→b целиком по проходимым клеткам (проверка с шагом в четверть клетки). */
function lineOfSight(grid: Grid, a: Pt, b: Pt): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / (grid.cell / 4)));
  for (let i = 0; i <= n; i++) {
    if (!isWalkable(grid, { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })) return false;
  }
  return true;
}

const NEIGH: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Путь от `from` к `to` в обход мебели: точки после старта, последняя — `to`
 * (или ближайшая к нему достижимая точка, если `to` в мебели, в стене или в отрезанном кармане).
 * [] — идти некуда.
 */
export function findPath(grid: Grid, from: Pt, to: Pt): Pt[] {
  const start = nearestWalkable(grid, from);
  if (!start) return [];
  const goal = nearestWalkable(grid, to, start);
  if (!goal) return [];
  const [sc, sr] = cellOf(grid, start);
  const [gc, gr] = cellOf(grid, goal);
  const n = grid.cols * grid.rows;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = []; // бинарная куча по f
  const f = new Float64Array(n).fill(Infinity);
  const h = (c: number, r: number): number => {
    const dx = Math.abs(c - gc);
    const dy = Math.abs(r - gr);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const push = (i: number): void => {
    open.push(i);
    let k = open.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[open[p]] <= f[open[k]]) break;
      [open[p], open[k]] = [open[k], open[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = open[0];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < open.length && f[open[l]] < f[open[m]]) m = l;
        if (r < open.length && f[open[r]] < f[open[m]]) m = r;
        if (m === k) break;
        [open[m], open[k]] = [open[k], open[m]];
        k = m;
      }
    }
    return top;
  };
  const si = sr * grid.cols + sc;
  const gi = gr * grid.cols + gc;
  g[si] = 0;
  f[si] = h(sc, sr);
  push(si);
  while (open.length) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === gi) break;
    closed[cur] = 1;
    const cc = cur % grid.cols;
    const cr = (cur - cc) / grid.cols;
    for (const [dx, dy, cost] of NEIGH) {
      const nc = cc + dx;
      const nr = cr + dy;
      if (!cellOpen(grid, nc, nr)) continue;
      // диагональ — только если обе соседние клетки свободны (не срезаем угол мебели)
      if (dx && dy && (!cellOpen(grid, cc + dx, cr) || !cellOpen(grid, cc, cr + dy))) continue;
      const ni = nr * grid.cols + nc;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        f[ni] = ng + h(nc, nr);
        came[ni] = cur;
        push(ni);
      }
    }
  }
  if (si !== gi && came[gi] < 0) return [];
  const cells: Pt[] = [];
  for (let i = gi; i !== si; i = came[i]) {
    const c = i % grid.cols;
    cells.push(center(grid, c, (i - c) / grid.cols));
  }
  cells.reverse();
  // концы — точные точки старта и цели, середина — центры клеток
  const raw = [start, ...cells.slice(0, -1), goal];
  // сглаживание: из каждой точки тянемся к самой дальней видимой
  const out: Pt[] = [];
  let a = 0;
  while (a < raw.length - 1) {
    let b = raw.length - 1;
    while (b > a + 1 && !lineOfSight(grid, raw[a], raw[b])) b--;
    out.push(raw[b]);
    a = b;
  }
  // старт был в мебели — сначала шаг на ближайшую проходимую точку
  if (start.x !== from.x || start.y !== from.y) out.unshift(start);
  return out;
}

export interface Walker {
  /** Текущая позиция (живой объект — не менять снаружи). */
  readonly pos: Pt;
  readonly dir: Dir;
  /** Изик сейчас идёт (по пути или от клавиш). */
  readonly moving: boolean;
  /** Идти по точкам (обычно результат findPath). Пустой массив — остановиться. */
  setPath(pts: readonly Pt[]): void;
  /** Ручной вектор (-1…1 по осям). Ненулевой вектор отменяет путь. */
  setInput(vec: Pt): void;
  /** Один шаг симуляции, dt — секунды (вызывать на фиксированном шаге). */
  step(dt: number): void;
  /** Поставить в точку без анимации (вход в комнату, перезагрузка). */
  place(p: Pt, dir?: Dir): void;
  /** Оставшиеся точки пути. */
  readonly path: readonly Pt[];
}

function dirOf(vx: number, vy: number, prev: Dir): Dir {
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) return prev;
  if (Math.abs(vx) > Math.abs(vy)) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}

export function createWalker(grid: Grid, spawn: Pt, opts: { speed?: number } = {}): Walker {
  const speed = opts.speed ?? WALK_SPEED;
  const pos: Pt = { x: spawn.x, y: spawn.y };
  let dir: Dir = 'down';
  let moving = false;
  let path: Pt[] = [];
  let input: Pt = { x: 0, y: 0 };

  const tryMove = (x: number, y: number): boolean => {
    if (!isWalkable(grid, { x, y })) return false;
    pos.x = x;
    pos.y = y;
    return true;
  };

  return {
    pos,
    get dir() {
      return dir;
    },
    get moving() {
      return moving;
    },
    get path() {
      return path;
    },
    setPath(pts) {
      path = pts.map((p) => ({ x: p.x, y: p.y }));
      input = { x: 0, y: 0 };
      moving = path.length > 0;
    },
    setInput(vec) {
      const x = Math.max(-1, Math.min(1, vec.x || 0));
      const y = Math.max(-1, Math.min(1, vec.y || 0));
      input = { x, y };
      if (x || y) path = [];
      else if (!path.length) moving = false;
    },
    place(p, d) {
      pos.x = p.x;
      pos.y = p.y;
      if (d) dir = d;
      path = [];
      input = { x: 0, y: 0 };
      moving = false;
    },
    step(dt) {
      if (input.x || input.y) {
        const len = Math.hypot(input.x, input.y);
        const vx = (input.x / len) * speed;
        const vy = (input.y / len) * speed;
        const sx = pos.x;
        const sy = pos.y;
        // скольжение вдоль стены: целиком → только по X → только по Y
        if (!tryMove(pos.x + vx * dt, pos.y + vy * dt)) {
          if (!(vx && tryMove(pos.x + vx * dt, pos.y))) {
            if (vy) tryMove(pos.x, pos.y + vy * dt);
          }
        }
        const mx = pos.x - sx;
        const my = pos.y - sy;
        moving = Math.abs(mx) + Math.abs(my) > 1e-6;
        dir = dirOf(moving ? mx : vx, moving ? my : vy, dir);
        return;
      }
      if (!path.length) {
        moving = false;
        return;
      }
      let budget = speed * dt;
      let vx = 0;
      let vy = 0;
      while (budget > 0 && path.length) {
        const t = path[0];
        const dx = t.x - pos.x;
        const dy = t.y - pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 1e-9) {
          vx = dx;
          vy = dy;
        }
        if (d <= budget) {
          pos.x = t.x;
          pos.y = t.y;
          budget -= d;
          path.shift();
        } else {
          pos.x += (dx / d) * budget;
          pos.y += (dy / d) * budget;
          budget = 0;
        }
      }
      dir = dirOf(vx, vy, dir);
      moving = path.length > 0;
    },
  };
}
