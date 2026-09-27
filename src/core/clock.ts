// Аккумулятор фиксированного шага (общий для аркады и ходьбы в квесте): сколько шагов
// симуляции сделать за кадр, чтобы скорость не зависела от частоты кадров (60/120 Гц, слабый телефон).

/** Фиксированный шаг по умолчанию: 1/60 с (16.6 мс). */
export const STEP_MS = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export interface FixedClock {
  acc: number; // накопленные мс
  readonly stepMs: number;
}

export const createFixedClock = (stepMs: number = STEP_MS): FixedClock => ({ acc: 0, stepMs });

/**
 * Добавляет длительность кадра и возвращает число шагов (≤ 5). Лишнее при перегрузке
 * отбрасывается, чтобы не уйти в «спираль смерти». Остаток — в `clock.acc` (для alpha).
 */
export function advanceClock(clock: FixedClock, frameMs: number): number {
  const step = clock.stepMs;
  clock.acc += frameMs > 0 ? frameMs : 0;
  let steps = 0;
  // эпсилон гасит накопленную ошибку плавающей точки (6.944… × 12 ≠ 83.333…)
  while (clock.acc + 1e-6 >= step && steps < MAX_STEPS_PER_FRAME) {
    clock.acc -= step;
    steps++;
  }
  if (clock.acc + 1e-6 >= step) clock.acc = 0;
  if (clock.acc < 0) clock.acc = 0;
  return steps;
}

/** Доля до следующего шага — для интерполяции отрисовки. */
export const clockAlpha = (clock: FixedClock): number => Math.min(1, clock.acc / clock.stepMs);
