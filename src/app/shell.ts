// Утилиты оболочки для экранов: масштаб сцены, копирование, кнопка звука, тосты, блокировка жестов.
import type { Store } from '../core/state';
import type { Sfx } from '../services/sfx';

// ---------------------------------------------------------------- fitStage

export interface FitStageOptions {
  /** Вертикальное выравнивание сцены в контейнере (портретный квест — 'top'). */
  align?: 'center' | 'top';
  onScale?(scale: number): void;
}

export interface FitStageHandle {
  destroy(): void;
  /** Текущий масштаб (CSS px на логический px). */
  scale(): number;
  /** Пересчитать немедленно (например, после смены раскладки). */
  refresh(): void;
}

/**
 * Масштабирует `el` с логическим размером w×h в родителе по правилу `contain` и центрирует.
 * Родитель получает класс `ezq-stage-host` (позиционирование + декоративные поля),
 * сам элемент — `ezq-stage`.
 */
export function fitStage(el: HTMLElement, w: number, h: number, opts: FitStageOptions = {}): FitStageHandle {
  const host = el.parentElement;
  if (!host) throw new Error('fitStage: элемент должен быть вставлен в контейнер');
  host.classList.add('ezq-stage-host');
  el.classList.add('ezq-stage');
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  let current = 1;

  const apply = (): void => {
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    const s = Math.min(cw / w, ch / h);
    const x = (cw - w * s) / 2;
    const y = opts.align === 'top' ? 0 : (ch - h * s) / 2;
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    if (s !== current) {
      current = s;
      opts.onScale?.(s);
    }
  };

  apply();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
  ro?.observe(host);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);

  return {
    destroy() {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    },
    scale: () => current,
    refresh: apply,
  };
}

// ---------------------------------------------------------------- copyText

/** Clipboard API → execCommand('copy') → false. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем запасной путь */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'ezq-offscreen';
    (document.querySelector('.ezq-root') ?? document.body).appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- createMuteButton

/** Кнопка 🔊/🔇: переключает `navigation.isAudioMuted` (сохраняется в store). */
export function createMuteButton(store: Store, sfx: Sfx): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ezq-btn ezq-btn--icon ezq-mute';
  const render = (): void => {
    const muted = store.get().navigation.isAudioMuted;
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    btn.setAttribute('aria-pressed', String(muted));
    btn.title = muted ? 'Звук выключен' : 'Звук включён';
  };
  render();
  let seenConnected = false;
  const off = store.subscribe(() => {
    if (btn.isConnected) seenConnected = true;
    else if (seenConnected) {
      off();
      return;
    }
    render();
  });
  btn.addEventListener('click', () => {
    sfx.unlock();
    store.update((s) => {
      s.navigation.isAudioMuted = !s.navigation.isAudioMuted;
    });
    sfx.play('click');
  });
  return btn;
}

// ---------------------------------------------------------------- showToast

let toastHost: HTMLElement | null = null;

/** Короткое всплывающее сообщение внизу экрана (~2.5 с). Текст — через textContent. */
export function showToast(text: string, ms = 2600): void {
  const root = document.querySelector<HTMLElement>('.ezq-root') ?? document.body;
  if (!toastHost || !toastHost.isConnected || toastHost.parentElement !== root) {
    toastHost = document.createElement('div');
    toastHost.className = 'ezq-toast-host';
    toastHost.setAttribute('aria-live', 'polite');
    toastHost.setAttribute('role', 'status');
    root.appendChild(toastHost);
  }
  const t = document.createElement('div');
  t.className = 'ezq-toast';
  t.textContent = text;
  toastHost.appendChild(t);
  while (toastHost.childElementCount > 3) toastHost.firstElementChild?.remove();
  window.setTimeout(() => {
    t.classList.add('ezq-toast--out');
    window.setTimeout(() => t.remove(), 300);
  }, ms);
}

// ---------------------------------------------------------------- жесты (R10, R60)

/**
 * Гасит системный скролл/pull-to-refresh/пинч внутри корня. Прокрутка разрешена только
 * внутри элементов с классом `ezq-scroll`.
 */
export function blockGestures(root: HTMLElement): () => void {
  const onTouchMove = (e: TouchEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    if (e.touches.length > 1 || !target?.closest('.ezq-scroll')) {
      if (e.cancelable) e.preventDefault();
    }
  };
  const prevent = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('gesturestart', prevent, { passive: false });
  root.addEventListener('dblclick', prevent, { passive: false });
  root.addEventListener('contextmenu', prevent);
  return () => {
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('gesturestart', prevent);
    root.removeEventListener('dblclick', prevent);
    root.removeEventListener('contextmenu', prevent);
  };
}
