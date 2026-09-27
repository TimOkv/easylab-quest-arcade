// Сцена квеста 1600×900: картинка-референс внутри «камеры» (CSS transform), hotspot-кнопки
// и оверлеи-эффекты решений (inline SVG / CSS). Координаты объектов задаются в пикселях
// исходной картинки 1586×992 и пересчитываются в координаты сцены (object-fit: cover).
import roomUrl from '../assets/room.jpg';
import type { RoomIndex } from '../core/types';
import { el } from '../core/dom';

export const STAGE_W = 1600;
export const STAGE_H = 900;
const IMG_W = 1586;
const IMG_H = 992;
const K = Math.max(STAGE_W / IMG_W, STAGE_H / IMG_H);
const OFF_X = (STAGE_W - IMG_W * K) / 2;
const OFF_Y = (STAGE_H - IMG_H * K) / 2;

/** Точка/прямоугольник картинки → координаты сцены. */
const sx = (ix: number): number => OFF_X + ix * K;
const sy = (iy: number): number => OFF_Y + iy * K;
type Rect = [x1: number, y1: number, x2: number, y2: number];

function place(node: HTMLElement, [x1, y1, x2, y2]: Rect): HTMLElement {
  node.style.left = `${sx(x1)}px`;
  node.style.top = `${sy(y1)}px`;
  node.style.width = `${(x2 - x1) * K}px`;
  node.style.height = `${(y2 - y1) * K}px`;
  return node;
}

interface Zone {
  /** Центр камеры (координаты картинки). */
  focus: [number, number];
  hotspot: Rect;
  label: string;
}

/** Зоны §9, подогнаны по скриншотам. */
const ZONES: Record<RoomIndex, Zone> = {
  1: { focus: [430, 285], hotspot: [352, 196, 488, 300], label: 'Ноутбук' },
  2: { focus: [1320, 340], hotspot: [1222, 168, 1458, 505], label: 'Умный шкаф' },
  3: { focus: [1195, 670], hotspot: [1000, 618, 1196, 760], label: 'Книга на столе' },
  4: { focus: [440, 575], hotspot: [680, 418, 790, 556], label: 'Котик' },
};
const CAT_FOCUS: [number, number] = [730, 480];
export const CAMERA_SCALE = 1.6;

export type CameraShot = RoomIndex | 'intro' | 'overview';

export interface Scene {
  stage: HTMLElement;
  /** Наезд камеры; `instant` — без перехода (первый кадр/перезагрузка). */
  focus(shot: CameraShot, instant?: boolean): void;
  /** Показать единственный активный hotspot (или скрыть все — null). */
  setActiveHotspot(room: RoomIndex | null): void;
  /** Включить эффект решённой комнаты. */
  setSolved(room: RoomIndex, animate?: boolean): void;
  destroy(): void;
}

// ------------------------------------------------------------------ оверлеи (статичная разметка)

const ROBOT_SVG = `<svg class="ezq-svg" viewBox="0 0 16 20" shape-rendering="crispEdges" aria-hidden="true">
<rect x="7" y="0" width="2" height="3" fill="#8e8a94"/><rect class="ezq-fx-robot__antenna" x="6" y="0" width="4" height="2" fill="#ffd23f"/>
<rect x="3" y="3" width="10" height="7" fill="#cad6ff"/><rect x="3" y="3" width="10" height="1" fill="#ffffff"/>
<rect x="2" y="5" width="1" height="3" fill="#8e8a94"/><rect x="13" y="5" width="1" height="3" fill="#8e8a94"/>
<rect x="4" y="4" width="8" height="5" fill="#141a3a"/>
<rect class="ezq-fx-robot__eye" x="5" y="5" width="2" height="2" fill="#556"/><rect class="ezq-fx-robot__eye" x="9" y="5" width="2" height="2" fill="#556"/>
<rect x="6" y="8" width="4" height="1" fill="#556"/>
<rect x="7" y="10" width="2" height="1" fill="#8e8a94"/>
<rect x="2" y="11" width="12" height="6" fill="#0068ff"/><rect x="2" y="11" width="12" height="1" fill="#9bc4ff"/>
<rect x="4" y="13" width="8" height="3" fill="#141a3a"/>
<rect class="ezq-fx-led ezq-fx-led--a" x="5" y="14" width="1" height="1" fill="#ff1f4b"/>
<rect class="ezq-fx-led ezq-fx-led--b" x="7" y="14" width="1" height="1" fill="#ffd23f"/>
<rect class="ezq-fx-led ezq-fx-led--c" x="9" y="14" width="2" height="1" fill="#2bd47d"/>
<rect x="0" y="12" width="2" height="4" fill="#8e8a94"/><rect x="14" y="12" width="2" height="4" fill="#8e8a94"/>
<rect x="4" y="17" width="3" height="3" fill="#3f2415"/><rect x="9" y="17" width="3" height="3" fill="#3f2415"/>
</svg>`;

