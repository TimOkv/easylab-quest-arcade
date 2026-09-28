// Процедурная пиксельная графика аркады: матрицы пикселей → offscreen canvas (ни одного файла).

import { VIEW_W } from './engine';
import { EASYCOIN_SVG } from '../quest/effects';

type Img = HTMLCanvasElement;
type Palette = Readonly<Record<string, string>>;

export interface SpriteSet {
  /** [вправо, влево]; матрица 16×20, рисуется ×3 (48×60). */
  catStand: [Img, Img];
  catJump: [Img, Img];
  catFall: [Img, Img];
  /** По PK_*: статичная, движущаяся, исчезающая; 32×7, рисуется ×2 (64×14). */
  platforms: [Img, Img, Img];
  spring: Img; // 10×6 ×2
  springDown: Img; // 10×4 ×2
  rocket: Img; // 8×14 ×3
  flame: [Img, Img]; // 6×6 ×3
  sky: Img; // 1×256 — градиент по высоте (сверху — космос)
  stars: Img; // VIEW_W×800, прозрачный
  clouds: Img; // VIEW_W×800, прозрачный
  city: Img; // VIEW_W×260
  room: Img; // VIEW_W×1000 — стартовая комната (верх = высота 800)
}

export const CAT_SCALE = 3;
export const CAT_DRAW_W = 16 * CAT_SCALE;
export const CAT_DRAW_H = 20 * CAT_SCALE;
export const SKY_ALT = 20000;
export const ROOM_TOP_ALT = 800;
export const ROOM_H = 1000;
export const CITY_H = 260;

function canvas(w: number, h: number): Img {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: Img): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d недоступен');
  return g;
}

/** Матрица строк → canvas 1 символ = 1 пиксель; '.' — прозрачный. */
function fromMatrix(rows: readonly string[], pal: Palette): Img {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = canvas(w, rows.length);
  const g = ctx2d(c);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

function mirrored(src: Img): Img {
  const c = canvas(src.width, src.height);
  const g = ctx2d(c);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

/** Полустрока головы → симметричная строка. */
const sym = (half: string): string => half + [...half].reverse().join('');

// ---------------------------------------------------------------- котик (референс: рыже-белый в тёмно-синем худи)

const CAT_PAL: Palette = {
  k: '#2a1810',
  o: '#f28c28',
  d: '#c2621a',
  w: '#fff3e3',
  p: '#f7a1b0',
  e: '#1b1b1b',
  h: '#ffffff',
  n: '#22306b',
  m: '#151d47',
  l: '#9bc4ff',
};

const CAT_HEAD = [
  sym('...k....'),
  sym('..kok...'),
  sym('..kpok..'),
  sym('.koooodd'),
  sym('.koooooo'),
  sym('kooooooo'),
  sym('kooheooo'),
  sym('kooeeooo'),
  sym('kowwwwwp'),
  sym('.kwwwwww'),
  sym('..kkwwww'),
];

const CAT_STAND = [
  ...CAT_HEAD,
  'w..kmmmmmmmmk...',
  'o.knnnnnnnnnnk..',
  'okwknnnllnnnkwk.',
  'dkwknnlnnlnnkwk.',
  '.kmmmmmmmmmmmmk.',
  '..knnnnnnnnnnk..',
  '...kwwk..kwwk...',
  '...kwwk..kwwk...',
  '...kkkk..kkkk...',
];

const CAT_JUMP = [
  ...CAT_HEAD.slice(0, 10),
  sym('kwkkwwww'),
  'w.kwkmmmmmmkwk..',
  'o.knnnnnnnnnnk..',
  'o.knnnnllnnnnk..',
  'dkknnnlnnlnnnk..',
  '.kmmmmmmmmmmmmk.',
  '..kwwk....kwwk..',
  '..kkkk....kkkk..',
  '................',
];

const CAT_FALL = [
  ...CAT_HEAD,
  '...kmmmmmmmmk...',
  'w.knnnnnnnnnnk..',
  'okwwknnllnnkwwk.',
  'okk.knlnnlnk.kk.',
  'd.kmmmmmmmmmmk..',
  '..knnnnnnnnnnk..',
  '....kwk..kwk....',
  '....kwk..kwk....',
  '....kkk..kkk....',
];

function catPair(rows: string[]): [Img, Img] {
  const r = fromMatrix(rows, CAT_PAL);
  return [r, mirrored(r)];
}

// ---------------------------------------------------------------- платформы (32×7, ×2)

function platformRows(kind: 0 | 1 | 2): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 7; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const edge = x === 0 || x === 31;
      const corner = edge && (y === 0 || y === 6);
      if (corner) row += '.';
      else if (edge || y === 6) row += 'k';
      else if (y === 0) row += 'l';
      else if (y === 5) row += 'd';
      else if (kind === 0) row += x % 8 === 0 && y > 1 ? 'd' : (x + y * 3) % 11 === 0 ? 'm' : 'b';
      else if (kind === 1) row += y === 3 && x % 6 === 3 ? 'm' : y === 1 ? 'm' : 'b';
      else row += (x === 9 && y > 1) || (x === 10 && y === 3) || (x === 22 && y < 5) || (x === 21 && y === 2) ? 'd' : 'b';
    }
    rows.push(row);
  }
  return rows;
}

