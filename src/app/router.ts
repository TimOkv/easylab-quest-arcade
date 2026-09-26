// Роутер экранов с охраной маршрутов (единственное место охраны, Решения §8).
import type { EasyQuestGameState, Store } from '../core/state';
import type { ScreenName } from '../core/types';

export interface ScreenHandle {
  destroy(): void;
}

/** Монтирует экран в `host` (пустой контейнер на весь корень). */
export type ScreenFactory<Ctx> = (host: HTMLElement, ctx: Ctx) => ScreenHandle;

export interface Router {
  go(screen: ScreenName): void;
  current(): ScreenName;
  destroy(): void;
}

/** Куда реально можно попасть: без пройденного квеста — только квест; после — квеста нет. */
export function resolveScreen(requested: ScreenName, state: EasyQuestGameState): ScreenName {
  if (!state.quest.isCompleted) return 'quest';
  return requested === 'quest' ? 'arcade' : requested;
}

/** Стартовый экран: при `quest.isCompleted` — аркада (R13), иначе квест. */
export function startScreen(state: EasyQuestGameState): ScreenName {
  return state.quest.isCompleted ? 'arcade' : 'quest';
}

export function createRouter<Ctx>(opts: {
  store: Store;
  host: HTMLElement;
  screens: Record<ScreenName, ScreenFactory<Ctx>>;
  ctx: Ctx;
}): Router {
  const { store, host, screens, ctx } = opts;
  let active: { name: ScreenName; handle: ScreenHandle; el: HTMLElement } | null = null;

  const show = (requested: ScreenName): void => {
    const name = resolveScreen(requested, store.get());
    if (active?.name === name) return;
    if (active) {
      active.handle.destroy();
      active.el.remove();
    }
    const el = document.createElement('div');
    el.className = `ezq-screen ezq-screen--${name}`;
    host.appendChild(el);
    active = { name, handle: { destroy() {} }, el };
    if (store.get().navigation.currentScreen !== name) {
      store.update((s) => {
        s.navigation.currentScreen = name;
      });
    }
    active.handle = screens[name](el, ctx);
  };

  // Квест, завершённый в другой вкладке, переводит эту в аркаду (история 16).
  // Локальное завершение не уводит с экрана квеста — там показывается триумф.
  const off = store.subscribe((state, _prev, source) => {
    if (source === 'external' && active && resolveScreen(active.name, state) !== active.name) {
      show(active.name);
    }
  });

  show(startScreen(store.get()));

  return {
    go: show,
    current: () => active?.name ?? startScreen(store.get()),
    destroy() {
      off();
      active?.handle.destroy();
      active?.el.remove();
      active = null;
    },
  };
}
