// Места монтирования экранов. Таски 03/04/05 заменяют заглушки вызовами
// mountQuestScreen / mountArcadeScreen / mountLeaderboardScreen (проводка — таск 05).
import type { Store } from '../core/state';
import type { ScreenName } from '../core/types';
import type { Sfx } from '../services/sfx';
import type { ScreenFactory } from './router';

/** Всё, что оболочка даёт экранам. Таск 05 расширяет (сервисы, мост, lastRun). */
export interface AppContext {
  root: HTMLElement;
  store: Store;
  sfx: Sfx;
  /** Навигация через охрану маршрутов роутера. */
  navigate(screen: ScreenName): void;
}

function placeholder(title: string): ScreenFactory<AppContext> {
  return (host) => {
    const box = document.createElement('div');
    box.className = 'ezq-placeholder';
    const h = document.createElement('div');
    h.className = 'ezq-placeholder__title';
    h.textContent = title;
    const p = document.createElement('div');
    p.className = 'ezq-placeholder__text';
    p.textContent = 'Экран скоро появится';
    box.append(h, p);
    host.appendChild(box);
    return { destroy: () => box.remove() };
  };
}

export const SCREENS: Record<ScreenName, ScreenFactory<AppContext>> = {
  quest: placeholder('Квест'),
  arcade: placeholder('Аркада'),
  leaderboard: placeholder('Рейтинг'),
};
