// Аккумулятор фиксированного шага: сколько шагов физики сделать за кадр.

import { STEP_MS } from './engine';

export const MAX_STEPS_PER_FRAME = 5;

export interface FixedClock {
  acc: number; // накопленные мс
}

export const createClock = (): FixedClock => ({ acc: 0 });

/**
 * Добавляет длительность кадра и возвращает число шагов (≤ 5). Лишнее при перегрузке
 * отбрасывается, чтобы не уйти в «спираль смерти». Остаток — в `clock.acc` (для alpha).
 */
export function advanceClock(clock: FixedClock, frameMs: number): number {
  clock.acc += frameMs > 0 ? frameMs : 0;
  let steps = 0;
  // эпсилон гасит накопленную ошибку плавающей точки (6.944… × 12 ≠ 83.333…)
  while (clock.acc + 1e-6 >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    clock.acc -= STEP_MS;
    steps++;
  }
  if (clock.acc + 1e-6 >= STEP_MS) clock.acc = 0;
  if (clock.acc < 0) clock.acc = 0;
  return steps;
}

/** Доля до следующего шага — для интерполяции отрисовки. */
export const clockAlpha = (clock: FixedClock): number => Math.min(1, clock.acc / STEP_MS);
