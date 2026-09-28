// UI квеста: Изик ходит по комнате (тап/клик по полу, стрелки/WASD), у светящегося предмета —
// «Пройти задачу»; панель загадки (лист/модалка), HUD, intro и триумф. Сцена — scene.ts,
// разметка комнат и ходьба — world/*; время — фиксированный шаг core/clock.
import './quest.css';
import type { Store } from '../core/state';
import { PUZZLES_BY_ROOM, roomOfPuzzle, type EasyQuestGameState, type PuzzleId, type RoomIndex } from '../core/types';
import { PLAYER_NAME_MAX, hasLocalBreakdown, isLegacyFormat } from '../core/rules';
import type { Sfx, SfxName } from '../services/sfx';
import type { Music } from '../services/music';
import { copyText, createMuteButton, createMusicButton, fitStage, showToast } from '../app/shell';
import type { QuestController } from './controller';
import { PUZZLES, type PuzzleView } from './puzzles';
import { button, el } from '../core/dom';
import { createRoomStage, STAGE_H, STAGE_W } from './scene';
import { coinIcon, confetti, countUp, flyCoins } from './effects';
import { ROOMS_DEF, type DecorSfx, type Dir, type Pt, type RoomDef, type RoomObject } from './world/rooms';
import { buildGrid, createWalker, findPath, type Grid, type Walker } from './world/walk';
import { CAT_H, createCatSprite } from './world/cat-sprite';
import { easycodeLogoSvg } from './world/brand';
import { advanceClock, createFixedClock, STEP_MS } from '../core/clock';
import { DOOR_OPEN_TEXT } from './texts';

export { DOOR_OPEN_TEXT };

export interface QuestScreenDeps {
  store: Store;
  sfx: Sfx;
  controller: QuestController;
  /** false — реестр куратора не подключён (демо-режим). */
  isServerConfigured: boolean;
  onGoToArcade(): void;
  /** Фоновая музыка: тема квеста, приглушение при открытой загадке. */
  music?: Music;
}

const ROOMS: RoomIndex[] = [1, 2, 3, 4];
/** Метка цели на полу, с. */
const MARKER_S = 0.6;

const KEY_VEC: Record<string, Pt> = {
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
};
const ACT_KEYS = new Set(['KeyE', 'Enter', 'NumpadEnter', 'Space']);

// Дверь и переход (История 26), с — время сцены (фиксированный шаг, на паузе стоит).
const WIPE_S = 0.6;
const FADE_S = 0.3;
const CARD_S = 1.5;
const DOOR_WALK_SPEED = 170;
// Декор (таблица «Декор»): оживание, облачко, не чаще раза в 4 с на предмет.
const DECOR_ALIVE_S = 0.4;
const SAY_S = 2.5;
const DECOR_COOLDOWN_S = 4;
/** Экран компьютера включается, когда Изик ближе этого к точке подхода. */
const SCREEN_ON_EXTRA = 20;
/** Звуки декора — на существующих патчах sfx. */
const DECOR_SOUND: Record<DecorSfx, SfxName> = { note: 'jump', click: 'click', ding: 'coin', noteUp: 'spring', purr: 'click' };
const ROTATE_QUERY = '(orientation: portrait) and (pointer: coarse)';

const isCoarse = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function catBubble(lines: string[]): HTMLElement {
  const wrap = el('div', 'ezq-cat');
  const face = el('span', 'ezq-cat__face', '🐱');
  face.setAttribute('aria-hidden', 'true');
  const bubble = el('div', 'ezq-cat__bubble');
  for (const line of lines) bubble.appendChild(el('p', 'ezq-cat__line', line));
  wrap.append(face, bubble);
  return wrap;
}

const placeRect = (node: HTMLElement, r: { x: number; y: number; w: number; h: number }): void => {
  node.style.left = `${r.x}px`;
  node.style.top = `${r.y}px`;
  node.style.width = `${r.w}px`;
  node.style.height = `${r.h}px`;
};

