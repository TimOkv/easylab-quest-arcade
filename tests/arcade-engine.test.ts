import { describe, expect, it } from 'vitest';
import {
  createWorld,
  stepWorld,
  createLevelGen,
  nextPlatform,
  botInput,
  PK_MOVING,
  PK_VANISH,
  PK_STATIC,
  type InputState,
  type PlatformSpec,
  type World,
} from '../src/arcade/engine';

const DT = 1 / 60;
const NONE: InputState = { left: false, right: false };

/** Сценарий ввода: вправо первые 90 шагов, затем влево 60, затем без ввода. */
function scripted(step: number, out: InputState): InputState {
  out.right = step < 90;
  out.left = step >= 90 && step < 150;
  return out;
}

function snapshot(w: World) {
  const p = w.player;
  return {
    p: [p.x, p.y, p.vx, p.vy],
    score: w.score,
    jumps: w.jumps,
    cam: w.camY,
    plats: w.platforms.filter((q) => q.active).map((q) => [q.x, q.y, q.kind, q.spring, q.rocket, q.gone]),
  };
}

describe('arcade engine: детерминизм', () => {
  it('один сид и один ввод → одинаковый мир и траектория; другой сид → другой уровень', () => {
    const a = createWorld(12345);
    const b = createWorld(12345);
    const c = createWorld(777);
    const inp = { left: false, right: false };
    for (let i = 0; i < 600; i++) {
      stepWorld(a, scripted(i, inp), DT);
      stepWorld(b, scripted(i, inp), DT);
      stepWorld(c, scripted(i, inp), DT);
    }
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(snapshot(a).plats).not.toEqual(snapshot(c).plats);
  });
});

describe('arcade engine: столкновения', () => {
  it('котик на стартовом полу автоматически прыгает (≈950 px/с вверх)', () => {
    const w = createWorld(1);
    stepWorld(w, NONE, DT);
    expect(w.jumps).toBe(1);
    expect(w.player.vy).toBeCloseTo(950, 0);
  });

  it('при огромной скорости падения не проваливается сквозь платформу', () => {
    const w = createWorld(1);
    const floor = w.platforms.find((q) => q.active && q.y === 0)!;
    w.player.x = floor.x + 32;
    w.player.y = 200;
    w.player.vy = -30000; // 500 px за шаг — толще любой платформы
    stepWorld(w, NONE, DT);
    expect(w.player.y).toBe(0);
    expect(w.player.vy).toBeGreaterThan(0);
    expect(w.jumps).toBe(1);
  });

  it('при движении вверх проходит платформу насквозь (коллизия только при падении)', () => {
    const w = createWorld(1);
    const floor = w.platforms.find((q) => q.active && q.y === 0)!;
    w.player.x = floor.x + 32;
    w.player.y = -30;
    w.player.vy = 700;
    for (let i = 0; i < 6; i++) stepWorld(w, NONE, DT);
    expect(w.jumps).toBe(0);
    expect(w.player.y).toBeGreaterThan(0);
  });

  it('падение ниже камеры заканчивает забег', () => {
    const w = createWorld(1);
    w.player.x = 5; // мимо всех платформ стартового экрана? — уводим вниз напрямую
    w.player.y = -300;
    w.player.vy = -100;
    stepWorld(w, NONE, DT);
    expect(w.over).toBe(true);
  });
});

