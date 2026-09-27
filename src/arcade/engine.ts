// Симуляция Endless Arcade: чистая детерминированная физика и процедурная генерация.
// Мир в координатах «вверх — плюс»: y — высота над стартовым полом (у игрока — ноги, у платформы — верх).
// Горячий путь (stepWorld) не аллоцирует: платформы и частицы живут в пулах.

// ---------------------------------------------------------------- константы

export const VIEW_W = 450;
export const VIEW_H = 800;
/** Фиксированный шаг физики: 1/60 с (16.6 мс). */
export const STEP_S = 1 / 60;
export { STEP_MS } from '../core/clock';

export const GRAVITY = 2200; // px/с²
export const JUMP_V = 950; // px/с → высота прыжка ≈ 205 px
export const SPRING_V = JUMP_V * Math.sqrt(2.5); // прыжок в 2.5 раза выше
export const ROCKET_V = 900; // px/с, постоянная скорость полёта
export const ROCKET_TIME = 2; // с
export const MAX_VX = 380;
export const ACCEL_X = 2600;
export const FRICTION_X = 2200;

export const PLAT_W = 64;
export const PLAT_H = 14;
export const CAT_HALF_W = 15; // полуширина хитбокса котика
export const CAT_H = 54;
export const SPRING_W = 20;
export const SPRING_H = 10;
export const ROCKET_W = 24;
export const ROCKET_H = 40;

/** Ноги котика не поднимаются выше этой отметки над низом экрана — дальше едет камера. */
export const CAMERA_LINE = 440;
/** Насколько котик должен уйти под нижний край, чтобы забег закончился. */
export const FALL_OUT = CAT_H + 16;

export const MIN_GAP = 70;
export const MAX_GAP = 170;
export const MOVING_FROM = 1500;
export const VANISH_FROM = 4000;
export const SPRING_FROM = 800;
export const ROCKET_FROM = 2000;
export const ROCKET_EVERY = 2500;
export const POOL_SIZE = 64;
export const PARTICLE_POOL = 48;

export const PK_STATIC = 0;
export const PK_MOVING = 1;
export const PK_VANISH = 2;
export type PlatformKind = typeof PK_STATIC | typeof PK_MOVING | typeof PK_VANISH;

/** Биты `world.events` (накапливаются шагами; потребитель обнуляет сам). */
export const EV_JUMP = 1;
export const EV_SPRING = 2;
export const EV_ROCKET = 4;
export const EV_GAMEOVER = 8;
export const EV_NEW_RECORD = 16;

// ---------------------------------------------------------------- типы

export interface InputState {
  left: boolean;
  right: boolean;
}

export interface Rng {
  s: number;
}

export interface PlatformSpec {
  x: number;
  y: number;
  kind: PlatformKind;
  vx: number;
  spring: boolean;
  springOff: number;
  rocket: boolean;
}

export interface LevelGen {
  rng: Rng;
  started: boolean;
  lastY: number;
  lastCx: number;
  lastRocketY: number;
  pending: PlatformSpec;
  hasPending: boolean;
}

export interface Platform extends PlatformSpec {
  active: boolean;
  prevX: number;
  springT: number; // > 0 — пружина сжата (анимация)
  rocketTaken: boolean;
  gone: boolean; // исчезающая уже использована
  fadeT: number; // 1 → 0 после исчезновения
}