const PLAT_PALS: [Palette, Palette, Palette] = [
  { k: '#2a1810', l: '#d79a5a', b: '#8a5230', m: '#a8703f', d: '#4a2a16' }, // дерево — как рамки в референсе
  { k: '#0a1b4a', l: '#9bc4ff', b: '#0068ff', m: '#54c8f4', d: '#003f9e' }, // фирменный синий
  { k: '#3b2c7a', l: '#e2d8ff', b: '#b8a4fc', m: '#cabbff', d: '#6b58b8' }, // лиловый, с трещинами
];

// ---------------------------------------------------------------- пружина, ракета, пламя

const SPRING_PAL: Palette = { k: '#2a1810', r: '#ff1f4b', R: '#ff6b85', g: '#c9d3e0', G: '#6d7486' };
const SPRING_UP = ['kkkkkkkkkk', 'kRrrrrrrrk', '..gG..gG..', '...gG..gG.', '..gG..gG..', '.kkkkkkkk.'];
const SPRING_DOWN = ['kkkkkkkkkk', 'kRrrrrrrrk', '.gGgGgGgG.', '.kkkkkkkk.'];

const ROCKET_PAL: Palette = { k: '#1b1b1b', r: '#ff1f4b', w: '#ffffff', s: '#c9d3e0', b: '#00b8ff', B: '#0068ff', g: '#6d7486' };
const ROCKET = [
  '...kk...',
  '..krrk..',
  '..krrk..',
  '.kwwwsk.',
  '.kwbbsk.',
  '.kwbBsk.',
  '.kwwwsk.',
  '.kwwwsk.',
  'kkwwwskk',
  'krwwwsrk',
  'krrggrrk',
  'kk.gg.kk',
  '...kk...',
  '........',
];

const FLAME_PAL: Palette = { y: '#ffe066', o: '#ff9a2e', r: '#ff5a3c' };
const FLAME_A = ['.oyyo.', '.oyyo.', '..yo..', '.roor.', '..ro..', '..r...'];
const FLAME_B = ['.oyyo.', 'oyyyyo', '.oyyo.', '..oo..', '.r..r.', '......'];

// ---------------------------------------------------------------- монетка HUD

// Та же монетка EasyCoin, что в квесте: SVG-константа → Image, загружается один раз.
let coinImage: HTMLImageElement | null = null;

