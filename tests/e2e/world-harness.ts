// Стенд визуальной сверки мира (Vite dev, в сборку не входит):
//   ?view=sprite     — лист всех кадров Изика и три варианта логотипа;
//   ?view=room&n=1..4 — фон комнаты 1600×900 с наложением разметки: проходимые клетки (зелёные),
//                       препятствия (красные), предметы (жёлтые) с точкой и радиусом подхода, дверь
//                       (голубая), вход (фиолетовый), спавн (синий) и Изик на спавне.
import { ROOMS_DEF, type Dir, type Pt, type Rect } from '../../src/quest/world/rooms';
import { buildGrid } from '../../src/quest/world/walk';
import { CAT_FRAME_TIMES, CAT_H, CAT_W, createCatSprite, type CatState } from '../../src/quest/world/cat-sprite';
import { easycodeLogoSvg } from '../../src/quest/world/brand';
import type { BrandKind } from '../../src/quest/world/rooms';
import type { RoomIndex } from '../../src/core/types';

declare global {
  interface Window {
    __ezqWorldReady?: boolean;
  }
}

const root = document.getElementById('ezq-world') as HTMLElement;
const params = new URLSearchParams(location.search);

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.style.display = 'block';
  const g = c.getContext('2d');
  if (!g) throw new Error('no 2d');
  return [c, g];
}

function brandBox(kind: BrandKind, rect: Rect, scale: number): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText = `position:absolute;left:${rect.x * scale}px;top:${rect.y * scale}px;width:${rect.w * scale}px;height:${rect.h * scale}px`;
  d.innerHTML = easycodeLogoSvg(kind);
  return d;
}

function spriteSheet(): void {
  const cat = createCatSprite();
  const frames: Array<[string, CatState, number]> = [
    ['стоя 0', 'idle', CAT_FRAME_TIMES.stand[0]],
    ['стоя 1', 'idle', CAT_FRAME_TIMES.stand[1]],
    ['моргание', 'idle', CAT_FRAME_TIMES.blink],
    ...CAT_FRAME_TIMES.walk.map((t, i): [string, CatState, number] => [`шаг ${i}`, 'walk', t]),
  ];
  const dirs: Dir[] = ['down', 'up', 'right', 'left'];
  const Z = 2;
  const cw = CAT_W + 24;
  const ch = CAT_H + 30;
  const [c, g] = canvas(frames.length * cw * Z + 40, dirs.length * ch * Z + 40);
  g.fillStyle = '#c98a55';
  g.fillRect(0, 0, c.width, c.height);
  g.scale(Z, Z);
  g.imageSmoothingEnabled = false;
  g.font = '9px sans-serif';
  dirs.forEach((dir, row) =>
    frames.forEach(([name, state, t], col) => {
      const x = 20 + col * cw + cw / 2;
      const y = 14 + row * ch + CAT_H + 6;
      cat.draw(g, x, y, dir, state, t);
      g.fillStyle = '#000';
      g.fillText(`${dir} ${name}`, x - cw / 2 + 4, 12 + row * ch);
    }),
  );
  root.append(c);

  const logos = document.createElement('div');
  logos.style.cssText = 'position:relative;height:320px;background:#555';
  const Zl = 3;
  const place: Array<[BrandKind, Rect]> = [
    ['screen', { x: 5, y: 5, w: 80, h: 51 }],
    ['screen', { x: 95, y: 5, w: 46, h: 88 }],
    ['magnet', { x: 155, y: 5, w: 28, h: 28 }],
    ['poster', { x: 195, y: 5, w: 66, h: 84 }],
  ];
  for (const [kind, rect] of place) logos.append(brandBox(kind, rect, Zl));
  root.append(logos);
}

function dot(g: CanvasRenderingContext2D, p: Pt, color: string, r = 7): void {
  g.fillStyle = color;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
}

function box(g: CanvasRenderingContext2D, r: Rect, color: string, fill?: string): void {
  if (fill) {
    g.fillStyle = fill;
    g.fillRect(r.x, r.y, r.w, r.h);
  }
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.strokeRect(r.x, r.y, r.w, r.h);
}

async function roomView(n: RoomIndex): Promise<void> {
  const def = ROOMS_DEF[n];
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:1600px;height:900px';
  const [c, g] = canvas(1600, 900);
  wrap.append(c);
  root.append(wrap);
  const img = new Image();
  img.src = def.image;
  await img.decode();
  g.drawImage(img, 0, 0, 1600, 900);

  const grid = buildGrid(def);
  g.fillStyle = 'rgba(0, 255, 90, 0.22)';
  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.cols; col++)
      if (grid.walkable[row * grid.cols + col]) g.fillRect(col * grid.cell + 1, row * grid.cell + 1, grid.cell - 2, grid.cell - 2);
  for (const o of def.obstacles) box(g, o, 'rgba(255, 40, 40, 0.9)', 'rgba(255, 40, 40, 0.12)');
  g.font = 'bold 16px sans-serif';
  for (const o of def.objects) {
    box(g, o.rect, o.puzzleId ? '#ffd400' : '#ff9ad5');
    dot(g, o.approach, o.puzzleId ? '#ffd400' : '#ff9ad5');
    if (o.radius > 0) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.arc(o.approach.x, o.approach.y, o.radius, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.fillText(`${o.id}${o.puzzleId ? ` [${o.puzzleId}]` : ''}`, o.rect.x, o.rect.y - 4);
    if (o.brand && o.brandRect) wrap.append(brandBox(o.brand, o.brandRect, 1));
  }
  const ex = def.door.exit;
  if (ex) {
    box(g, ex.rect, '#35d0ff');
    dot(g, ex.approach, '#35d0ff');
    dot(g, ex.walkTo, '#35d0ff', 4);
    g.fillStyle = '#35d0ff';
    g.fillText(`выход → ${ex.dir}`, ex.rect.x, ex.rect.y - 4);
  }
  if (def.door.entry) dot(g, def.door.entry.from, '#b36bff');
  const cat = createCatSprite();
  cat.draw(g, def.spawn.x, def.spawn.y, 'down', 'idle', 0.05);
  dot(g, def.spawn, '#2f6bff', 4);
}

if (params.get('view') === 'room') {
  const n = Number(params.get('n') ?? '1') as RoomIndex;
  void roomView(n).then(() => (window.__ezqWorldReady = true));
} else {
  spriteSheet();
  window.__ezqWorldReady = true;
}