export interface Particle {
  life: number; // 0 — свободна
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Player {
  x: number; // центр
  y: number; // ноги
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  rocketT: number;
}

export interface World {
  seed: number;
  gen: LevelGen;
  spec: PlatformSpec;
  specReady: boolean;
  time: number;
  steps: number;
  jumps: number;
  maxHeight: number;
  score: number;
  camY: number; // высота нижнего края экрана
  prevCamY: number;
  over: boolean;
  overT: number;
  recordPx: number;
  recordBeaten: boolean;
  newRecordT: number;
  events: number;
  player: Player;
  platforms: Platform[];
  particles: Particle[];
  fxRng: Rng;
}

export interface WorldOptions {
  /** Рекорд игрока в очках — для линии «Твой рекорд» и вспышки «Новый рекорд!». */
  recordScore?: number;
}

// ---------------------------------------------------------------- утилиты

/** mulberry32 на изменяемом состоянии (без замыканий и аллокаций). */
export function rngNext(r: Rng): number {
  let t = (r.s = (r.s + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Кратчайшее знаковое смещение от a до b по горизонтали с учётом wrap. */
export function wrapDelta(a: number, b: number): number {
  let d = b - a;
  if (d > VIEW_W / 2) d -= VIEW_W;
  else if (d < -VIEW_W / 2) d += VIEW_W;
  return d;
}

/** Очки — только за высоту. */
export const scoreForHeight = (px: number): number => Math.floor(px / 10);

// ---------------------------------------------------------------- генерация

const emptySpec = (): PlatformSpec => ({ x: 0, y: 0, kind: PK_STATIC, vx: 0, spring: false, springOff: 0, rocket: false });

function copySpec(from: PlatformSpec, to: PlatformSpec): void {
  to.x = from.x;
  to.y = from.y;
  to.kind = from.kind;
  to.vx = from.vx;
  to.spring = from.spring;
  to.springOff = from.springOff;
  to.rocket = from.rocket;
}

export function createLevelGen(seed: number): LevelGen {
  return { rng: { s: seed | 0 }, started: false, lastY: 0, lastCx: VIEW_W / 2, lastRocketY: -Infinity, pending: emptySpec(), hasPending: false };
}

/**
 * Следующая платформа уровня (по возрастанию высоты). «Цепочка» — статичные/движущиеся опоры
 * с зазором < 85% высоты прыжка; исчезающие — дополнительные, между звеньями цепочки.
 */
export function nextPlatform(gen: LevelGen, out: PlatformSpec): void {
  if (!gen.started) {
    gen.started = true;
    out.x = (VIEW_W - PLAT_W) / 2;
    out.y = 0;
    out.kind = PK_STATIC;
    out.vx = 0;
    out.spring = false;
    out.springOff = 0;
    out.rocket = false;
    return;
  }
  if (gen.hasPending) {
    gen.hasPending = false;
    copySpec(gen.pending, out);
    return;
  }
  const r = gen.rng;
  const h = gen.lastY;
  const t = clamp01(h / 12000);
  const gap = Math.min(MAX_GAP, MIN_GAP + 80 * t + rngNext(r) * 20 * (0.5 + t));
  const y = h + gap;

  let cx = gen.lastCx + (rngNext(r) * 2 - 1) * 140;
  if (cx < 0) cx += VIEW_W;
  else if (cx >= VIEW_W) cx -= VIEW_W;
  if (cx < PLAT_W / 2) cx = PLAT_W / 2;
  else if (cx > VIEW_W - PLAT_W / 2) cx = VIEW_W - PLAT_W / 2;

  const c = gen.pending;
  c.x = cx - PLAT_W / 2;
  c.y = y;
  c.kind = PK_STATIC;
  c.vx = 0;
  c.spring = false;
  c.springOff = 0;
  c.rocket = false;
  const kindRoll = rngNext(r);
  const dirRoll = rngNext(r);
  const speedRoll = rngNext(r);
  if (y >= MOVING_FROM) {
    const k = clamp01((y - MOVING_FROM) / 8000);
    if (kindRoll < 0.1 + 0.3 * k) {
      c.kind = PK_MOVING;
      c.vx = (dirRoll < 0.5 ? -1 : 1) * (50 + 60 * k + speedRoll * 40);
    }
  }
  const springRoll = rngNext(r);
  const offRoll = rngNext(r);
  const rocketRoll = rngNext(r);
  if (c.kind === PK_STATIC) {
    if (y >= SPRING_FROM && springRoll < 0.08) {
      c.spring = true;
      c.springOff = 6 + offRoll * (PLAT_W - SPRING_W - 12);
    } else if (y >= ROCKET_FROM && y - gen.lastRocketY >= ROCKET_EVERY && rocketRoll < 0.15) {
      c.rocket = true;
      gen.lastRocketY = y;
    }
  }
  gen.lastY = y;
  gen.lastCx = cx;

  const extraRoll = rngNext(r);
  const extraYRoll = rngNext(r);
  const extraXRoll = rngNext(r);
  const ey = h + gap * (0.35 + extraYRoll * 0.3);
  const p = 0.15 + 0.25 * clamp01((ey - VANISH_FROM) / 8000);
  if (ey >= VANISH_FROM && extraRoll < p) {
    out.x = extraXRoll * (VIEW_W - PLAT_W);
    out.y = ey;
    out.kind = PK_VANISH;
    out.vx = 0;
    out.spring = false;
    out.springOff = 0;
    out.rocket = false;
    gen.hasPending = true;
    return;
  }
  copySpec(c, out);
}

// ---------------------------------------------------------------- мир

export function createWorld(seed: number, opts: WorldOptions = {}): World {
  const platforms: Platform[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    platforms.push({ ...emptySpec(), active: false, prevX: 0, springT: 0, rocketTaken: false, gone: false, fadeT: 0 });
  }
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_POOL; i++) particles.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0 });
  const recordPx = Math.max(0, (opts.recordScore ?? 0) * 10);
  const w: World = {
    seed,
    gen: createLevelGen(seed),
    spec: emptySpec(),
    specReady: false,
    time: 0,
    steps: 0,
    jumps: 0,
    maxHeight: 0,
    score: 0,
    camY: -120,
    prevCamY: -120,
    over: false,
    overT: 0,
    recordPx,
    recordBeaten: false,
    newRecordT: 0,
    events: 0,
    player: { x: VIEW_W / 2, y: 0, prevX: VIEW_W / 2, prevY: 0, vx: 0, vy: 0, facing: 1, rocketT: 0 },
    platforms,
    particles,
    fxRng: { s: (seed ^ 0x5bd1e995) | 0 },
  };
  fillPlatforms(w);
  return w;
}

function fillPlatforms(w: World): void {
  const limit = w.camY + VIEW_H + 160;
  for (;;) {
    if (!w.specReady) {
      nextPlatform(w.gen, w.spec);
      w.specReady = true;
    }
    if (w.spec.y > limit) return;
    let slot: Platform | null = null;
    for (let i = 0; i < w.platforms.length; i++) {
      if (!w.platforms[i].active) {
        slot = w.platforms[i];
        break;
      }
    }
    if (!slot) return; // пул полон — догенерируем, когда освободится
    copySpec(w.spec, slot);
    slot.active = true;
    slot.prevX = slot.x;
    slot.springT = 0;
    slot.rocketTaken = false;
    slot.gone = false;
    slot.fadeT = 0;
    w.specReady = false;
  }
}

function spawnFlame(w: World): void {
  const p = w.player;
  for (let n = 0, i = 0; i < w.particles.length && n < 2; i++) {
    const q = w.particles[i];
    if (q.life > 0) continue;
    q.life = 0.45;
    q.x = p.x + (rngNext(w.fxRng) - 0.5) * 12;
    q.y = p.y + 4;
    q.vx = (rngNext(w.fxRng) - 0.5) * 90;
    q.vy = -220 - rngNext(w.fxRng) * 160;
    n++;
  }
}

/** Один шаг физики длиной dt (игровой цикл всегда передаёт STEP_S). */
export function stepWorld(w: World, input: InputState, dt: number): void {
  const p = w.player;
  p.prevX = p.x;
  p.prevY = p.y;
  w.prevCamY = w.camY;

  for (let i = 0; i < w.particles.length; i++) {
    const q = w.particles[i];
    if (q.life <= 0) continue;
    q.life -= dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }

  if (w.over) {
    // Анимация падения после проигрыша: только гравитация.
    w.overT += dt;
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    return;
  }

  w.time += dt;
  w.steps++;

  // --- горизонталь
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    p.vx += dir * ACCEL_X * dt;
    if (p.vx > MAX_VX) p.vx = MAX_VX;
    else if (p.vx < -MAX_VX) p.vx = -MAX_VX;
    p.facing = dir > 0 ? 1 : -1;
  } else if (p.vx > 0) {
    p.vx = Math.max(0, p.vx - FRICTION_X * dt);
  } else if (p.vx < 0) {
    p.vx = Math.min(0, p.vx + FRICTION_X * dt);
  }
  p.x += p.vx * dt;
  if (p.x < 0) p.x += VIEW_W;
  else if (p.x >= VIEW_W) p.x -= VIEW_W;

