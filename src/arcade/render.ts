// Отрисовка мира аркады: фон с параллаксом, метки высоты, линия рекорда, платформы, котик, HUD.
// Без аллокаций в кадре: строки подписей кэшируются, штрих линий — константы.

import { PK_VANISH, VIEW_H, VIEW_W, PLAT_W, SPRING_W, type World } from './engine';
import { CAT_DRAW_H, CAT_DRAW_W, CITY_H, ROOM_H, ROOM_TOP_ALT, SKY_ALT, type SpriteSet } from './sprites';

const MARK_EVERY_PX = 5000; // каждые 500 очков
const DASH = [10, 8];
const SOLID: number[] = [];
const FONT_HUD = '800 30px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FONT_SMALL = '700 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_FLASH = '900 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const labels = new Map<number, string>();
const label = (n: number): string => {
  let s = labels.get(n);
  if (s === undefined) {
    s = String(n);
    if (labels.size > 200) labels.clear();
    labels.set(n, s);
  }
  return s;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

function drawBackground(ctx: CanvasRenderingContext2D, s: SpriteSet, cam: number): void {
  // Небо: полоска-градиент, растянутая на экран (сглаживание только здесь).
  const stripH = (VIEW_H / SKY_ALT) * 256;
  let sy = (1 - (cam + VIEW_H) / SKY_ALT) * 256;
  if (sy < 0) sy = 0;
  else if (sy > 256 - stripH) sy = 256 - stripH;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(s.sky, 0, sy, 1, stripH, 0, 0, VIEW_W, VIEW_H);
  ctx.imageSmoothingEnabled = false;

  const starA = clamp01((cam - 2500) / 6000);
  if (starA > 0) {
    ctx.globalAlpha = starA;
    const off = mod(cam * 0.1, 800);
    ctx.drawImage(s.stars, 0, off);
    ctx.drawImage(s.stars, 0, off - 800);
  }
  const cloudA = clamp01(1 - (cam - 7000) / 3000);
  if (cloudA > 0 && cam > -200) {
    ctx.globalAlpha = cloudA;
    const off = mod(cam * 0.3, 800);
    ctx.drawImage(s.clouds, 0, off);
    ctx.drawImage(s.clouds, 0, off - 800);
  }
  ctx.globalAlpha = 1;

  // Город — параллакс 0.5 за крышей стартовой комнаты.
  const cityBottom = 60 + (cam > 0 ? cam * 0.5 : 0);
  if (cityBottom > 0 && cityBottom - CITY_H < VIEW_H) ctx.drawImage(s.city, 0, cityBottom - CITY_H);

  // Комната — едет вместе с миром (верх комнаты = высота 800).
  const roomTop = VIEW_H - (ROOM_TOP_ALT - cam);
  if (roomTop < VIEW_H && roomTop + ROOM_H > 0) ctx.drawImage(s.room, 0, roomTop);
}

let scoreShown = -1;
let scoreText = '0';

export interface RenderExtras {
  /** Подсказка поверх (например, «Упс!» при падении) — без аллокаций, строка-константа. */
  banner?: string;
}

/** Рисует мир в логических координатах 450×800 (масштаб выставляет вызывающий). */
export function renderWorld(ctx: CanvasRenderingContext2D, w: World, alpha: number, s: SpriteSet, extras?: RenderExtras): void {
  const cam = w.prevCamY + (w.camY - w.prevCamY) * alpha;
  const top = cam + VIEW_H;
  ctx.imageSmoothingEnabled = false;
  drawBackground(ctx, s, cam);

  // --- метки высоты каждые 500 очков
  ctx.font = FONT_SMALL;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'right';
  ctx.lineWidth = 2;
  ctx.setLineDash(DASH);
  ctx.strokeStyle = 'rgba(202,214,255,0.55)';
  ctx.fillStyle = 'rgba(202,214,255,0.9)';
  for (let m = Math.max(MARK_EVERY_PX, Math.ceil(cam / MARK_EVERY_PX) * MARK_EVERY_PX); m < top; m += MARK_EVERY_PX) {
    const y = Math.round(VIEW_H - (m - cam)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
    ctx.fillText(label(m / 10), VIEW_W - 8, y - 3);
  }
  ctx.setLineDash(SOLID);

  // --- линия «Твой рекорд»
  if (w.recordPx > 0 && w.recordPx > cam && w.recordPx < top) {
    const y = Math.round(VIEW_H - (w.recordPx - cam));
    ctx.fillStyle = '#ffc933';
    ctx.fillRect(0, y - 1, VIEW_W, 3);
    // подпись по центру: у краёв внизу экрана — тач-стрелки
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(VIEW_W / 2 - 48, y - 22, 96, 19);
    ctx.fillStyle = '#ffc933';
    ctx.fillText('Твой рекорд', VIEW_W / 2, y - 5);
  }

  // --- платформы, пружины, ракеты
  for (let i = 0; i < w.platforms.length; i++) {
    const pl = w.platforms[i];
    if (!pl.active || pl.y < cam - 20 || pl.y > top + 60) continue;
    const x = Math.round(pl.prevX + (pl.x - pl.prevX) * alpha);
    const y = Math.round(VIEW_H - (pl.y - cam));
    if (pl.gone) {
      if (pl.fadeT <= 0) continue;
      ctx.globalAlpha = pl.fadeT;
      ctx.drawImage(s.platforms[PK_VANISH], x, y + (1 - pl.fadeT) * 24, PLAT_W, 14);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.drawImage(s.platforms[pl.kind], x, y, PLAT_W, 14);
    if (pl.spring) {
      const sx = x + Math.round(pl.springOff);
      if (pl.springT > 0) ctx.drawImage(s.springDown, sx, y - 8, SPRING_W, 8);
      else ctx.drawImage(s.spring, sx, y - 12, SPRING_W, 12);
    }
    if (pl.rocket && !pl.rocketTaken) {
      const bob = Math.round(Math.sin(w.time * 5 + i) * 3);
      ctx.drawImage(s.rocket, x + PLAT_W / 2 - 12, y - 44 + bob, 24, 42);
    }
  }

  // --- частицы пламени
  for (let i = 0; i < w.particles.length; i++) {
    const q = w.particles[i];
    if (q.life <= 0) continue;
    ctx.fillStyle = q.life > 0.3 ? '#ffe066' : q.life > 0.15 ? '#ff9a2e' : '#ff5a3c';
    ctx.fillRect(Math.round(q.x) - 3, Math.round(VIEW_H - (q.y - cam)) - 3, 6, 6);
  }

  // --- котик
  const p = w.player;
  const px = Math.abs(p.x - p.prevX) > VIEW_W / 2 ? p.x : p.prevX + (p.x - p.prevX) * alpha;
  const py = p.prevY + (p.y - p.prevY) * alpha;
  const dir = p.facing > 0 ? 0 : 1;
  const frame = p.rocketT > 0 || p.vy > 300 ? s.catJump[dir] : p.vy > -250 ? s.catStand[dir] : s.catFall[dir];
  const cx = Math.round(px - CAT_DRAW_W / 2);
  const cy = Math.round(VIEW_H - (py - cam) - CAT_DRAW_H);
  for (let k = -1; k <= 1; k++) {
    if (k !== 0 && (k < 0 ? px < VIEW_W - CAT_DRAW_W / 2 : px > CAT_DRAW_W / 2)) continue;
    const ox = cx + k * VIEW_W;
    if (p.rocketT > 0) {
      ctx.drawImage(s.rocket, ox + (dir === 0 ? -6 : CAT_DRAW_W - 18), cy + 14, 24, 42);
      ctx.drawImage(s.flame[w.steps & 4 ? 0 : 1], ox + (dir === 0 ? -3 : CAT_DRAW_W - 15), cy + 54, 18, 18);
    }
    ctx.drawImage(frame, ox, cy, CAT_DRAW_W, CAT_DRAW_H);
  }

  // --- HUD: очки
  if (w.score !== scoreShown) {
    scoreShown = w.score;
    scoreText = label(w.score);
  }
  ctx.font = FONT_HUD;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(10,14,34,0.8)';
  ctx.fillText(scoreText, 18, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(scoreText, 16, 16);
  ctx.font = FONT_SMALL;
  ctx.fillStyle = '#cad6ff';
  ctx.fillText('очки', 18, 50);

  // --- вспышка «Новый рекорд!»
  if (w.newRecordT > 0) {
    const a = clamp01(w.newRecordT * 1.5);
    ctx.globalAlpha = a;
    ctx.font = FONT_FLASH;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1b1b1b';
    ctx.strokeText('Новый рекорд!', VIEW_W / 2, 190);
    ctx.fillStyle = '#ffc933';
    ctx.fillText('Новый рекорд!', VIEW_W / 2, 190);
    ctx.globalAlpha = 1;
  }

  if (extras?.banner) {
    ctx.font = FONT_FLASH;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1b1b1b';
    ctx.strokeText(extras.banner, VIEW_W / 2, VIEW_H / 2 - 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(extras.banner, VIEW_W / 2, VIEW_H / 2 - 40);
  }
}
