// Изик — процедурный пиксель-арт (Решения §5): рыже-белый котик в тёмно-синем худи.
// Кадры собираются из частей (голова, худи, лапы, хвост) и рисуются в offscreen-canvas один раз
// при создании спрайта; draw() только выбирает готовый кадр по времени и копирует его.
// Внешность сверена с котиком на исходниках src/assets/room.jpg и src/assets/rooms/src/*.JPG.

import type { Dir } from './rooms';

export type CatState = 'idle' | 'walk';

export interface CatSprite {
  /** (x, y) — точка между лапами на полу (низ спрайта), в пикселях сцены; t — секунды. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir, state: CatState, t: number): void;
}

/** Сетка кадра в «пикселях» спрайта: тело 20×28 + по 3 колонки по бокам под хвост. */
export const CAT_GRID_W = 26;
export const CAT_GRID_H = 28;
export const CAT_SCALE = 3;
/** Размер кадра в пикселях сцены (≈ котик на исходниках). */
export const CAT_W = CAT_GRID_W * CAT_SCALE;
export const CAT_H = CAT_GRID_H * CAT_SCALE;

/** Смена кадра шага (4 кадра на цикл), период дыхания, моргание. */
export const WALK_FRAME_S = 0.12;
export const BREATH_S = 0.55;
export const BLINK_EVERY_S = 3.6;
export const BLINK_S = 0.14;

type Img = HTMLCanvasElement;
type Rows = readonly string[];

const PAL: Readonly<Record<string, string>> = {
  k: '#3a2116', // контур
  o: '#E8893A', // рыжий
  d: '#B8612A', // рыжий в тени, полоски
  w: '#FFF6EC', // белый
  p: '#F29A9A', // нос, уши
  e: '#1B1B1B', // глаза
  h: '#FFFFFF', // блик, белый штрих знака
  n: '#1E2A55', // худи
  m: '#2E3F7A', // худи светлее: капюшон, подол
  l: '#9BC4FF', // голубой штрих знака
};

const BODY_X = 3; // тело (20 колонок) по центру сетки 26
const HEAD_Y = 2;
const TORSO_Y = 14;
const LEGS_Y = 22;

const sym = (half: string): string => half + [...half].reverse().join('');

// ---------------------------------------------------------------- голова (12 строк × 20)

const HEAD_DOWN: Rows = [
  sym('....k.....'),
  sym('...kok....'),
  sym('...kpok...'),
  sym('..kppokkkk'),
  sym('..koooodoo'),
  sym('.koooooooo'),
  sym('.koooooooo'),
  sym('.kooheoooo'),
  sym('.kooeeoooo'),
  sym('.kowwwwwwp'),
  sym('..kwwwwwwk'),
  sym('...kkwwwww'),
];

/** Белое пятно у правого глаза, как на картинках. */
const HEAD_DOWN_PATCH: ReadonlyArray<[number, number]> = [
  [12, 8], [13, 8], [16, 8], [17, 9],
];

const HEAD_UP: Rows = [
  sym('....k.....'),
  sym('...kok....'),
  sym('...kook...'),
  sym('..koookkkk'),
  sym('..kooooooo'),
  sym('.kooooodoo'),
  sym('.koooooooo'),
  sym('.koodooooo'),
  sym('.koooooooo'),
  sym('.koooooooo'),
  sym('..kooooooo'),
  sym('...kkooooo'),
];

/** Вбок — смотрит вправо; влево — отражение. */
const HEAD_SIDE: Rows = [
  '.......k....k.......',
  '......kok..kok......',
  '......kpok.kpok.....',
  '.....kooookoooook...',
  '....kooooooooooook..',
  '...koooodooooooooook',
  '...kooooooooooooook.',
  '...kooooooooooehwwk.',
  '...kooooooooooewwwwp',
  '...koooooooooowwwwk.',
  '....koooooooowwwkk..',
  '.....kkooooowwwk....',
];

// ---------------------------------------------------------------- худи (9 строк × 20)

const TORSO_DOWN: Rows = [
  '...kmmmmmmmmmmmmk...',
  '..kmnnnnnnnnnnnnmk..',
  '.knnnnnnnnnnnnnnnnk.',
  '.knnknnnnnnnnnnknnk.',
  '.knnknnnnnnnnnnknnk.',
  '.kwwknnnnnnnnnnkwwk.',
  '..kkknnnnnnnnnnkkk..',
  '....kmmmmmmmmmmk....',
  '....kkkkkkkkkkkk....',
];

/** Знак «загрузки» на груди: 7 штрихов по кругу 3×3 без верхнего левого (Решения §5, §6). */
const LOADING_SIGN: ReadonlyArray<[number, number, string]> = [
  [10, 2, 'l'], [11, 2, 'h'],
  [9, 3, 'h'], [11, 3, 'l'],
  [9, 4, 'l'], [10, 4, 'h'], [11, 4, 'l'],
];

const TORSO_UP: Rows = [
  '...kmmmmmmmmmmmmk...',
  '..knmmmmmmmmmmmmnk..',
  '.knnkmmmmmmmmmmknnk.',
  '.knnnkkkkkkkkkknnnk.',
  '.knnnnnnnnnnnnnnnnk.',
  '.koknnnnnnnnnnnnkok.',
  '..kkknnnnnnnnnnkkk..',
  '....kmmmmmmmmmmk....',
  '....kkkkkkkkkkkk....',
];

const TORSO_SIDE: Rows = [
  '.....kmmmmmmmmk.....',
  '....kmnnnnnnnnmk....',
  '....knnnnnnnnnnk....',
  '....knnnknnnnnnk....',
  '....knnnknnnnnnk....',
  '....knnnkknnnnnk....',
  '....knnnnnnnnnnk....',
  '.....kmmmmmmmmk.....',
  '.....kkkkkkkkkk.....',
];

// ---------------------------------------------------------------- лапы (6 строк × 20, верхняя под подолом)

const LEGS_STAND: Rows = [
  '.....kook..kook.....',
  '.....kook..kook.....',
  '.....kook..kook.....',
  '.....kwwk..kwwk.....',
  '.....kwwk..kwwk.....',
  '.....kkkk..kkkk.....',
];

/** Левая (на экране) лапа поднята. */
const LEGS_STEP_L: Rows = [
  '.....kook..kook.....',
  '.....kook..kook.....',
  '.....kwwk..kook.....',
  '.....kwwk..kwwk.....',
  '.....kkkk..kwwk.....',
  '...........kkkk.....',
];

const LEGS_SIDE_STAND: Rows = [
  '......kddk.kook.....',
  '......kddk.kook.....',
  '......kddk.kook.....',
  '......kwwk.kwwk.....',
  '......kwwwkkwwwk....',
  '......kkkkkkkkkk....',
];

/** Шаг вбок: дальняя лапа (d) сзади, ближняя (o) впереди. */
const LEGS_SIDE_STRIDE: Rows = [
  '......kdd.kook......',
  '.....kddk..kook.....',
  '....kddk....kook....',
  '....kwwk....kwwk....',
  '...kwwwk....kwwwk...',
  '...kkkkk....kkkkk...',
];

/** То же, но ближняя лапа сзади. */
const LEGS_SIDE_STRIDE2: Rows = [
  '......koo.kddk......',
  '.....kook..kddk.....',
  '....kook....kddk....',
  '....kwwk....kwwk....',
  '...kwwwk....kwwwk...',
  '...kkkkk....kkkkk...',
];

// ---------------------------------------------------------------- хвост (свой холст, 3 положения)

interface TailDef {
  x: number;
  y: number;
  rows: Rows;
  /** Рисовать поверх тела (вид со спины). */
  front: boolean;
}

const TAIL_DOWN: TailDef = {
  x: 0,
  y: 13,
  front: false,
  rows: [
    '.kk...',
    'kwwk..',
    'kwwk..',
    'kook..',
    'kook..',
    '.kook.',
    '.kook.',
    '..kook',
    '...koo',
    '....ko',
  ],
};

const TAIL_UP: TailDef = {
  x: 16,
  y: 11,
  front: true,
  rows: [
    '....kk..',
    '...kwwk.',
    '...kwwk.',
    '...kook.',
    '..kook..',
    '..kok...',
    '.kook...',
    '.kok....',
    'kook....',
    'kok.....',
    'kk......',
  ],
};

const TAIL_SIDE: TailDef = {
  x: 0,
  y: 11,
  front: false,
  rows: [
    'kk......',
    'kwwk....',
    'kwwk....',
    'kook....',
    '.kook...',
    '..kook..',
    '...kook.',
    '....kook',
    '.....koo',
    '......ko',
  ],
};

/** Кончик хвоста (верхние 4 строки) сдвигается на −1/0/+1 — хвост покачивается. */
const TAIL_SWAY = [-1, 0, 1] as const;
const TIP_ROWS = 4;

// ---------------------------------------------------------------- сборка кадров

type Grid = string[][];

function blank(): Grid {
  return Array.from({ length: CAT_GRID_H }, () => Array<string>(CAT_GRID_W).fill('.'));
}

function paste(g: Grid, rows: Rows, x0: number, y0: number, width?: number): void {
  rows.forEach((row, dy) => {
    if (width !== undefined && row.length !== width) {
      throw new Error(`cat-sprite: строка ширины ${row.length}, нужно ${width}: "${row}"`);
    }
    const y = y0 + dy;
    if (y < 0 || y >= CAT_GRID_H) return;
    for (let dx = 0; dx < row.length; dx++) {
      const x = x0 + dx;
      if (row[dx] !== '.' && x >= 0 && x < CAT_GRID_W) g[y][x] = row[dx];
    }
  });
}

function toCanvas(g: Grid): Img {
  const c = document.createElement('canvas');
  c.width = CAT_W;
  c.height = CAT_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d недоступен');
  g.forEach((row, y) =>
    row.forEach((ch, x) => {
      const col = PAL[ch];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x * CAT_SCALE, y * CAT_SCALE, CAT_SCALE, CAT_SCALE);
    }),
  );
  return c;
}