  // --- вертикаль
  if (p.rocketT > 0) {
    p.vy = ROCKET_V;
    p.y += p.vy * dt;
    p.rocketT -= dt;
    if (p.rocketT < 0) p.rocketT = 0;
    spawnFlame(w);
  } else {
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
  }

  // --- платформы
  for (let i = 0; i < w.platforms.length; i++) {
    const pl = w.platforms[i];
    if (!pl.active) continue;
    pl.prevX = pl.x;
    if (pl.kind === PK_MOVING) {
      pl.x += pl.vx * dt;
      if (pl.x < 0) {
        pl.x = -pl.x;
        pl.vx = -pl.vx;
      } else if (pl.x > VIEW_W - PLAT_W) {
        pl.x = 2 * (VIEW_W - PLAT_W) - pl.x;
        pl.vx = -pl.vx;
      }
    }
    if (pl.springT > 0) pl.springT = Math.max(0, pl.springT - dt);
    if (pl.gone && pl.fadeT > 0) pl.fadeT = Math.max(0, pl.fadeT - dt * 2.5);
  }

  // --- приземление: только при падении, с проверкой пересечения между шагами
  if (p.vy < 0 && p.rocketT === 0) {
    let hit: Platform | null = null;
    let hitTop = -Infinity;
    let hitSpring = false;
    for (let i = 0; i < w.platforms.length; i++) {
      const pl = w.platforms[i];
      if (!pl.active || pl.gone) continue;
      if (pl.spring) {
        const sTop = pl.y + SPRING_H;
        const sdx = wrapDelta(p.x, pl.x + pl.springOff + SPRING_W / 2);
        if (p.prevY >= sTop && p.y <= sTop && Math.abs(sdx) < SPRING_W / 2 + CAT_HALF_W - 4 && sTop > hitTop) {
          hit = pl;
          hitTop = sTop;
          hitSpring = true;
          continue;
        }
      }
      const top = pl.y;
      if (p.prevY >= top && p.y <= top && top > hitTop) {
        const dx = wrapDelta(p.x, pl.x + PLAT_W / 2);
        if (Math.abs(dx) < PLAT_W / 2 + CAT_HALF_W) {
          hit = pl;
          hitTop = top;
          hitSpring = false;
        }
      }
    }
    if (hit) {
      p.y = hitTop;
      w.jumps++;
      if (hitSpring) {
        p.vy = SPRING_V;
        hit.springT = 0.25;
        w.events |= EV_SPRING;
      } else {
        p.vy = JUMP_V;
        w.events |= EV_JUMP;
      }
      if (hit.kind === PK_VANISH) {
        hit.gone = true;
        hit.fadeT = 1;
      }
    }
  }

