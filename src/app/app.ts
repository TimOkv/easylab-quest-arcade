// Оболочка модуля: корень .ezq-root, safe-area, блокировка жестов, store, звук, роутер.
import { createStore, type Store } from '../core/state';
import { createSfx, type Sfx } from '../services/sfx';
import { blockGestures } from './shell';
import { createRouter, type Router } from './router';
import { SCREENS, type AppContext } from './screens';

export interface AppHandle {
  store: Store;
  sfx: Sfx;
  router: Router;
  destroy(): void;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function mountApp(rootEl: HTMLElement): AppHandle {
  rootEl.classList.add('ezq-root');
  rootEl.textContent = '';

  const store = createStore({ storage: safeLocalStorage() });
  const sfx = createSfx(() => store.get().navigation.isAudioMuted);

  const applyTheme = (): void => {
    rootEl.dataset.ezqTheme = store.get().meta.theme;
  };
  applyTheme();
  const offTheme = store.subscribe((s, prev) => {
    if (s.meta.theme !== prev.meta.theme) applyTheme();
  });

  const unblock = blockGestures(rootEl);

  // AudioContext создаётся по первому жесту пользователя (политика автоплея).
  const unlock = (): void => {
    sfx.unlock();
    rootEl.removeEventListener('pointerdown', unlock);
    rootEl.removeEventListener('keydown', unlock);
  };
  rootEl.addEventListener('pointerdown', unlock);
  rootEl.addEventListener('keydown', unlock);

  const host = document.createElement('div');
  host.className = 'ezq-screen-host';
  rootEl.appendChild(host);

  let router: Router | null = null;
  const ctx: AppContext = { root: rootEl, store, sfx, navigate: (screen) => router?.go(screen) };
  router = createRouter({ store, host, screens: SCREENS, ctx });

  return {
    store,
    sfx,
    router,
    destroy() {
      router?.destroy();
      offTheme();
      unblock();
      unlock();
      store.destroy();
      host.remove();
    },
  };
}
