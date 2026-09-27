// Места монтирования экранов: квест, аркада, рейтинг. Проводка сервисов — в app.ts, здесь только
// переходы между экранами через ctx (охрана маршрутов — в роутере).
import type { Store } from '../core/state';
import type { LeaderboardService, RunResult, ScreenName, SubmitOutcome } from '../core/types';
import type { Sfx } from '../services/sfx';
import type { Music } from '../services/music';
import type { Bridge } from '../services/bridge';
import type { CuratorSync } from '../core/types';
import type { QuestController } from '../quest/controller';
import { mountQuestScreen } from '../quest/screen';
import { mountArcadeScreen } from '../arcade';
import { mountLeaderboardScreen } from '../leaderboard';
import type { ScreenFactory } from './router';

export interface LastRunSlot {
  result: RunResult;
  submit: Promise<SubmitOutcome>;
}

/** Всё, что оболочка даёт экранам. */
export interface AppContext {
  root: HTMLElement;
  store: Store;
  sfx: Sfx;
  /** Фоновая 8-бит музыка (общий AudioContext с sfx). Экран сам выбирает тему и приглушение. */
  music: Music;
  /** Навигация через охрану маршрутов роутера. */
  navigate(screen: ScreenName): void;
  controller: QuestController;
  curator: CuratorSync;
  leaderboard: LeaderboardService;
  bridge: Bridge;
  /** false — Supabase не настроен (демо-режим). */
  isServerConfigured: boolean;
  /** Забег, после которого открыт рейтинг; null — рейтинг открыт из профиля. */
  lastRun: LastRunSlot | null;
  /** «Ещё раз» на рейтинге: аркада сразу начинает забег. */
  autoStart: boolean;
  /** Свежесть «Сегодня в рейтинг» за сессию (сохранённое значение может быть вчерашним по МСК). */
  dailyLimit: { isFresh(): boolean; refresh(): Promise<unknown> };
  /** Game over: отправка в рейтинг, EASYLAB_GAME_FINISHED, переход на рейтинг. */
  onGameOver(result: RunResult): void;
}

export const SCREENS: Record<ScreenName, ScreenFactory<AppContext>> = {
  quest: (host, ctx) =>
    mountQuestScreen(host, {
      store: ctx.store,
      sfx: ctx.sfx,
      controller: ctx.controller,
      music: ctx.music,
      isServerConfigured: ctx.isServerConfigured,
      onGoToArcade: () => ctx.navigate('arcade'),
    }),
  arcade: (host, ctx) => {
    const autoStart = ctx.autoStart;
    ctx.autoStart = false;
    return mountArcadeScreen(host, {
      store: ctx.store,
      sfx: ctx.sfx,
      music: ctx.music,
      autoStart,
      dailyLimit: ctx.isServerConfigured ? ctx.dailyLimit : undefined,
      onGameOver: (r) => ctx.onGameOver(r),
      onOpenLeaderboard: () => {
        ctx.lastRun = null;
        ctx.navigate('leaderboard');
      },
    });
  },
  leaderboard: (host, ctx) =>
    mountLeaderboardScreen(host, {
      store: ctx.store,
      sfx: ctx.sfx,
      music: ctx.music,
      service: ctx.leaderboard,
      lastRun: ctx.lastRun,
      onPlayAgain: () => {
        ctx.autoStart = true;
        ctx.navigate('arcade');
      },
      onBack: () => ctx.navigate('arcade'),
    }),
};