function easycoinImage(): HTMLImageElement {
  if (!coinImage) {
    coinImage = new Image();
    coinImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(EASYCOIN_SVG)}`;
  }
  return coinImage;
}

/**
 * Рисует монетку EasyCoin на весь переданный canvas. Буфер canvas увеличивается под
 * devicePixelRatio (размер на экране задаёт CSS), чтобы гладкая монетка не мылилась.
 */
export function drawCoinIcon(target: HTMLCanvasElement): void {
  const px = Number(target.dataset.ezqCoinPx) || target.width;
  target.dataset.ezqCoinPx = String(px);
  const k = Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1)));
  target.width = px * k;
  target.height = px * k;
  const img = easycoinImage();
  const paint = (): void => {
    const g = ctx2d(target);
    g.clearRect(0, 0, target.width, target.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, target.width, target.height);
  };
  if (img.complete && img.naturalWidth > 0) paint();
  else img.addEventListener('load', paint, { once: true });
}

// ---------------------------------------------------------------- фон

/** Детерминированный ГПСЧ для раскладки фона (одинаковый у всех). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SKY_STOPS: [number, [number, number, number]][] = [
  [0, [92, 128, 196]], // закат над комнатой
  [3500, [46, 64, 138]],
  [9000, [20, 26, 58]], // тёмно-синий из референса
  [15000, [8, 10, 30]],
  [SKY_ALT, [3, 4, 16]],
];

function buildSky(): Img {
  const c = canvas(1, 256);
  const g = ctx2d(c);
  for (let i = 0; i < 256; i++) {
    const alt = (1 - i / 255) * SKY_ALT;
    let k = 0;
    while (k < SKY_STOPS.length - 2 && alt > SKY_STOPS[k + 1][0]) k++;
    const [a0, c0] = SKY_STOPS[k];
    const [a1, c1] = SKY_STOPS[k + 1];
    const t = Math.min(1, Math.max(0, (alt - a0) / (a1 - a0)));
    const ch = (j: number) => Math.round(c0[j] + (c1[j] - c0[j]) * t);
    g.fillStyle = `rgb(${ch(0)},${ch(1)},${ch(2)})`;
    g.fillRect(0, i, 1, 1);
  }
  return c;
}

function buildStars(): Img {
  const c = canvas(VIEW_W, 800);
  const g = ctx2d(c);
  const r = lcg(7);
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(r() * VIEW_W);
    const y = Math.floor(r() * 800);
    const big = r() < 0.12;
    g.fillStyle = r() < 0.3 ? '#9bc4ff' : r() < 0.5 ? '#cad6ff' : '#ffffff';
    if (big) {
      g.fillRect(x - 2, y, 5, 1);
      g.fillRect(x, y - 2, 1, 5);
    } else g.fillRect(x, y, r() < 0.5 ? 1 : 2, r() < 0.5 ? 1 : 2);
  }
  return c;
}

function buildClouds(): Img {
  const c = canvas(VIEW_W, 800);
  const g = ctx2d(c);
  const r = lcg(11);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * (VIEW_W - 60)) - 20;
    const y = 60 + i * 130 + Math.floor(r() * 50);
    const w = 70 + Math.floor(r() * 70);
    g.fillStyle = 'rgba(202,214,255,0.55)';
    g.fillRect(x, y, w, 12);
    g.fillRect(x + 12, y - 8, w - 30, 8);
    g.fillRect(x + 24, y - 14, Math.max(16, w - 60), 6);
    g.fillStyle = 'rgba(155,196,255,0.45)';
    g.fillRect(x + 4, y + 12, w - 8, 4);
  }
  return c;
}

function buildCity(): Img {
  const c = canvas(VIEW_W, CITY_H);
  const g = ctx2d(c);
  const r = lcg(23);
  let x = 0;
  while (x < VIEW_W) {
    const w = 30 + Math.floor(r() * 40);
    const h = 70 + Math.floor(r() * (CITY_H - 90));
    g.fillStyle = r() < 0.5 ? '#1b2656' : '#141d45';
    g.fillRect(x, CITY_H - h, w, h);
    g.fillStyle = '#ffc933';
    for (let wy = CITY_H - h + 8; wy < CITY_H - 8; wy += 12) {
      for (let wx = x + 5; wx < x + w - 6; wx += 9) if (r() < 0.35) g.fillRect(wx, wy, 4, 5);
    }
    x += w + Math.floor(r() * 6);
  }
  return c;
}

function buildRoom(): Img {
  const c = canvas(VIEW_W, ROOM_H);
  const g = ctx2d(c);
  const floorY = ROOM_TOP_ALT; // высота 0 в координатах холста комнаты
  // стены
  g.fillStyle = '#2f4f7f';
  g.fillRect(0, 0, VIEW_W, floorY);
  g.fillStyle = '#284470';
  for (let x = 0; x < VIEW_W; x += 30) g.fillRect(x, 0, 2, floorY);
  // потолочная балка и плинтус
  g.fillStyle = '#7a4a2a';
  g.fillRect(0, 0, VIEW_W, 26);
  g.fillStyle = '#3f2415';
  g.fillRect(0, 26, VIEW_W, 4);
  // окно с вечерним городом
  const wx = 40;
  const wy = 330;
  g.fillStyle = '#7a4a2a';
  g.fillRect(wx - 8, wy - 8, 196, 156);
  g.fillStyle = '#5b80c4';
  g.fillRect(wx, wy, 180, 140);
  g.fillStyle = '#8fb3e8';
  g.fillRect(wx, wy + 60, 180, 40);
  g.fillStyle = '#1b2656';
  for (let i = 0; i < 9; i++) g.fillRect(wx + i * 20, wy + 80 - ((i * 37) % 50), 16, 60 + ((i * 37) % 50));
  g.fillStyle = '#7a4a2a';
  g.fillRect(wx + 88, wy, 4, 140);
  g.fillRect(wx, wy + 68, 180, 4);
  // книжный шкаф
  const bx = 300;
  const by = 420;
  g.fillStyle = '#5a3522';
  g.fillRect(bx, by, 110, floorY - by);
  g.fillStyle = '#3f2415';
  for (let s = 0; s < 4; s++) {
    const sy = by + 12 + s * 90;
    g.fillRect(bx + 6, sy + 70, 98, 6);
    const cols = ['#ff1f4b', '#54c8f4', '#ffc933', '#b8a4fc', '#2bd47d', '#0068ff'];
    for (let b = 0; b < 9; b++) {
      g.fillStyle = cols[(b + s) % cols.length];
      g.fillRect(bx + 10 + b * 10, sy + 20 + ((b * 7 + s) % 12), 8, 50 - ((b * 7 + s) % 12));
    }
    g.fillStyle = '#3f2415';
  }
  // постер с котиком
  g.fillStyle = '#7a4a2a';
  g.fillRect(250, 150, 110, 90);
  g.fillStyle = '#141a3a';
  g.fillRect(256, 156, 98, 78);
  g.fillStyle = '#f28c28';
  g.fillRect(286, 176, 38, 34);
  g.fillRect(286, 168, 8, 8);
  g.fillRect(316, 168, 8, 8);
  g.fillStyle = '#1b1b1b';
  g.fillRect(294, 186, 4, 4);
  g.fillRect(312, 186, 4, 4);
  // растение
  g.fillStyle = '#a8703f';
  g.fillRect(230, floorY - 60, 40, 60);
  g.fillStyle = '#2bd47d';
  g.fillRect(222, floorY - 110, 16, 50);
  g.fillRect(244, floorY - 130, 14, 70);
  g.fillRect(262, floorY - 105, 16, 45);
  // пол из досок
  g.fillStyle = '#9a6236';
  g.fillRect(0, floorY, VIEW_W, ROOM_H - floorY);
  g.fillStyle = '#7a4a2a';
  for (let y = floorY + 14; y < ROOM_H; y += 22) g.fillRect(0, y, VIEW_W, 3);
  for (let y = floorY, row = 0; y < ROOM_H; y += 22, row++) {
    for (let x = (row % 2) * 45; x < VIEW_W; x += 90) g.fillRect(x, y, 3, 22);
  }
  g.fillStyle = '#3f2415';
  g.fillRect(0, floorY - 6, VIEW_W, 6);
  return c;
}

export function buildSprites(): SpriteSet {
  const plat = (k: 0 | 1 | 2) => fromMatrix(platformRows(k), PLAT_PALS[k]);
  return {
    catStand: catPair(CAT_STAND),
    catJump: catPair(CAT_JUMP),
    catFall: catPair(CAT_FALL),
    platforms: [plat(0), plat(1), plat(2)],
    spring: fromMatrix(SPRING_UP, SPRING_PAL),
    springDown: fromMatrix(SPRING_DOWN, SPRING_PAL),
    rocket: fromMatrix(ROCKET, ROCKET_PAL),
    flame: [fromMatrix(FLAME_A, FLAME_PAL), fromMatrix(FLAME_B, FLAME_PAL)],
    sky: buildSky(),
    stars: buildStars(),
    clouds: buildClouds(),
    city: buildCity(),
    room: buildRoom(),
  };
}
