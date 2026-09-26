// Публичный вход модуля аркады.
export { mountArcadeScreen, recordRun, type ArcadeScreenDeps } from './screen';
export { createArcadeGame, newRunSeed, type ArcadeGame, type ArcadeGameOptions, type ArcadeStats } from './game';
export { createWorld, stepWorld, botInput, type World, type InputState } from './engine';
export { renderWorld } from './render';
export { buildSprites, drawCoinIcon, type SpriteSet } from './sprites';