const BOARD_SVG = `<svg class="ezq-svg" viewBox="0 0 16 12" shape-rendering="crispEdges" aria-hidden="true">
<rect width="16" height="12" fill="#0f5132"/><rect x="0" y="0" width="16" height="1" fill="#2bd47d"/>
<rect x="2" y="3" width="4" height="3" fill="#1b1b1b"/><rect x="8" y="3" width="6" height="4" fill="#141a3a"/>
<rect class="ezq-fx-board__sensor" x="9" y="4" width="4" height="2" fill="#ffd23f"/>
<rect x="1" y="8" width="14" height="1" fill="#c9a227"/><rect x="3" y="6" width="1" height="2" fill="#c9a227"/>
<rect class="ezq-fx-led ezq-fx-led--a" x="2" y="10" width="1" height="1" fill="#ff1f4b"/>
<rect class="ezq-fx-led ezq-fx-led--b" x="5" y="10" width="1" height="1" fill="#2bd47d"/>
<rect class="ezq-fx-led ezq-fx-led--c" x="8" y="10" width="1" height="1" fill="#00b8ff"/>
<rect class="ezq-fx-led ezq-fx-led--a" x="11" y="10" width="1" height="1" fill="#ffd23f"/>
</svg>`;

const SPEAKER_SVG = `<svg class="ezq-svg" viewBox="0 0 10 16" shape-rendering="crispEdges" aria-hidden="true">
<rect width="10" height="16" fill="#1b1b1b"/><rect x="0" y="0" width="10" height="1" fill="#3f2415"/>
<rect x="3" y="2" width="4" height="4" fill="#3a3f5c"/><rect x="4" y="3" width="2" height="2" fill="#8e8a94"/>
<rect class="ezq-fx-speaker__cone" x="2" y="8" width="6" height="6" fill="#3a3f5c"/><rect x="4" y="10" width="2" height="2" fill="#8e8a94"/>
</svg>`;

const DOOR_SVG = `<svg class="ezq-svg" viewBox="0 0 12 18" shape-rendering="crispEdges" aria-hidden="true" preserveAspectRatio="none">
<rect width="12" height="18" fill="#3f2415"/><rect x="1" y="1" width="10" height="17" fill="#0a0e22"/>
<rect x="2" y="2" width="8" height="16" fill="#141a3a"/><rect x="3" y="3" width="6" height="15" fill="#0068ff" opacity="0.35"/>
<rect x="5" y="5" width="2" height="2" fill="#9bc4ff"/><rect x="4" y="8" width="4" height="1" fill="#9bc4ff" opacity="0.6"/>
</svg>`;

// ------------------------------------------------------------------ сцена