export function mountQuestScreen(host: HTMLElement, deps: QuestScreenDeps): { destroy(): void } {
  const { store, sfx, controller, music } = deps;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  let stopConfetti: () => void = () => {};

  const root = el('div', 'ezq-screen ezq-quest');
  const fxLayer = el('div', 'ezq-quest__fx');

  // ------------------------------------------------------------ HUD
  const hud = el('div', 'ezq-qhud');
  const hudLeft = el('div', 'ezq-qhud__group');
  const helpBtn = button('ezq-btn ezq-btn--icon ezq-qhud__help', '?');
  helpBtn.setAttribute('aria-label', 'Как играть');
  helpBtn.addEventListener('click', () => {
    sfx.play('click');
    showToast(
      `${isCoarse() ? 'Тапни по полу' : 'Жми стрелки/WASD или кликни по полу'} — Изик пойдёт туда. Подойди к светящемуся предмету и нажми «Пройти задачу». Чем меньше ошибок — тем больше EasyCoins!`,
      5000,
    );
  });
  hudLeft.append(createMuteButton(store, sfx), createMusicButton(store), helpBtn);

  const hudRight = el('div', 'ezq-qhud__group ezq-qhud__group--right');
  const roomLabel = el('div', 'ezq-qhud__room');
  const tasks = el('div', 'ezq-qhud__tasks');
  const coins = el('div', 'ezq-qhud__coins');
  coins.setAttribute('aria-label', 'EasyCoins');
  const coinsNum = el('span', 'ezq-qhud__coins-num', '0');
  const coinsMax = el('span', 'ezq-qhud__coins-max');
  coins.append(coinIcon(), coinsNum, coinsMax);
  hudRight.append(roomLabel, tasks, coins);
  hud.append(hudLeft, hudRight);

  let shownCoins = store.get().quest.totalCoinsEarned;
  coinsNum.textContent = String(shownCoins);

  function renderHud(s: EasyQuestGameState = store.get()): void {
    const n = room; // во время перехода HUD меняется вместе с комнатой, а не в момент advance()
    roomLabel.textContent = `Комната ${n} из 4 · ${ROOMS_DEF[n].title}`;
    const solved = PUZZLES_BY_ROOM[n].filter((pid) => s.quest.puzzles[pid].isSolved).length;
    tasks.textContent = `Загадки ${solved}/2`;
    tasks.classList.toggle('ezq-qhud__tasks--done', solved === 2);
    coinsMax.textContent = `/ ${s.quest.maxPossibleCoins}`;
    coins.setAttribute('aria-label', `EasyCoins: ${s.quest.totalCoinsEarned} из ${s.quest.maxPossibleCoins}`);
    hud.hidden = mode === 'intro';
  }

  // ------------------------------------------------------------ сцена
  const stageBox = el('div', 'ezq-quest__stagebox');
  const scene = createRoomStage();
  stageBox.appendChild(scene.stage);
  const sprite = scene.ctx ? createCatSprite() : null;
  const tip = el('div', 'ezq-qtip');
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  const banner = el('div', 'ezq-qbanner', DOOR_OPEN_TEXT);
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  const say = el('div', 'ezq-qsay');
  say.hidden = true;
  const wipe = el('div', 'ezq-qwipe');
  wipe.hidden = true;
  const roomCard = el('div', 'ezq-qcard');
  roomCard.hidden = true;
  scene.stage.append(wipe, roomCard);

  let room: RoomIndex = store.get().navigation.currentRoomIndex;
  let def: RoomDef = ROOMS_DEF[room];
  let grid: Grid = buildGrid(def);
  let walker: Walker = createWalker(grid, def.spawn);
  let marker: { p: Pt; t: number } | null = null;
  let near: RoomObject | null = null;
  const objEls = new Map<string, HTMLButtonElement>();
  const act = el('div', 'ezq-qact');
  act.hidden = true;

  let doorEl: HTMLButtonElement | null = null;
  const brandEls = new Map<string, HTMLElement>();
  /** Предметы/дверь, в зоне которых Изик стоит сейчас (срабатывание — на входе в зону). */
  const inZone = new Set<string>();
  const decorAt = new Map<string, number>();
  let sayUntil = 0;
  let cardUntil = 0;
  let posterLit = false;

  function enterRoom(n: RoomIndex): void {
    room = n;
    def = ROOMS_DEF[n];
    grid = buildGrid(def);
    walker = createWalker(grid, def.spawn);
    marker = null;
    near = null;
    held.clear();
    inZone.clear();
    decorAt.clear();
    hideSay();
    scene.bg.src = def.image;
    scene.bg.dataset.room = def.key;
    scene.stage.dataset.room = def.key;
    objEls.clear();
    brandEls.clear();
    scene.objects.replaceChildren();
    for (const o of def.objects) {
      if (!o.brand || !o.brandRect) continue;
      const b = el('div', `ezq-qbrand ezq-qbrand--${o.brand}`);
      b.innerHTML = easycodeLogoSvg(o.brand); // статичная SVG-константа
      b.dataset.obj = o.id;
      b.setAttribute('aria-hidden', 'true');
      placeRect(b, o.brandRect);
      brandEls.set(o.id, b);
      scene.objects.appendChild(b);
    }
    doorEl = null;
    const exit = def.door.exit;
    if (exit) {
      const d = button('ezq-qdoor', '');
      placeRect(d, exit.rect);
      const arrow = el('span', 'ezq-qdoor__arrow');
      arrow.setAttribute('aria-hidden', 'true');
      d.appendChild(arrow);
      d.addEventListener('click', () => {
        if (!canWalk()) return;
        if (inZone.has('door')) onDoorZone();
        else goTo(exit.approach);
      });
      doorEl = d;
      scene.objects.appendChild(d);
    }
    for (const o of def.objects) {
      if (o.radius <= 0) continue;
      const b = button(`ezq-qobj${o.puzzleId ? ' ezq-qobj--puzzle' : ' ezq-qobj--decor'}`, '');
      placeRect(b, o.rect);
      b.dataset.obj = o.id;
      if (o.puzzleId) b.dataset.puzzle = o.puzzleId;
      b.addEventListener('click', () => {
        if (o.decor && canWalk() && inZone.has(o.id)) poke(o);
        else goTo(o.approach);
      });
      objEls.set(o.id, b);
      scene.objects.appendChild(b);
    }
    scene.ui.replaceChildren(act, banner, say);
    renderObjects();
    renderAction();
    renderHud();
  }

  /** Дверь: закрыта / открыта (свечение, стрелка, плашка до входа). */
  function renderDoor(s: EasyQuestGameState = store.get()): void {
    const open = !!def.door.exit && controller.isRoomCleared(room) && !s.quest.isCompleted;
    if (doorEl) {
      doorEl.classList.toggle('ezq-qdoor--open', open);
      doorEl.dataset.state = open ? 'open' : 'closed';
      doorEl.setAttribute('aria-label', open ? 'Дверь в следующую комнату — открыта' : 'Дверь — закрыта');
    }
    banner.hidden = !(open && (mode === 'walk' || mode === 'puzzle'));
  }

  /** Бренд: экраны компьютеров включаются при подходе и после решения; постер — в финале. */
  function renderBrand(s: EasyQuestGameState = store.get()): void {
    for (const o of def.objects) {
      const b = brandEls.get(o.id);
      if (!b) continue;
      if (o.brand === 'screen') {
        const solved = !!o.puzzleId && s.quest.puzzles[o.puzzleId].isSolved;
        const close = Math.hypot(walker.pos.x - o.approach.x, walker.pos.y - o.approach.y) <= o.radius + SCREEN_ON_EXTRA;
        b.classList.toggle('ezq-qbrand--on', solved || (close && mode !== 'intro'));
      } else if (o.brand === 'poster') {
        b.classList.toggle('ezq-qbrand--on', posterLit);
      }
    }
  }

  function renderObjects(s: EasyQuestGameState = store.get()): void {
    for (const o of def.objects) {
      const b = objEls.get(o.id);
      if (!b) continue;
      const solved = !!o.puzzleId && s.quest.puzzles[o.puzzleId].isSolved;
      b.classList.toggle('ezq-qobj--solved', solved);
      b.setAttribute('aria-label', o.puzzleId ? `${o.label}: ${solved ? 'загадка решена' : 'загадка — подойти'}` : `${o.label} — подойти`);
      if (solved && !b.firstChild) {
        const check = el('span', 'ezq-qobj__check', '✓');
        check.setAttribute('aria-hidden', 'true');
        b.appendChild(check);
      }
    }
    renderDoor(s);
    renderBrand(s);
  }

  /** Кнопка «Пройти задачу» / «Решено ✓ +N» над предметом, у которого стоит Изик. */
  function renderAction(): void {
    const o = mode === 'walk' ? near : null;
    if (!o || !o.puzzleId) {
      act.hidden = true;
      act.replaceChildren();
      delete act.dataset.obj;
      return;
    }
    const pid = o.puzzleId;
    const p = store.get().quest.puzzles[pid];
    const key = `${o.id}:${p.isSolved ? 's' : 'o'}`;
    if (act.dataset.obj === key && !act.hidden) return;
    act.dataset.obj = key;
    act.hidden = false;
    act.style.left = `${Math.min(STAGE_W - 170, Math.max(170, o.rect.x + o.rect.w / 2))}px`;
    act.style.top = `${Math.max(190, o.rect.y + Math.min(o.rect.h * 0.35, 90))}px`;
    if (p.isSolved) {
      act.replaceChildren(el('span', 'ezq-qact__done', `Решено ✓ +${p.earnedCoins}`));
      return;
    }
    const go = button('ezq-btn ezq-qact__go', 'Пройти задачу');
    go.addEventListener('click', () => openPuzzle(pid));
    if (!isCoarse()) {
      const kbd = el('kbd', 'ezq-qact__key', 'E');
      kbd.setAttribute('aria-hidden', 'true');
      go.appendChild(kbd);
    }
    act.replaceChildren(go);
    sfx.play('click');
  }

  function updateNear(): void {
    let best: RoomObject | null = null;
    let bestD = Infinity;
    for (const o of def.objects) {
      if (o.radius <= 0 || !o.puzzleId) continue;
      const d = Math.hypot(walker.pos.x - o.approach.x, walker.pos.y - o.approach.y);
      if (d <= o.radius && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    if (best !== near) {
      near = best;
      renderAction();
    }
  }

  const within = (o: { approach: Pt; radius: number }): boolean =>
    Math.hypot(walker.pos.x - o.approach.x, walker.pos.y - o.approach.y) <= o.radius;

  /** Вход в зону декора и двери — срабатывание на входе, не каждый кадр. */
  function updateZones(): void {
    for (const o of def.objects) {
      if (!o.decor || o.radius <= 0) continue;
      if (within(o)) {
        if (!inZone.has(o.id)) {
          inZone.add(o.id);
          poke(o);
        }
      } else inZone.delete(o.id);
    }
    const exit = def.door.exit;
    if (exit) {
      if (within(exit)) {
        if (!inZone.has('door')) {
          inZone.add('door');
          onDoorZone();
        }
      } else inZone.delete('door');
    }
    renderBrand();
  }

  /** Декор оживает (0,4 с), Изик говорит реплику (2,5 с), звучит звук; не чаще раза в 4 с. */
  function poke(o: RoomObject): void {
    if (!o.decor) return;
    const last = decorAt.get(o.id);
    if (last !== undefined && simT - last < DECOR_COOLDOWN_S) return;
    decorAt.set(o.id, simT);
    const b = objEls.get(o.id);
    if (b) {
      b.classList.remove('ezq-qobj--alive');
      void b.offsetWidth;
      b.classList.add('ezq-qobj--alive');
      b.style.setProperty('--ezq-alive-s', `${DECOR_ALIVE_S}s`);
    }
    showSay(o.decor.line, 'decor');
    sfx.play(DECOR_SOUND[o.decor.sfx]);
  }

  function onDoorZone(): void {
    if (!def.door.exit || mode !== 'walk') return;
    if (controller.isRoomCleared(room)) {
      startDoor();
      return;
    }
    const k = PUZZLES_BY_ROOM[room].filter((pid) => store.get().quest.puzzles[pid].isSolved).length;
    showSay(`Дверь закрыта — реши обе загадки (${k}/2)`, 'door');
    sfx.play('wrong');
  }

  function showSay(text: string, kind: 'decor' | 'door'): void {
    say.textContent = text;
    say.className = `ezq-qsay ezq-qsay--${kind}`;
    say.hidden = false;
    sayUntil = simT + SAY_S;
    placeSay();
  }
  function hideSay(): void {
    say.hidden = true;
    sayUntil = 0;
  }
  function placeSay(): void {
    say.style.left = `${Math.min(STAGE_W - 230, Math.max(230, walker.pos.x))}px`;
    say.style.top = `${Math.max(150, walker.pos.y - CAT_H - 8)}px`;
  }

  // ------------------------------------------------------------ ввод
  const held = new Set<string>();
  const canWalk = (): boolean => mode === 'walk';

  function goTo(target: Pt): void {
    if (!canWalk()) return;
    const path = findPath(grid, walker.pos, target);
    if (!path.length) return;
    walker.setPath(path);
    marker = { p: path[path.length - 1], t: now() };
  }

  function stopWalking(): void {
    held.clear();
    walker.setInput({ x: 0, y: 0 });
    walker.setPath([]);
    marker = null;
  }

  function keyVector(): Pt {
    let x = 0;
    let y = 0;
    for (const k of held) {
      x += KEY_VEC[k].x;
      y += KEY_VEC[k].y;
    }
    return { x: Math.sign(x), y: Math.sign(y) };
  }

  const onPointerDown = (e: PointerEvent): void => {
    if (!canWalk() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as Element | null)?.closest('button, .ezq-qact')) return;
    goTo(scene.toStage(e.clientX, e.clientY));
  };
  scene.stage.addEventListener('pointerdown', onPointerDown);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!canWalk() || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (KEY_VEC[e.code]) {
      e.preventDefault();
      if (!held.has(e.code)) {
        held.add(e.code);
        walker.setInput(keyVector());
      }
      return;
    }
    if (ACT_KEYS.has(e.code) && !e.repeat) {
      // Enter/Пробел на сфокусированной кнопке — её собственный клик.
      if (e.code !== 'KeyE' && t?.closest('button')) return;
      if (near?.puzzleId && !store.get().quest.puzzles[near.puzzleId].isSolved) {
        e.preventDefault();
        openPuzzle(near.puzzleId);
      }
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (!held.delete(e.code)) return;
    if (canWalk()) walker.setInput(keyVector());
  };
  const onBlur = (): void => {
    held.clear();
    if (canWalk()) walker.setInput({ x: 0, y: 0 });
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // ------------------------------------------------------------ цикл
  const clock = createFixedClock();
  const t0 = performance.now();
  const now = (): number => (performance.now() - t0) / 1000;
  /** Время сцены, с: идёт только шагами цикла (на паузе «Поверни телефон» стоит). */
  let simT = 0;
  /** Хореография по времени сцены (панель → постер → триумф): на паузе «Поверни телефон» стоит вместе с ходьбой. */
  const cues: { at: number; fn: () => void }[] = [];
  const cue = (fn: () => void, seconds: number): void => {
    cues.push({ at: simT + seconds, fn });
    cues.sort((a, b) => a.at - b.at);
  };
  let raf = 0;
  let lastTs = 0;
  let tipArmed = false;
  let paused = false;

  function frame(ts: number): void {
    raf = requestAnimationFrame(frame);
    if (paused) {
      lastTs = 0;
      return;
    }
    const dt = lastTs ? Math.min(250, ts - lastTs) : STEP_MS;
    lastTs = ts;
    const steps = advanceClock(clock, dt);
    for (let i = 0; i < steps; i++) {
      simT += STEP_MS / 1000;
      if (mode === 'walk') walker.step(STEP_MS / 1000);
      else if (mode === 'door') stepDoor();
    }
    while (cues.length && cues[0].at <= simT) cues.shift()!.fn();
    if (mode === 'walk') {
      if (tipArmed && walker.moving) hideTip();
      updateNear();
      updateZones();
    }
    if (!say.hidden) {
      if (simT >= sayUntil) hideSay();
      else placeSay();
    }
    if (!roomCard.hidden && simT >= cardUntil) roomCard.hidden = true;
    if (mode !== 'triumph') draw();
  }

  /** Цвет кольца-метки клика — токен `--ezq-gold` (canvas не понимает var(), читаем значение с корня). */
  let markerColor: string | null = null;
  const tokenColor = (name: string): string => {
    try {
      return getComputedStyle(root).getPropertyValue(name).trim();
    } catch {
      return '';
    }
  };

  function draw(): void {
    const ctx = scene.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    const t = now();
    if (marker) {
      const k = (t - marker.t) / MARKER_S;
      if (k >= 1) marker = null;
      else {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        markerColor ||= tokenColor('--ezq-gold');
        if (markerColor) ctx.strokeStyle = markerColor;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(marker.p.x, marker.p.y, 14 + k * 18, (14 + k * 18) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (!sprite) return;
    if (door) {
      if (door.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = door.alpha;
      sprite.draw(ctx, door.pos.x, door.pos.y, door.dir, door.walking ? 'walk' : 'idle', t);
      ctx.restore();
      return;
    }
    sprite.draw(ctx, walker.pos.x, walker.pos.y, walker.dir, walker.moving ? 'walk' : 'idle', t);
  }

  // ------------------------------------------------------------ дверь и переход (История 26)
  const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  type DoorPhase = 'out' | 'close' | 'open';
  let door: {
    phase: DoorPhase;
    t: number; // начало фазы, время сцены
    from: Pt;
    to: Pt;
    /** Уход в дверь: по сетке до exit.approach, затем к exit.walkTo (первая точка — from). */
    route: Pt[];
    walkS: number;
    pos: Pt;
    dir: Dir;
    walking: boolean;
    alpha: number;
    reduced: boolean;
  } | null = null;

  const smooth = (k: number): number => k * k * (3 - 2 * k);
  const walkTime = (a: Pt, b: Pt): number => Math.min(1, Math.max(0.4, Math.hypot(b.x - a.x, b.y - a.y) / DOOR_WALK_SPEED));
  const routeLen = (route: Pt[]): number => route.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - route[i - 1].x, p.y - route[i - 1].y) : 0), 0);
  const faceTo = (a: Pt, b: Pt, last: Dir): Dir => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return last;
    return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  };
  /** Точка на ломаной при доле пути k; на последнем отрезке Изик смотрит по exit.dir. */
  function alongRoute(route: Pt[], k: number, lastDir: Dir): { pos: Pt; dir: Dir } {
    let left = routeLen(route) * k;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const dir = i === route.length - 1 ? lastDir : faceTo(a, b, lastDir);
      if (left <= len || i === route.length - 1) {
        const f = len > 0 ? Math.min(1, left / len) : 1;
        return { pos: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, dir };
      }
      left -= len;
    }
    return { pos: { ...route[route.length - 1] }, dir: lastDir };
  }

  /** Изик в зоне открытой двери: номер комнаты сохраняется сразу, дальше — только анимация. */
  function startDoor(): void {
    const exit = def.door.exit;
    if (!exit || mode !== 'walk' || !controller.advance()) return;
    const from = { x: walker.pos.x, y: walker.pos.y };
    const reduced = reducedMotion();
    setMode('door');
    hideSay();
    hideTip();
    // Зона сработала не в точке подхода — сначала по сетке до неё, потом в проём.
    const route = [from, ...findPath(grid, from, exit.approach), exit.walkTo];
    const walkS = reduced ? 0 : Math.min(1, Math.max(0.4, routeLen(route) / DOOR_WALK_SPEED));
    const dir = route.length > 2 ? faceTo(route[0], route[1], exit.dir) : exit.dir;
    door = { phase: 'out', t: simT, from, to: exit.walkTo, route, walkS, pos: { ...from }, dir, walking: !reduced, alpha: 1, reduced };
    if (reduced) setDoorPhase('close');
  }

  function setDoorPhase(phase: DoorPhase): void {
    if (!door) return;
    door.phase = phase;
    door.t = simT;
    wipe.hidden = false;
    wipe.classList.toggle('ezq-qwipe--fade', door.reduced);
  }

  function setWipe(k: number, c: Pt): void {
    // k — доля затемнения: 0 — сцена видна, 1 — всё закрыто.
    if (door?.reduced) {
      wipe.style.opacity = String(k);
      return;
    }
    const cy = c.y - CAT_H * 0.45;
    const far = Math.max(Math.hypot(c.x, cy), Math.hypot(STAGE_W - c.x, cy), Math.hypot(c.x, STAGE_H - cy), Math.hypot(STAGE_W - c.x, STAGE_H - cy));
    wipe.style.opacity = '1';
    wipe.style.setProperty('--ezq-wx', `${c.x.toFixed(1)}px`);
    wipe.style.setProperty('--ezq-wy', `${cy.toFixed(1)}px`);
    wipe.style.setProperty('--ezq-wr', `${((1 - k) * (far + 20)).toFixed(1)}px`);
  }

  function stepDoor(): void {
    const d = door;
    if (!d) return;
    const age = simT - d.t;
    if (d.phase === 'out') {
      const k = Math.min(1, age / d.walkS);
      const at = alongRoute(d.route, k, def.door.exit?.dir ?? d.dir);
      d.pos = at.pos;
      d.dir = at.dir;
      d.alpha = 1 - 0.5 * Math.max(0, (k - 0.5) / 0.5); // тает в проёме
      if (k >= 1) {
        d.walking = false;
        setDoorPhase('close');
      }
      return;
    }
    if (d.phase === 'close') {
      const dur = d.reduced ? FADE_S : WIPE_S;
      const k = Math.min(1, age / dur);
      d.alpha = 0.5 * (1 - k);
      setWipe(smooth(k), d.pos);
      if (k < 1) return;
      // Новая комната: Изик в проёме входа, круг раскрывается на нём.
      const next = store.get().navigation.currentRoomIndex;
      enterRoom(next);
      sfx.play('door');
      const entry = def.door.entry;
      const from = entry && !d.reduced ? entry.from : def.spawn;
      d.from = from;
      d.to = def.spawn;
      d.pos = { ...from };
      d.dir = entry?.dir ?? 'down';
      d.walkS = from === def.spawn ? 0 : walkTime(from, def.spawn);
      d.walking = d.walkS > 0;
      d.alpha = 1;
      roomCard.textContent = `Комната ${next} из 4 · ${def.title}`;
      roomCard.hidden = false;
      cardUntil = simT + CARD_S;
      setDoorPhase('open');
      setWipe(1, d.pos);
      return;
    }
    const dur = d.reduced ? FADE_S : WIPE_S;
    setWipe(1 - smooth(Math.min(1, age / dur)), d.pos);
    if (d.walkS > 0) {
      const k = Math.min(1, age / d.walkS);
      d.pos = { x: d.from.x + (d.to.x - d.from.x) * k, y: d.from.y + (d.to.y - d.from.y) * k };
      d.walking = k < 1;
    }
    if (age >= dur && !d.walking) {
      wipe.hidden = true;
      walker.place(def.spawn, d.dir);
      door = null;
      setMode('walk');
    }
  }

  function showTip(): void {
    tip.textContent = isCoarse()
      ? 'Тапни по полу — Изик пойдёт туда. Подойди к светящемуся предмету'
      : 'Стрелки/WASD или клик по полу — Изик пойдёт туда. Подойди к светящемуся предмету';
    tip.hidden = false;
    tipArmed = true;
  }
  function hideTip(): void {
    tipArmed = false;
    tip.hidden = true;
  }

  // ------------------------------------------------------------ панель
  const panel = el('section', 'ezq-qpanel');
  const panelInner = el('div', 'ezq-qpanel__inner ezq-scroll');
  /** Закреплённый низ панели: действия всегда видны, прокручивается только содержимое. */
  const panelFooter = el('div', 'ezq-qpanel__footer');
  panel.append(panelInner, panelFooter);
  const setPanel = (content: Node[], footer: Node[] = []): void => {
    panelInner.replaceChildren(...content);
    panelFooter.replaceChildren(...footer);
    panelInner.scrollTop = 0;
  };

  type Mode = 'intro' | 'walk' | 'puzzle' | 'door' | 'triumph';
  let mode: Mode = 'walk';
  let view: PuzzleView | null = null;
  let viewPid: PuzzleId | null = null;
  let puzzleBox: HTMLElement | null = null;

  const setMode = (m: Mode): void => {
    mode = m;
    panel.dataset.mode = m;
    root.dataset.mode = m;
    panel.hidden = m === 'walk' || m === 'door' || m === 'triumph';
    music?.duck(m === 'puzzle');
    if (m !== 'walk') stopWalking();
    renderAction();
    renderObjects();
    renderHud();
  };

  const shake = (node: HTMLElement): void => {
    node.classList.remove('ezq-shake');
    void node.offsetWidth;
    node.classList.add('ezq-shake');
  };

  // ---- intro
  function showIntro(): void {
    setMode('intro');
    const form = el('form', 'ezq-intro');
    form.noValidate = true;
    const input = el('input', 'ezq-intro__input');
    input.type = 'text';
    input.id = 'ezq-intro-name';
    input.maxLength = PLAYER_NAME_MAX;
    input.setAttribute('autocomplete', 'nickname');
    input.enterKeyHint = 'go';
    input.value = store.get().leaderboard.playerName.slice(0, PLAYER_NAME_MAX);
    input.placeholder = 'Например, Маша';
    const label = el('label', 'ezq-intro__label', 'Как тебя зовут?');
    label.htmlFor = input.id;
    const err = el('p', 'ezq-intro__error');
    err.setAttribute('role', 'alert');
    const start = el('button', 'ezq-btn ezq-btn--big ezq-intro__start', 'Начать квест');
    start.type = 'submit';
    form.append(label, input, err, start);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sfx.unlock();
      const res = controller.startQuest(input.value);
      if (!res.ok) {
        err.textContent = res.message;
        sfx.play('wrong');
        shake(form);
        input.focus();
        return;
      }
      sfx.play('click');
      input.blur();
      setMode('walk');
      showTip();
    });
    setPanel([
      catBubble([
        'Мяу! Я Изик — котик Easycode.',
        `Помоги мне пройти 4 комнаты моего дома: в каждой по 2 загадки про код. За разгадки получишь EasyCoins — до ${store.get().quest.maxPossibleCoins}!`,
      ]),
      form,
    ]);
  }

  function closePanel(): void {
    refs = null;
    setPanel([]);
    setMode('walk');
  }

  function destroyView(): void {
    view?.destroy();
    view = null;
    viewPid = null;
    puzzleBox = null;
  }

  // ---- загадка
  function openPuzzle(pid: PuzzleId): void {
    const s = store.get();
    const room = s.navigation.currentRoomIndex;
    if (s.quest.isCompleted || mode !== 'walk' || roomOfPuzzle(pid) !== room || s.quest.puzzles[pid].isSolved) return;
    sfx.play('click');
    stopWalking();
    setMode('puzzle');
    const def = PUZZLES[pid];

    const head = el('div', 'ezq-qpanel__head');
    const close = button('ezq-btn ezq-btn--icon ezq-qpanel__close', '✕');
    close.setAttribute('aria-label', 'Свернуть загадку');
    close.addEventListener('click', () => {
      if (checking) return;
      sfx.play('click');
      closePanel(); // собранный ответ (view) сохраняется до следующего открытия
    });
    head.append(el('span', 'ezq-qpanel__room', `${ROOMS_DEF[room].title} · ${def.title}`), close);
    const stakeLine = el('p', 'ezq-qpanel__stake');

    if (!puzzleBox || viewPid !== pid) {
      destroyView();
      puzzleBox = el('div', 'ezq-pz');
      viewPid = pid;
      view = def.render(puzzleBox, {
        onAnswerChange: (ready: boolean) => {
          answerReady = ready;
          syncButtons();
        },
      });
    }

    const feedback = el('div', 'ezq-qpanel__feedback');
    feedback.setAttribute('role', 'status');
    const hintsList = el('div', 'ezq-qpanel__hints');
    const confirmBox = el('div', 'ezq-qpanel__confirm');
    confirmBox.hidden = true;
    const actions = el('div', 'ezq-qpanel__actions');
    const hintBtn = button('ezq-btn ezq-btn--ghost ezq-qpanel__hint', 'Подсказка');
    const checkBtn = button('ezq-btn ezq-btn--big ezq-qpanel__check', 'Проверить');
    actions.append(hintBtn, checkBtn);

    setPanel([head, catBubble([def.intro]), stakeLine, puzzleBox, feedback, hintsList], [confirmBox, actions]);
    refs = { feedback, hintsList, confirmBox, actions, hintBtn, checkBtn, stakeLine, room, pid };
    hintBtn.addEventListener('click', onHintClick);
    checkBtn.addEventListener('click', onCheck);
    renderHints();
    syncButtons();
    renderHud();
    (puzzleBox.querySelector('button:not([hidden])') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  let answerReady = false;
  let checking = false;
  let refs: {
    feedback: HTMLElement;
    hintsList: HTMLElement;
    confirmBox: HTMLElement;
    actions: HTMLElement;
    hintBtn: HTMLButtonElement;
    checkBtn: HTMLButtonElement;
    stakeLine: HTMLElement;
    room: RoomIndex;
    pid: PuzzleId;
  } | null = null;

  function syncButtons(): void {
    if (!refs) return;
    const solved = store.get().quest.puzzles[refs.pid].isSolved;
    refs.checkBtn.disabled = !answerReady || checking || solved;
    refs.checkBtn.hidden = solved;
    refs.checkBtn.textContent = checking ? 'Проверяю…' : 'Проверить';
  }

  function renderHints(): void {
    if (!refs) return;
    const r = store.get().quest.puzzles[refs.pid];
    refs.stakeLine.hidden = r.isSolved;
    refs.stakeLine.textContent = `Сейчас за верный ответ: ${controller.currentReward(refs.pid)} EasyCoins`;
    const def = PUZZLES[refs.pid];
    refs.hintsList.replaceChildren();
    for (let i = 0; i < r.hintsUsed; i++) {
      const item = el('div', `ezq-qpanel__hint-item ezq-qpanel__hint-item--${i + 1}`);
      item.append(el('b', 'ezq-qpanel__hint-cap', i === 0 ? 'Подсказка 1' : 'Подсказка 2'), el('p', 'ezq-qpanel__hint-text', def.hints[i]));
      refs.hintsList.appendChild(item);
    }
    const b = refs.hintBtn;
    b.classList.remove('ezq-pulse');
    if (r.isSolved || r.hintsUsed >= 2) b.hidden = true;
    else if (r.hintsUsed === 0) {
      b.hidden = !controller.canUseHint(refs.pid, 1);
      b.textContent = 'Подсказка';
    } else {
      b.hidden = !controller.canUseHint(refs.pid, 2);
      b.textContent = 'Ещё подсказка — без монет';
      if (r.attempts >= 2) b.classList.add('ezq-pulse');
    }
  }

  function onHintClick(): void {
    if (!refs || checking) return;
    const pid = refs.pid;
    const used = store.get().quest.puzzles[pid].hintsUsed;
    sfx.play('click');
    if (used === 0) {
      controller.useHint(pid);
      renderHints();
      renderHud();
      refs.hintsList.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const box = refs.confirmBox;
    box.hidden = false;
    const yes = button('ezq-btn ezq-btn--danger', 'Открыть');
    const no = button('ezq-btn ezq-btn--ghost', 'Не надо');
    const row = el('div', 'ezq-qpanel__actions');
    row.append(no, yes);
    box.replaceChildren(el('p', 'ezq-qpanel__confirm-text', 'Эта подсказка почти решает загадку. Монеты за эту загадку не начислятся. Открыть?'), row);
    no.addEventListener('click', () => {
      sfx.play('click');
      box.hidden = true;
    });
    yes.addEventListener('click', () => {
      controller.useHint(pid);
      sfx.play('click');
      box.hidden = true;
      renderHints();
      renderHud();
      refs?.hintsList.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    no.focus({ preventScroll: true });
  }

  function onCheck(): void {
    if (!refs || !view || checking || !answerReady) return;
    const { room, pid } = refs;
    checking = true;
    syncButtons();
    const res = controller.submit(pid, view.getAnswer()); // попытка уже в сохранении
    renderHud();
    later(() => {
      checking = false;
      if (!refs || refs.pid !== pid) return;
      if (res.correct) onSolved(room, pid, res.reward ?? 0);
      else {
        sfx.play('wrong');
        refs.feedback.className = 'ezq-qpanel__feedback ezq-qpanel__feedback--error';
        refs.feedback.textContent = res.message ?? 'Пока не то. Попробуй ещё!';
        refs.feedback.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        shake(panel);
        renderHints();
        syncButtons();
      }
    }, 420);
  }

  function onSolved(room: RoomIndex, pid: PuzzleId, reward: number): void {
    if (!refs) return;
    sfx.play('correct');
    view?.showSolvedState();
    const roomCleared = controller.isRoomCleared(room);
    const done = store.get().quest.isCompleted;
    renderObjects();
    refs.feedback.className = 'ezq-qpanel__feedback ezq-qpanel__feedback--ok';
    refs.feedback.replaceChildren(
      el('b', 'ezq-qpanel__reward', reward > 0 ? `Верно! +${reward} EasyCoins` : 'Верно! Эта загадка без монет — зато ты разобрался.'),
      el(
        'p',
        'ezq-qpanel__story',
        done
          ? 'Мяу, это была последняя загадка! Сейчас будет кое-что особенное…'
          : roomCleared
            ? 'Мур! Обе загадки этой комнаты решены — идём дальше!'
            : 'Отлично! Здесь есть ещё один светящийся предмет — пойдём к нему.',
      ),
    );
    refs.hintBtn.hidden = true;
    refs.confirmBox.hidden = true;
    refs.stakeLine.hidden = true;
    syncButtons();
    awardCoins(refs.feedback, reward);
    renderHud();
    // Панель сворачивается, и Изик снова ходит по комнате. В финале — загорается постер Easycode, затем триумф.
    cue(() => {
      if (done) lightPoster();
      if (triumph || mode !== 'puzzle' || refs?.pid !== pid) return;
      closePanel();
    }, 1.4);
    if (done) {
      finaleCued = true;
      cue(showTriumph, 3);
    }
  }

  function awardCoins(from: HTMLElement, reward: number): void {
    const to = store.get().quest.totalCoinsEarned;
    const start = shownCoins;
    shownCoins = to;
    if (reward <= 0) {
      coinsNum.textContent = String(to);
      return;
    }
    flyCoins(fxLayer, from.getBoundingClientRect(), coins.getBoundingClientRect(), Math.ceil(reward / 4), () => {
      sfx.play('coin');
      coins.classList.remove('ezq-bump');
      void coins.offsetWidth;
      coins.classList.add('ezq-bump');
      countUp(coinsNum, start, to);
    });
  }

  function lightPoster(): void {
    if (posterLit) return;
    posterLit = true;
    renderBrand();
  }

  // ------------------------------------------------------------ триумф
  let triumph: HTMLElement | null = null;
  /** Финал уже идёт по часам сцены (постер → триумф) — подписка на store его не обгоняет. */
  let finaleCued = false;
  let syncLine: HTMLElement | null = null;

  function renderSync(s: EasyQuestGameState = store.get()): void {
    if (!syncLine) return;
    syncLine.className = 'ezq-triumph__sync';
    if (!deps.isServerConfigured) {
      syncLine.textContent = 'Реестр куратора пока не подключён — просто покажи этот код куратору.';
      syncLine.classList.add('ezq-triumph__sync--demo');
    } else if (s.quest.isSyncedWithCurator) {
      syncLine.textContent = 'Отправлено куратору ✓';
      syncLine.classList.add('ezq-triumph__sync--ok');
    } else if (s.quest.lastSyncError === 'BAD_COINS') {
      syncLine.textContent = 'Реестр не принял данные — покажи код куратору';
      syncLine.classList.add('ezq-triumph__sync--error');
    } else {
      syncLine.textContent = 'Отправим куратору, как только появится интернет — код уже твой.';
      syncLine.classList.add('ezq-triumph__sync--pending');
    }
  }

  let triumphRefs: { leadText: HTMLElement; table: HTMLElement; codeEl: HTMLElement } | null = null;

  /**
   * Итог на триумфе: монеты, код и суммы комнат. Перерисовывается, когда сервер подменил прохождение
   * (register → restored: true): у восстановленного итог серверный, а местные комнаты к нему не относятся — их не показываем.
   */
  function renderTriumphResult(s: EasyQuestGameState): void {
    if (!triumphRefs) return;
    const { leadText, table, codeEl } = triumphRefs;
    leadText.textContent = `Ты заработал ${s.quest.totalCoinsEarned} EasyCoins из ${s.quest.maxPossibleCoins} возможных!`;
    const code = s.quest.verificationCode ?? '';
    codeEl.textContent = code;
    codeEl.setAttribute('aria-label', `Личный ID ${code.split('').join(' ')}`);
    table.textContent = '';
    table.hidden = !hasLocalBreakdown(s.quest);
    if (table.hidden) return;
    // Квест на 75: одна загадка в комнате, по загадкам данных нет — только суммы комнаты.
    const legacy = isLegacyFormat(s.quest);
    for (const n of ROOMS) {
      const r = s.quest.rooms[n];
      const li = el('li', 'ezq-triumph__room');
      // Суммы комнаты: «с первой попытки» — каждая загадка решена с первого раза; «с подсказкой» —
      // у какой-то загадки открыта вторая (большая) подсказка.
      const pids = PUZZLES_BY_ROOM[n];
      const tries = r.attempts <= (legacy ? 1 : pids.length) ? 'с первой попытки' : `попыток: ${r.attempts}`;
      const bigHint = legacy ? r.hintsUsed >= 2 : pids.some((pid) => s.quest.puzzles[pid].hintsUsed >= 2);
      li.append(
        el('span', 'ezq-triumph__room-name', `${n}. ${ROOMS_DEF[n].title}`),
        el('span', 'ezq-triumph__room-tries', bigHint ? `${tries}, с подсказкой` : tries),
        el('b', 'ezq-triumph__room-coins', `${r.earnedCoins} / ${r.maxReward}`),
      );
      table.appendChild(li);
    }
  }

  function showTriumph(): void {
    if (triumph) return;
    const s = store.get();
    if (!s.quest.isCompleted) return;
    posterLit = true;
    setMode('triumph');
    destroyView();
    refs = null;
    stopWalking();
    renderAction();
    music?.duck(false);
    sfx.play('fanfare');

    triumph = el('div', 'ezq-triumph');
    const card = el('div', 'ezq-triumph__card ezq-scroll');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'ezq-triumph-title');

    const title = el('h2', 'ezq-triumph__title', 'Поздравляем!');
    title.id = 'ezq-triumph-title';
    const lead = el('p', 'ezq-triumph__lead');
    const leadText = el('span', '');
    lead.append(coinIcon('ezq-coin ezq-coin--lg'), leadText);
    const name = s.leaderboard.playerName;
    const table = el('ul', 'ezq-triumph__rooms');
    const codeCap = el('p', 'ezq-triumph__code-cap', name ? `${name}, это твой личный ID для куратора` : 'Твой личный ID для куратора');
    const codeEl = el('div', 'ezq-triumph__code');
    const copyBtn = button('ezq-btn ezq-triumph__copy', 'Скопировать личный ID для куратора');
    copyBtn.addEventListener('click', async () => {
      sfx.play('click');
      const okCopy = await copyText(store.get().quest.verificationCode ?? '');
      if (okCopy) {
        copyBtn.textContent = 'Скопировано ✓';
        copyBtn.classList.add('ezq-triumph__copy--done');
        later(() => {
          copyBtn.textContent = 'Скопировать личный ID для куратора';
          copyBtn.classList.remove('ezq-triumph__copy--done');
        }, 2000);
      } else {
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        showToast('Не получилось скопировать — код выделен, скопируй его вручную');
      }
    });
    syncLine = el('p', 'ezq-triumph__sync');
    renderSync(s);
    triumphRefs = { leadText, table, codeEl };
    renderTriumphResult(s);

    const arcadeBtn = button('ezq-btn ezq-btn--big ezq-btn--arcade', 'Сыграть в Аркаду и войти в ТОП-3!');
    arcadeBtn.addEventListener('click', () => {
      sfx.play('click');
      deps.onGoToArcade();
    });
    const prize = el('p', 'ezq-triumph__prize', 'Лучшие три игрока сезона получают призы и фирменный мерч Easycode');

    card.append(title, lead, table, codeCap, codeEl, copyBtn, syncLine, arcadeBtn, prize);
    triumph.appendChild(card);
    root.appendChild(triumph);
    renderHud();
    later(() => {
      if (triumph) stopConfetti = confetti(triumph);
    }, 50);
    arcadeBtn.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ «Поверни телефон» (G01)
  const rotate = el('div', 'ezq-qrotate');
  rotate.setAttribute('role', 'alert');
  const rotateIcon = el('div', 'ezq-qrotate__icon', '🔄');
  rotateIcon.setAttribute('aria-hidden', 'true');
  rotate.append(rotateIcon, el('p', 'ezq-qrotate__title', 'Поверни телефон'), el('p', 'ezq-qrotate__text', 'Комнаты Изика помещаются только в горизонтальном положении.'));
  const rotateMql = typeof matchMedia === 'function' ? matchMedia(ROTATE_QUERY) : null;
  const syncRotate = (): void => {
    const on = !!rotateMql?.matches;
    rotate.hidden = !on;
    root.classList.toggle('ezq-quest--rotate', on);
    if (on && !paused) {
      held.clear();
      walker.setInput({ x: 0, y: 0 });
    }
    paused = on;
  };
  syncRotate();
  rotateMql?.addEventListener?.('change', syncRotate);

  // ------------------------------------------------------------ сборка
  root.append(hud, stageBox, panel, rotate, fxLayer);
  stageBox.appendChild(tip);
  host.appendChild(root);
  const fit = fitStage(scene.stage, STAGE_W, STAGE_H);
  music?.duck(false);
  music?.play('quest');

  const s0 = store.get();
  enterRoom(s0.navigation.currentRoomIndex);
  const noProgress = Object.values(s0.quest.puzzles).every((p) => p.attempts === 0 && !p.isSolved);
  if (s0.quest.isCompleted) showTriumph();
  else if (noProgress && s0.navigation.currentRoomIndex === 1) showIntro();
  else {
    setMode('walk');
    if (!PUZZLES_BY_ROOM[room].some((pid) => s0.quest.puzzles[pid].isSolved)) showTip();
  }
  raf = requestAnimationFrame(frame);

  const off = store.subscribe((s, prev) => {
    renderHud(s);
    renderObjects(s);
    if (s.quest.isSyncedWithCurator !== prev.quest.isSyncedWithCurator || s.quest.lastSyncError !== prev.quest.lastSyncError) renderSync(s);
    const q = s.quest;
    const pq = prev.quest;
    if (q.isRestored !== pq.isRestored || q.totalCoinsEarned !== pq.totalCoinsEarned || q.maxPossibleCoins !== pq.maxPossibleCoins || q.verificationCode !== pq.verificationCode)
      renderTriumphResult(s);
    if (s.quest.isCompleted && !triumph && mode !== 'puzzle' && !finaleCued) showTriumph();
  });

  return {
    destroy() {
      off();
      cancelAnimationFrame(raf);
      cues.length = 0;
      rotateMql?.removeEventListener?.('change', syncRotate);
      scene.stage.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      stopConfetti();
      destroyView();
      fit.destroy();
      root.remove();
    },
  };
}