  // --- ракета
  if (p.rocketT === 0) {
    for (let i = 0; i < w.platforms.length; i++) {
      const pl = w.platforms[i];
      if (!pl.active || !pl.rocket || pl.rocketTaken) continue;
      const dx = wrapDelta(p.x, pl.x + PLAT_W / 2);
      const rcy = pl.y + ROCKET_H / 2;
      const pcy = p.y + CAT_H / 2;
      if (Math.abs(dx) < ROCKET_W / 2 + CAT_HALF_W && Math.abs(pcy - rcy) < ROCKET_H / 2 + CAT_H / 2) {
        pl.rocketTaken = true;
        p.rocketT = ROCKET_TIME;
        p.vy = ROCKET_V;
        w.events |= EV_ROCKET;
        break;
      }
    }
  }

  // --- высота и очки
  if (p.y > w.maxHeight) {
    w.maxHeight = p.y;
    w.score = scoreForHeight(w.maxHeight);
    if (w.recordPx > 0 && !w.recordBeaten && w.maxHeight > w.recordPx) {
      w.recordBeaten = true;
      w.newRecordT = 1.8;
      w.events |= EV_NEW_RECORD;
    }
  }
  if (w.newRecordT > 0) w.newRecordT = Math.max(0, w.newRecordT - dt);

