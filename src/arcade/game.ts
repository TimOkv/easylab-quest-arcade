// Игровой цикл аркады: rAF + аккумулятор фиксированного шага, интерполяция, звуки, game over.

import type { RunResult } from '../core/types';
import type { SfxName } from '../services/sfx';
import { advanceClock, clockAlpha, createFixedClock as createClock } from '../core/clock';
import {
  createWorld,
  runStats,
  stepWorld,
  EV_GAMEOVER,
  EV_JUMP,
  EV_ROCKET,
  EV_SPRING,
  STEP_S,
  VIEW_H,
  VIEW_W,
  type InputState,
  type World,
} from './engine';
import { renderWorld, type RenderExtras } from './render';
import { buildSprites, type SpriteSet } from './sprites';
import { newUuid } from '../core/state';

export interface ArcadeGameOptions {
  highScore: number;
  onGameOver(result: RunResult): void;
  /** Звук (mute решает сам sfx). */
  sfx?: { play(name: SfxName): void };
  /** Источник ввода: заполняет out каждый шаг. */
  readInput?(world: World, out: InputState): void;
  seed?: number;
  sprites?: SpriteSet;
  /** Сколько длится анимация падения до onGameOver, мс. */
  fallAnimMs?: number;
}

export interface ArcadeStats {
  frames: number;
  fps: number;
  /** Среднее время stepWorld+renderWorld за кадр, мс. */
  avgWorkMs: number;
}

export interface ArcadeGame {
  start(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  isRunning(): boolean;
  isPaused(): boolean;
  world(): World;
  stats(): ArcadeStats;
  resetStats(): void;
  /** Плотность backing store: devicePixelRatio × масштаб сцены. */
  setPixelRatio(k: number): void;
}

export function newRunSeed(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** UUID v4 забега — общий генератор `core/state` (randomUUID или getRandomValues по RFC 4122). */
export const newRunId = newUuid;

let sharedSprites: SpriteSet | null = null;
export function getSprites(): SpriteSet {
  return (sharedSprites ??= buildSprites());
}

const NO_EXTRAS: RenderExtras = {};
const FALL_EXTRAS: RenderExtras = { banner: 'Упс!' };

export function createArcadeGame(canvas: HTMLCanvasElement, opts: ArcadeGameOptions): ArcadeGame {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas 2d недоступен');
  const sprites = opts.sprites ?? getSprites();
  const seed = opts.seed ?? newRunSeed();
  const world = createWorld(seed, { recordScore: opts.highScore });
  const input: InputState = { left: false, right: false };
  const clock = createClock();
  const fallMs = opts.fallAnimMs ?? 900;

  let raf = 0;
  let running = false;
  let started = false;
  let finished = false;
  let destroyed = false;
  let last = 0;
  let overAt = -1;
  let k = 1;

  let frames = 0;
  let workSum = 0;
  let firstT = 0;
  let lastT = 0;

  const draw = (alpha: number): void => {
    renderWorld(ctx, world, alpha, sprites, world.over ? FALL_EXTRAS : NO_EXTRAS);
  };

  const playEvents = (): void => {
    const ev = world.events;
    if (!ev) return;
    world.events = 0;
    if (!opts.sfx) return;
    if (ev & EV_GAMEOVER) opts.sfx.play('gameover');
    else if (ev & EV_ROCKET) opts.sfx.play('rocket');
    else if (ev & EV_SPRING) opts.sfx.play('spring');
    else if (ev & EV_JUMP) opts.sfx.play('jump');
  };

  const finish = (): void => {
    finished = true;
    running = false;
    cancelAnimationFrame(raf);
    const st = runStats(world);
    const result: RunResult = {
      runId: newRunId(),
      score: st.score,
      durationSeconds: st.durationSeconds,
      jumpsCount: st.jumpsCount,
      seed,
      heightPx: st.heightPx,
      isNewRecord: st.score > opts.highScore && st.score > 0,
    };
    opts.onGameOver(result);
  };

  const frame = (now: number): void => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250;
    const t0 = performance.now();
    const n = advanceClock(clock, dt);
    for (let i = 0; i < n; i++) {
      if (!world.over && opts.readInput) opts.readInput(world, input);
      stepWorld(world, input, STEP_S);
    }
    draw(clockAlpha(clock));
    const t1 = performance.now();
    if (frames === 0) firstT = t1;
    frames++;
    workSum += t1 - t0;
    lastT = t1;
    playEvents();
    if (world.over) {
      if (overAt < 0) overAt = now;
      else if (now - overAt >= fallMs) finish();
    }
  };

  const loop = (): void => {
    if (running || finished || destroyed) return;
    running = true;
    clock.acc = 0;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const setPixelRatio = (next: number): void => {
    k = Math.max(0.5, Math.min(3, next));
    canvas.width = Math.round(VIEW_W * k);
    canvas.height = Math.round(VIEW_H * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (!running) draw(clockAlpha(clock));
  };
  setPixelRatio(k);

  return {
    start() {
      if (started) return;
      started = true;
      loop();
    },
    pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      input.left = input.right = false;
    },
    resume() {
      if (started) loop();
    },
    destroy() {
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
    },
    isRunning: () => running,
    isPaused: () => started && !running && !finished && !destroyed,
    world: () => world,
    stats: () => ({
      frames,
      fps: frames > 1 && lastT > firstT ? ((frames - 1) * 1000) / (lastT - firstT) : 0,
      avgWorkMs: frames ? workSum / frames : 0,
    }),
    resetStats() {
      frames = 0;
      workSum = 0;
    },
    setPixelRatio,
  };
}