describe('arcade engine: wrap', () => {
  it('вылет за левый край → появление справа, за правый → слева', () => {
    const w = createWorld(1);
    w.player.x = 2;
    w.player.vx = -380;
    stepWorld(w, { left: true, right: false }, DT);
    expect(w.player.x).toBeGreaterThan(440);
    expect(w.player.x).toBeLessThan(450);

    w.player.x = 448;
    w.player.vx = 380;
    stepWorld(w, { left: false, right: true }, DT);
    expect(w.player.x).toBeGreaterThanOrEqual(0);
    expect(w.player.x).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------- генерация

function level(seed: number, untilY: number): PlatformSpec[] {
  const gen = createLevelGen(seed);
  const out: PlatformSpec[] = [];
  for (;;) {
    const s: PlatformSpec = { x: 0, y: 0, kind: PK_STATIC, vx: 0, spring: false, springOff: 0, rocket: false };
    nextPlatform(gen, s);
    if (s.y > untilY) return out;
    out.push(s);
  }
}

const SEEDS = Array.from({ length: 100 }, (_, i) => (i * 2654435761) >>> 0);
const JUMP_HEIGHT = 205; // спецификация §7: 950 px/с при 2200 px/с²

describe('arcade engine: сложность и проходимость', () => {
  it('пороги по высоте: до 1500 только статичные, исчезающие с 4000, пружины с 800, ракеты с 2000 не чаще 1 на 2500', () => {
    let moving = 0;
    let vanish = 0;
    let springs = 0;
    let rockets = 0;
    for (const seed of SEEDS) {
      const lv = level(seed, 20000);
      let lastRocket = -Infinity;
      for (const p of lv) {
        if (p.y < 1500) expect(p.kind, `seed ${seed} y ${p.y}`).toBe(PK_STATIC);
        if (p.kind === PK_VANISH) expect(p.y).toBeGreaterThanOrEqual(4000);
        if (p.spring) expect(p.y).toBeGreaterThanOrEqual(800);
        if (p.rocket) {
          expect(p.y).toBeGreaterThanOrEqual(2000);
          expect(p.y - lastRocket).toBeGreaterThanOrEqual(2500);
          lastRocket = p.y;
        }
        if (p.kind === PK_MOVING) moving++;
        if (p.kind === PK_VANISH) vanish++;
        if (p.spring) springs++;
        if (p.rocket) rockets++;
      }
    }
    expect(moving).toBeGreaterThan(0);
    expect(vanish).toBeGreaterThan(0);
    expect(springs).toBeGreaterThan(0);
    expect(rockets).toBeGreaterThan(0);
  });

  it('доли растут с высотой: движущихся до 40%, исчезающих до 30%', () => {
    let hi = 0;
    let hiMoving = 0;
    let hiVanish = 0;
    for (const seed of SEEDS) {
      for (const p of level(seed, 30000)) {
        if (p.y < 14000) continue;
        hi++;
        if (p.kind === PK_MOVING) hiMoving++;
        if (p.kind === PK_VANISH) hiVanish++;
      }
    }
    expect(hiMoving / hi).toBeGreaterThan(0.2);
    expect(hiMoving / hi).toBeLessThanOrEqual(0.4);
    expect(hiVanish / hi).toBeGreaterThan(0.15);
    expect(hiVanish / hi).toBeLessThanOrEqual(0.3);
  });

  it('проходимость на 100 сидах: зазор между неисчезающими опорами < 85% высоты прыжка, зазоры растут от ~70 до ~170', () => {
    for (const seed of SEEDS) {
      const solid = level(seed, 25000).filter((p) => p.kind !== PK_VANISH);
      for (let i = 1; i < solid.length; i++) {
        const gap = solid[i].y - solid[i - 1].y;
        expect(gap, `seed ${seed} y ${solid[i].y}`).toBeLessThan(0.85 * JUMP_HEIGHT);
        if (solid[i].y < 1000) expect(gap).toBeLessThan(100);
      }
      const high = solid.filter((p) => p.y > 20000);
      const avgHigh = (high[high.length - 1].y - high[0].y) / (high.length - 1);
      expect(avgHigh).toBeGreaterThan(140);
    }
  });
});

// ---------------------------------------------------------------- античит-бот

describe('arcade engine: честная игра укладывается в античит', () => {
  it('бот по лучшей траектории на 100 сидах: средняя скорость < 100 очков/с, и он реально поднимается', () => {
    const inp = { left: false, right: false };
    let tall = 0;
    let maxRate = 0;
    for (const seed of SEEDS) {
      const w = createWorld(seed);
      for (let i = 0; i < 60 * 90 && !w.over; i++) {
        botInput(w, inp);
        stepWorld(w, inp, DT);
      }
      if (w.time >= 5) {
        const rate = w.score / w.time;
        maxRate = Math.max(maxRate, rate);
        expect(rate, `seed ${seed}`).toBeLessThan(100);
      }
      if (w.score >= 1000) tall++;
    }
    expect(maxRate).toBeGreaterThan(20);
    expect(tall).toBeGreaterThanOrEqual(80);
  });
});

// ---------------------------------------------------------------- фиксированный шаг

import { advanceClock, createClock } from '../src/arcade/clock';

describe('arcade loop: аккумулятор фиксированного шага', () => {
  function runAt(hz: number, seconds: number) {
    const clock = createClock();
    const w = createWorld(4242);
    const inp = { left: false, right: false };
    const frameMs = 1000 / hz;
    let maxPerFrame = 0;
    let total = 0;
    let t = 0;
    for (let f = 0; f < Math.round(seconds * hz); f++) {
      t += frameMs;
      const steps = advanceClock(clock, frameMs);
      maxPerFrame = Math.max(maxPerFrame, steps);
      for (let s = 0; s < steps; s++) {
        // ввод зависит только от состояния мира — одинаков для всех частот
        botInput(w, inp);
        stepWorld(w, inp, DT);
        total++;
      }
    }
    expect(w.over).toBe(false);
    return { steps: total, maxPerFrame, snap: snapshot(w) };
  }

  it('на 30/60/120/144 Гц за 3 с физика делает 180 шагов и приходит в одно и то же состояние', () => {
    const r60 = runAt(60, 3);
    expect(r60.steps).toBe(180);
    for (const hz of [30, 120, 144]) {
      const r = runAt(hz, 3);
      expect(r.steps, `${hz} Гц`).toBe(180);
      expect(r.snap).toEqual(r60.snap);
    }
  });

  it('за один долгий кадр — не больше 5 шагов (без «спирали смерти»)', () => {
    const clock = createClock();
    expect(advanceClock(clock, 1000)).toBe(5);
    expect(advanceClock(clock, 1000 / 60)).toBe(1);
  });
});

// ---------------------------------------------------------------- бустеры (истории 53, 54)

/** Максимальная высота ног после отскока: шагаем, пока котик летит вверх. */
function apexAfterBounce(w: World): number {
  let apex = w.player.y;
  for (let i = 0; i < 600 && (w.jumps === 0 || w.player.vy > 0 || w.player.rocketT > 0); i++) {
    stepWorld(w, NONE, DT);
    apex = Math.max(apex, w.player.y);
  }
  return apex;
}

describe('arcade engine: пружина и ракета', () => {
  it('пружина подбрасывает в ~2.5 раза выше обычного прыжка (≈205 px → ≈512 px)', () => {
    const plain = createWorld(1);
    const plainApex = apexAfterBounce(plain);

    const w = createWorld(1);
    const floor = w.platforms.find((q) => q.active && q.y === 0)!;
    floor.spring = true;
    floor.springOff = 22;
    w.player.x = floor.x + 22 + 10; // центр пружины 20 px
    w.player.y = 40;
    w.player.vy = -10;
    const springTop = 10;
    const apex = apexAfterBounce(w) - springTop;

    expect(plainApex).toBeGreaterThan(195);
    expect(plainApex).toBeLessThan(215);
    expect(apex / plainApex).toBeGreaterThan(2.35);
    expect(apex / plainApex).toBeLessThan(2.65);
  });

  it('ракета: 2 с полёта вверх с постоянной скоростью ≈ 900 px/с (≈1800 px), затем снова гравитация', () => {
    const w = createWorld(1);
    const floor = w.platforms.find((q) => q.active && q.y === 0)!;
    floor.rocket = true;
    w.player.x = floor.x + 32;
    w.player.y = 20;
    w.player.vy = 0;
    stepWorld(w, NONE, DT); // касание ракеты
    expect(w.player.rocketT).toBeGreaterThan(1.9);
    const y0 = w.player.y;
    const perStep: number[] = [];
    for (let i = 0; i < 119; i++) {
      const before = w.player.y;
      stepWorld(w, NONE, DT);
      perStep.push(w.player.y - before);
    }
    for (const d of perStep) expect(d).toBeCloseTo(15, 5);
    expect(w.player.y - y0).toBeGreaterThan(1750);
    expect(w.player.y - y0).toBeLessThan(1800);
    for (let i = 0; i < 5; i++) stepWorld(w, NONE, DT);
    expect(w.player.rocketT).toBe(0);
    expect(w.player.vy).toBeLessThan(900);
  });
});