  // --- камера только вверх
  if (p.y - w.camY > CAMERA_LINE) w.camY = p.y - CAMERA_LINE;

  // --- пул: убрать ушедшие вниз, догенерировать сверху
  for (let i = 0; i < w.platforms.length; i++) {
    const pl = w.platforms[i];
    if (pl.active && pl.y < w.camY - 60) pl.active = false;
  }
  fillPlatforms(w);

  // --- конец забега
  if (p.y < w.camY - FALL_OUT) {
    w.over = true;
    w.events |= EV_GAMEOVER;
  }
}

/** Итоговые числа забега (длительность — по шагам симуляции, не по часам). */
export function runStats(w: World): { score: number; durationSeconds: number; jumpsCount: number; heightPx: number } {
  return {
    score: w.score,
    durationSeconds: Math.round(w.time * 100) / 100,
    jumpsCount: w.jumps,
    heightPx: Math.floor(w.maxHeight),
  };
}

// ---------------------------------------------------------------- бот «лучшей траектории»

/**
 * Жадный бот: из платформ, до которых дотягивается текущая дуга, выбирает самую высокую
 * (пружины и ракеты — с бонусом) и рулит к ней. Нужен античит-тесту и замеру FPS.
 */
export function botInput(w: World, out: InputState): void {
  out.left = false;
  out.right = false;
  const p = w.player;
  if (p.rocketT > 0 || w.over) return;
  const reachTop = p.vy > 0 ? p.y + (p.vy * p.vy) / (2 * GRAVITY) : p.y;
  let bestScore = -Infinity;
  let bestCx = 0;
  let bestT = 0;
  for (let i = 0; i < w.platforms.length; i++) {
    const pl = w.platforms[i];
    if (!pl.active || pl.gone) continue;
    const top = pl.y;
    if (top > reachTop - 2) continue;
    const disc = p.vy * p.vy + 2 * GRAVITY * (p.y - top);
    if (disc < 0) continue;
    const t = (p.vy + Math.sqrt(disc)) / GRAVITY;
    let cx = pl.x + PLAT_W / 2 + pl.vx * t;
    if (cx < PLAT_W / 2) cx = PLAT_W / 2;
    else if (cx > VIEW_W - PLAT_W / 2) cx = VIEW_W - PLAT_W / 2;
    if (pl.spring) cx = pl.x + pl.springOff + SPRING_W / 2;
    const dist = Math.abs(wrapDelta(p.x, cx)) - (PLAT_W / 2 + CAT_HALF_W - 8);
    if (dist > MAX_VX * t * 0.85) continue;
    let score = top;
    // бонусы — только тем, что не ниже текущей высоты (иначе бот «ныряет» к пружине внизу)
    if (top > p.y - 40) {
      if (pl.spring) score += 350;
      if (pl.rocket && !pl.rocketTaken) score += 2000;
    }
    if (pl.kind === PK_VANISH) score -= 5;
    if (score > bestScore) {
      bestScore = score;
      bestCx = cx;
      bestT = t;
    }
  }
  if (bestScore === -Infinity) return;
  const dx = wrapDelta(p.x, bestCx);
  let desired = dx / Math.max(bestT, 0.05);
  if (desired > MAX_VX) desired = MAX_VX;
  else if (desired < -MAX_VX) desired = -MAX_VX;
  if (desired > p.vx + 15) out.right = true;
  else if (desired < p.vx - 15) out.left = true;
}
