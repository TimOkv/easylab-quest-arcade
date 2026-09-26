// Ввод аркады: клавиши по event.code (раскладка не важна) и мультитач по половинам экрана.

import type { InputState, World } from './engine';

export type Side = -1 | 0 | 1;

export interface ArcadeInputOptions {
  /** Игровая зона (весь экран аркады, включая поля): сюда приходят pointer-события; половины — по ширине экрана. */
  target: HTMLElement;
  onPauseKey(): void;
  /** Какая половина сейчас нажата пальцем/мышью (для подсветки). */
  onSide?(side: Side): void;
  /** Ввод активен только во время забега. */
  isActive(): boolean;
}

export interface ArcadeInput {
  read(world: World, out: InputState): void;
  reset(): void;
  destroy(): void;
}

const LEFT_CODES = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_CODES = new Set(['ArrowRight', 'KeyD']);

export function createArcadeInput(opts: ArcadeInputOptions): ArcadeInput {
  const keysDown = new Set<string>();
  const pointers: { id: number; side: Side }[] = [];
  let side: Side = 0;
  let keyL = false;
  let keyR = false;
  const syncKeys = (): void => {
    keyL = keysDown.has('ArrowLeft') || keysDown.has('KeyA');
    keyR = keysDown.has('ArrowRight') || keysDown.has('KeyD');
  };

  const updateSide = (): void => {
    // Последнее касание главнее.
    const next: Side = pointers.length ? pointers[pointers.length - 1].side : 0;
    if (next !== side) {
      side = next;
      opts.onSide?.(side);
    }
  };

  const sideOf = (clientX: number): Side => {
    const r = opts.target.getBoundingClientRect();
    return clientX < r.left + r.width / 2 ? -1 : 1;
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat) opts.onPauseKey();
      return;
    }
    if (LEFT_CODES.has(e.code) || RIGHT_CODES.has(e.code)) {
      keysDown.add(e.code);
      syncKeys();
      if (opts.isActive()) e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keysDown.delete(e.code);
    syncKeys();
  };

  const onDown = (e: PointerEvent): void => {
    if (!opts.isActive()) return;
    // Кнопки поверх поля (пауза, звук) — не «половина экрана».
    const hit = e.target as Element | null;
    if (hit && typeof hit.closest === 'function' && hit.closest('button')) return;
    if (e.cancelable) e.preventDefault();
    try {
      opts.target.setPointerCapture(e.pointerId);
    } catch {
      /* не критично: без захвата палец, ушедший за край, отпустится по pointerup окна */
    }
    const i = pointers.findIndex((p) => p.id === e.pointerId);
    if (i >= 0) pointers.splice(i, 1);
    pointers.push({ id: e.pointerId, side: sideOf(e.clientX) });
    updateSide();
  };
  const onMove = (e: PointerEvent): void => {
    const p = pointers.find((q) => q.id === e.pointerId);
    if (!p) return;
    const s = sideOf(e.clientX);
    if (s !== p.side) {
      p.side = s;
      updateSide();
    }
  };
  const onUp = (e: PointerEvent): void => {
    const i = pointers.findIndex((p) => p.id === e.pointerId);
    if (i < 0) return;
    pointers.splice(i, 1);
    updateSide();
  };

  const reset = (): void => {
    keysDown.clear();
    syncKeys();
    pointers.length = 0;
    updateSide();
  };

  const t = opts.target;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', reset);
  t.addEventListener('pointerdown', onDown);
  t.addEventListener('pointermove', onMove);
  t.addEventListener('pointerup', onUp);
  t.addEventListener('pointercancel', onUp);
  t.addEventListener('lostpointercapture', onUp);
  window.addEventListener('pointerup', onUp);

  return {
    read(_world, out) {
      let l = keyL;
      let r = keyR;
      if (side === -1) l = true;
      else if (side === 1) r = true;
      out.left = l && !r ? true : l && r ? side === -1 : false;
      out.right = r && !l ? true : l && r ? side !== -1 : false;
    },
    reset,
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', reset);
      t.removeEventListener('pointerdown', onDown);
      t.removeEventListener('pointermove', onMove);
      t.removeEventListener('pointerup', onUp);
      t.removeEventListener('pointercancel', onUp);
      t.removeEventListener('lostpointercapture', onUp);
      window.removeEventListener('pointerup', onUp);
    },
  };
}
