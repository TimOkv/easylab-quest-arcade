// Сцена комнаты 1600×900 (Решения §2): <img> фона → слой предметов (DOM) → canvas (Изик, тень,
// метка цели) → слой кнопок и облачков (DOM). Масштаб — fitStage (contain) снаружи.
import type { Pt } from './world/rooms';
import { el } from '../core/dom';

export const STAGE_W = 1600;
export const STAGE_H = 900;

export interface RoomStage {
  stage: HTMLElement;
  bg: HTMLImageElement;
  /** Подсветки предметов, бренд-оверлеи (кнопки-предметы кликабельны). */
  objects: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  /** Кнопки/облачка над предметами (координаты сцены). */
  ui: HTMLElement;
  /** Экранная точка → пиксели сцены. */
  toStage(clientX: number, clientY: number): Pt;
}

export function createRoomStage(): RoomStage {
  const stage = el('div', 'ezq-qstage');
  const bg = el('img', 'ezq-qstage__bg');
  bg.alt = '';
  bg.draggable = false;
  bg.decoding = 'async';
  const objects = el('div', 'ezq-qstage__objects');
  const canvas = el('canvas', 'ezq-qstage__canvas');
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  canvas.setAttribute('aria-hidden', 'true');
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null; // happy-dom / старые браузеры: сцена без героя
  }
  if (ctx) ctx.imageSmoothingEnabled = false;
  const ui = el('div', 'ezq-qstage__ui');
  stage.append(bg, objects, canvas, ui);
  return {
    stage,
    bg,
    objects,
    canvas,
    ctx,
    ui,
    toStage(clientX, clientY) {
      const r = stage.getBoundingClientRect();
      return { x: ((clientX - r.left) * STAGE_W) / (r.width || STAGE_W), y: ((clientY - r.top) * STAGE_H) / (r.height || STAGE_H) };
    },
  };
}
