// Часы фиксированного шага переехали в src/core/clock.ts (общие с ходьбой квеста).
// Здесь — прежние имена для аркады и её тестов.

export { advanceClock, clockAlpha, createFixedClock as createClock, MAX_STEPS_PER_FRAME } from '../core/clock';
export type { FixedClock } from '../core/clock';