export function createScene(): Scene {
  const stage = el('div', 'ezq-qstage');
  const cam = el('div', 'ezq-cam');
  cam.style.width = `${STAGE_W}px`;
  cam.style.height = `${STAGE_H}px`;
  const img = el('img', 'ezq-cam__img');
  img.src = roomUrl;
  img.alt = 'Пиксельная комната Easycode: рабочий стол, шкаф, библиотека и диван с котиком';
  img.draggable = false;
  img.style.left = `${OFF_X}px`;
  img.style.top = `${OFF_Y}px`;
  img.style.width = `${IMG_W * K}px`;
  img.style.height = `${IMG_H * K}px`;
  cam.appendChild(img);

  /** Кусок той же картинки (src) в точке (dx, dy); mirror — отразить по горизонтали. */
  const imgPatch = (src: Rect, dx: number, dy: number, mirror = false): HTMLElement => {
    const w = src[2] - src[0];
    const h = src[3] - src[1];
    const node = place(el('div', 'ezq-fx ezq-patch'), [dx, dy, dx + w, dy + h]);
    node.style.backgroundImage = `url("${roomUrl}")`;
    node.style.backgroundSize = `${IMG_W * K}px ${IMG_H * K}px`;
    node.style.backgroundPosition = `${-src[0] * K}px ${-src[1] * K}px`;
    if (mirror) node.style.transform = 'scaleX(-1)';
    return node;
  };
  // Заплатки поверх нарисованных в референсе UI-иконок (гамбургер, QR, рюкзак): фон #050811,
  // прямая кромка стены — копия соседнего участка, угол — зеркало левого угла стены.
  for (const r of [[10, 8, 110, 108], [1466, 6, 1580, 118], [1342, 6, 1466, 86]] as Rect[])
    cam.appendChild(place(el('div', 'ezq-fx ezq-patch ezq-patch--bg'), r));
  cam.append(imgPatch([1212, 84, 1310, 124], 1342, 84), imgPatch([116, 84, 154, 130], 1432, 84, true));

  // К1: экран монитора + индикатор терминала.
  const terminal = place(el('div', 'ezq-fx ezq-fx-terminal'), [372, 214, 462, 262]);
  terminal.append(el('span', 'ezq-fx-terminal__text', '> run'), el('span', 'ezq-fx-terminal__led'));

  // К2: плата с датчиком на двери шкафа и робот у шкафа.
  const board = place(el('div', 'ezq-fx ezq-fx-board'), [1300, 196, 1348, 232]);
  board.innerHTML = BOARD_SVG;
  const robot = place(el('div', 'ezq-fx ezq-fx-robot'), [1226, 392, 1290, 472]);
  robot.innerHTML = ROBOT_SVG;

  // К3: стеллаж (вырезка той же картинки) отъезжает и открывает потайную дверь.
  const shelfRect: Rect = [1318, 548, 1434, 732];
  const door = place(el('div', 'ezq-fx ezq-fx-door'), [1330, 575, 1422, 732]);
  door.innerHTML = DOOR_SVG;
  const shelf = imgPatch(shelfRect, shelfRect[0], shelfRect[1]);
  shelf.classList.add('ezq-fx-shelf');

  // К4: главный экран (ТВ) и аудиосистема.
  const tv = place(el('div', 'ezq-fx ezq-fx-tv'), [84, 560, 158, 700]);
  tv.append(el('span', 'ezq-fx-tv__text', 'MISSION\nSTART'));
  const speakers = place(el('div', 'ezq-fx ezq-fx-speakers'), [168, 612, 232, 668]);
  for (let i = 0; i < 2; i++) {
    const sp = el('div', 'ezq-fx-speaker');
    sp.innerHTML = SPEAKER_SVG;
    speakers.appendChild(sp);
  }
  for (let i = 0; i < 3; i++) speakers.appendChild(el('span', `ezq-fx-note ezq-fx-note--${i}`, i === 1 ? '♫' : '♪'));

  cam.append(terminal, board, robot, door, shelf, tv, speakers);
  const fx: Record<RoomIndex, HTMLElement[]> = { 1: [terminal], 2: [board, robot], 3: [shelf, door], 4: [tv, speakers] };

  const hotspots = {} as Record<RoomIndex, HTMLButtonElement>;
  for (const n of [1, 2, 3, 4] as RoomIndex[]) {
    const z = ZONES[n];
    const b = place(el('button', 'ezq-hotspot'), z.hotspot) as HTMLButtonElement;
    b.type = 'button';
    b.hidden = true;
    b.dataset.room = String(n);
    b.setAttribute('aria-label', `${z.label} — открыть загадку`);
    b.appendChild(el('span', 'ezq-hotspot__label', z.label));
    hotspots[n] = b;
    cam.appendChild(b);
  }

  stage.appendChild(cam);

  const focus = (shot: CameraShot, instant = false): void => {
    let s = CAMERA_SCALE;
    let p: [number, number];
    if (shot === 'overview') {
      s = 1;
      p = [IMG_W / 2, IMG_H / 2];
    } else if (shot === 'intro') {
      s = 1.9;
      p = CAT_FOCUS;
    } else p = ZONES[shot].focus;
    const cx = sx(p[0]);
    const cy = sy(p[1]);
    const tx = Math.min(0, Math.max(STAGE_W - STAGE_W * s, STAGE_W / 2 - cx * s));
    const ty = Math.min(0, Math.max(STAGE_H - STAGE_H * s, STAGE_H / 2 - cy * s));
    cam.classList.toggle('ezq-cam--instant', instant);
    cam.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    if (instant) void cam.offsetWidth; // зафиксировать кадр без перехода
    if (instant) requestAnimationFrame(() => cam.classList.remove('ezq-cam--instant'));
  };

  return {
    stage,
    focus,
    setActiveHotspot(room) {
      for (const n of [1, 2, 3, 4] as RoomIndex[]) hotspots[n].hidden = n !== room;
    },
    setSolved(room, animate = true) {
      for (const node of fx[room]) {
        node.classList.toggle('ezq-fx--instant', !animate);
        node.classList.add('ezq-fx--on');
      }
    },
    destroy: () => stage.remove(),
  };
}

export function onHotspot(scene: Scene, fn: (room: RoomIndex) => void): void {
  scene.stage.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest<HTMLButtonElement>('.ezq-hotspot');
    if (b && !b.hidden) fn(Number(b.dataset.room) as RoomIndex);
  });
}