function mirrored(src: Img): Img {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d недоступен');
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

interface View {
  head: Rows;
  torso: Rows;
  legsStand: Rows;
  /** 4 кадра шага: лапы и сдвиг тела по вертикали (−1 — подскок). */
  walk: ReadonlyArray<[Rows, number]>;
  tail: TailDef;
  /** Правка головы: пятно, закрытые глаза. */
  face?: (g: Grid, off: number) => void;
  blink?: (g: Grid, off: number) => void;
  sign?: boolean;
}

const at = (g: Grid, x: number, y: number, ch: string): void => {
  if (y >= 0 && y < CAT_GRID_H) g[y][BODY_X + x] = ch;
};

const VIEWS: Record<'down' | 'up' | 'side', View> = {
  down: {
    head: HEAD_DOWN,
    torso: TORSO_DOWN,
    legsStand: LEGS_STAND,
    walk: [
      [LEGS_STEP_L, 0],
      [LEGS_STAND, -1],
      [LEGS_STEP_L.map(sym20), 0],
      [LEGS_STAND, -1],
    ],
    tail: TAIL_DOWN,
    sign: true,
    face: (g, off) => HEAD_DOWN_PATCH.forEach(([x, y]) => at(g, x, HEAD_Y + off + y, 'w')),
    blink: (g, off) => {
      for (const x of [4, 5, 14, 15]) {
        at(g, x, HEAD_Y + off + 7, g[HEAD_Y + off + 6][BODY_X + x]);
        at(g, x, HEAD_Y + off + 8, 'e');
      }
    },
  },
  up: {
    head: HEAD_UP,
    torso: TORSO_UP,
    legsStand: LEGS_STAND,
    walk: [
      [LEGS_STEP_L, 0],
      [LEGS_STAND, -1],
      [LEGS_STEP_L.map(sym20), 0],
      [LEGS_STAND, -1],
    ],
    tail: TAIL_UP,
  },
  side: {
    head: HEAD_SIDE,
    torso: TORSO_SIDE,
    legsStand: LEGS_SIDE_STAND,
    walk: [
      [LEGS_SIDE_STRIDE, 0],
      [LEGS_SIDE_STAND, -1],
      [LEGS_SIDE_STRIDE2, 0],
      [LEGS_SIDE_STAND, -1],
    ],
    tail: TAIL_SIDE,
    blink: (g, off) => {
      at(g, 14, HEAD_Y + off + 7, 'o');
      at(g, 15, HEAD_Y + off + 7, 'o');
      at(g, 14, HEAD_Y + off + 8, 'e');
    },
  },
};

/** Зеркало строки из 20 символов (правая лапа вместо левой). */
function sym20(row: string): string {
  return [...row].reverse().join('');
}

function bodyFrame(v: View, legs: Rows, off: number, blink: boolean): Grid {
  const g = blank();
  paste(g, legs, BODY_X, LEGS_Y, 20);
  paste(g, v.head, BODY_X, HEAD_Y + off, 20);
  v.face?.(g, off);
  if (blink) v.blink?.(g, off);
  paste(g, v.torso, BODY_X, TORSO_Y + off, 20);
  if (v.sign) LOADING_SIGN.forEach(([x, y, ch]) => at(g, x, TORSO_Y + off + y, ch));
  return g;
}

function tailFrame(t: TailDef, sway: number): Grid {
  const g = blank();
  const rows = t.rows.map((row, i) => {
    if (i >= TIP_ROWS || sway === 0) return row;
    return sway > 0 ? '.' + row.slice(0, -1) : row.slice(1) + '.';
  });
  paste(g, rows, t.x, t.y);
  return g;
}

interface DirFrames {
  /** [дыхание 0, дыхание 1] */
  stand: [Img, Img];
  blink: Img;
  walk: [Img, Img, Img, Img];
  tail: [Img, Img, Img];
  tailFront: boolean;
}

function buildView(v: View): DirFrames {
  const walk = v.walk.map(([legs, off]) => toCanvas(bodyFrame(v, legs, off, false)));
  const tails = TAIL_SWAY.map((sway) => toCanvas(tailFrame(v.tail, sway)));
  return {
    stand: [toCanvas(bodyFrame(v, v.legsStand, 0, false)), toCanvas(bodyFrame(v, v.legsStand, 1, false))],
    blink: toCanvas(bodyFrame(v, v.legsStand, 0, true)),
    walk: [walk[0], walk[1], walk[2], walk[3]],
    tail: [tails[0], tails[1], tails[2]],
    tailFront: v.tail.front,
  };
}

function mirrorView(f: DirFrames): DirFrames {
  return {
    stand: [mirrored(f.stand[0]), mirrored(f.stand[1])],
    blink: mirrored(f.blink),
    walk: [mirrored(f.walk[0]), mirrored(f.walk[1]), mirrored(f.walk[2]), mirrored(f.walk[3])],
    tail: [mirrored(f.tail[0]), mirrored(f.tail[1]), mirrored(f.tail[2])],
    tailFront: f.tailFront,
  };
}

const mod = (a: number, b: number): number => ((a % b) + b) % b;

export function createCatSprite(): CatSprite {
  const right = buildView(VIEWS.side);
  const frames: Record<Dir, DirFrames> = {
    down: buildView(VIEWS.down),
    up: buildView(VIEWS.up),
    right,
    left: mirrorView(right),
  };

  return {
    draw(ctx, x, y, dir, state, t) {
      const f = frames[dir];
      const walking = state === 'walk';
      let body: Img;
      if (walking) {
        body = f.walk[mod(Math.floor(t / WALK_FRAME_S), 4)];
      } else if (dir !== 'up' && mod(t, BLINK_EVERY_S) > BLINK_EVERY_S - BLINK_S) {
        body = f.blink;
      } else {
        body = f.stand[mod(Math.floor(t / BREATH_S), 2)];
      }
      const swayIdx = Math.round(Math.sin(t * (walking ? 10 : 2.4))) + 1;
      const tail = f.tail[Math.max(0, Math.min(2, swayIdx))];
      const dx = Math.round(x - CAT_W / 2);
      const dy = Math.round(y - CAT_H);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      // мягкая тень под лапами
      const rx = walking ? 22 + Math.abs(Math.sin(t * 13)) * 2 : 24;
      ctx.fillStyle = 'rgba(20, 10, 30, 0.28)';
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y - 3), rx, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!f.tailFront) ctx.drawImage(tail, dx, dy);
      ctx.drawImage(body, dx, dy);
      if (f.tailFront) ctx.drawImage(tail, dx, dy);
      ctx.restore();
    },
  };
}

/** Для стенда: время, на котором draw() показывает нужный кадр. */
export const CAT_FRAME_TIMES = {
  stand: [0.05, BREATH_S + 0.05],
  blink: BLINK_EVERY_S - BLINK_S / 2,
  walk: [0.01, WALK_FRAME_S + 0.01, WALK_FRAME_S * 2 + 0.01, WALK_FRAME_S * 3 + 0.01],
} as const;
