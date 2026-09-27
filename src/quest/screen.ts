// UI квеста: сцена с камерой, HUD монет, панель загадки (лист/модалка), intro и триумф.
import './quest.css';
import type { Store } from '../core/state';
import type { EasyQuestGameState, RoomIndex } from '../core/types';
import { MAX_TOTAL_COINS, PLAYER_NAME_MAX } from '../core/rules';
import type { Sfx } from '../services/sfx';
import { copyText, createMuteButton, fitStage, showToast } from '../app/shell';
import type { QuestController } from './controller';
import { PUZZLES, type PuzzleView } from './puzzles';
import { button, el } from '../core/dom';
import { createScene, onHotspot, STAGE_H, STAGE_W } from './scene';
import { coinIcon, confetti, countUp, flyCoins } from './effects';

export interface QuestScreenDeps {
  store: Store;
  sfx: Sfx;
  controller: QuestController;
  /** false — реестр куратора не подключён (демо-режим). */
  isServerConfigured: boolean;
  onGoToArcade(): void;
}

const ROOMS: RoomIndex[] = [1, 2, 3, 4];
const CAMERA_MS = 1000;

const STORY: Record<RoomIndex, { place: string; find: string; done: string }> = {
  1: { place: 'Рабочее место разработчика', find: 'Нажми на светящийся ноутбук', done: 'Терминал горит зелёным — проход в лабораторию открыт!' },
  2: { place: 'Лаборатория робототехники', find: 'Нажми на светящийся умный шкаф', done: 'Робот ожил! Дверь в библиотеку знаний открыта.' },
  3: { place: 'Библиотека знаний', find: 'Нажми на книгу на столе', done: 'Шкаф отъехал — за ним потайная дверь к котику!' },
  4: { place: 'Командный центр маскота', find: 'Нажми на котика', done: 'Миссия запущена! Главный экран загорелся.' },
};

function catBubble(lines: string[]): HTMLElement {
  const wrap = el('div', 'ezq-cat');
  const face = el('span', 'ezq-cat__face', '🐱');
  face.setAttribute('aria-hidden', 'true');
  const bubble = el('div', 'ezq-cat__bubble');
  for (const line of lines) bubble.appendChild(el('p', 'ezq-cat__line', line));
  wrap.append(face, bubble);
  return wrap;
}

export function mountQuestScreen(host: HTMLElement, deps: QuestScreenDeps): { destroy(): void } {
  const { store, sfx, controller } = deps;
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
    showToast('Найди светящийся предмет и реши загадку. Чем меньше ошибок — тем больше EasyCoins!', 4200);
  });
  hudLeft.append(createMuteButton(store, sfx), helpBtn);

  const hudRight = el('div', 'ezq-qhud__group ezq-qhud__group--right');
  const progress = el('ol', 'ezq-qhud__progress');
  progress.setAttribute('aria-label', 'Комнаты');
  const progressItems = ROOMS.map((n) => {
    const li = el('li', 'ezq-qhud__step', String(n));
    progress.appendChild(li);
    return li;
  });
  const stake = el('div', 'ezq-qhud__stake');
  const coins = el('div', 'ezq-qhud__coins');
  coins.setAttribute('aria-label', 'EasyCoins');
  const coinsNum = el('span', 'ezq-qhud__coins-num', '0');
  coins.append(coinIcon(), coinsNum);
  hudRight.append(progress, stake, coins);
  hud.append(hudLeft, hudRight);

  let shownCoins = store.get().quest.totalCoinsEarned;
  coinsNum.textContent = String(shownCoins);

  function renderHud(s: EasyQuestGameState = store.get()): void {
    const cur = s.navigation.currentRoomIndex;
    progressItems.forEach((li, i) => {
      const n = ROOMS[i];
      const solved = s.quest.rooms[n].isSolved;
      li.className = 'ezq-qhud__step';
      if (solved) li.classList.add('ezq-qhud__step--done');
      if (n === cur && !s.quest.isCompleted) li.classList.add('ezq-qhud__step--current');
      li.textContent = solved ? '✓' : String(n);
      li.setAttribute('aria-label', `Комната ${n}${solved ? ' — пройдена' : n === cur ? ' — сейчас' : ''}`);
    });
    const room = s.quest.rooms[cur];
    stake.hidden = s.quest.isCompleted || room.isSolved || mode === 'intro';
    stake.replaceChildren(el('span', 'ezq-qhud__stake-cap', 'Сейчас за верный ответ:'), el('b', 'ezq-qhud__stake-num', String(controller.currentReward(cur))));
  }

  // ------------------------------------------------------------ сцена
  const stageBox = el('div', 'ezq-quest__stagebox');
  const scene = createScene();
  stageBox.appendChild(scene.stage);
  onHotspot(scene, (room) => {
    if (room === store.get().navigation.currentRoomIndex) openPuzzle();
  });

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

  type Mode = 'intro' | 'prompt' | 'puzzle' | 'triumph';
  let mode: Mode = 'prompt';
  let view: PuzzleView | null = null;
  let viewRoom: RoomIndex | null = null;
  let puzzleBox: HTMLElement | null = null;

  const setMode = (m: Mode): void => {
    mode = m;
    panel.dataset.mode = m;
    root.dataset.mode = m;
  };

  const shake = (node: HTMLElement): void => {
    node.classList.remove('ezq-shake');
    void node.offsetWidth;
    node.classList.add('ezq-shake');
  };

  // ---- intro
  function showIntro(): void {
    setMode('intro');
    scene.setActiveHotspot(null);
    scene.focus('intro', true);
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
      startRoom(1, false);
    });
    setPanel([
      catBubble([
        'Мяу! Я котик Easycode.',
        'Помоги мне пройти 4 комнаты: в каждой — одна загадка про код. За каждую разгадку получишь EasyCoins!',
      ]),
      form,
    ]);
    renderHud();
  }

  // ---- подсказка к комнате (до открытия загадки)
  function startRoom(room: RoomIndex, instant: boolean): void {
    destroyView();
    scene.setActiveHotspot(null);
    scene.focus(room, instant);
    showPrompt(room);
    if (instant) scene.setActiveHotspot(room);
    else later(() => scene.setActiveHotspot(store.get().navigation.currentRoomIndex === room ? room : null), CAMERA_MS);
  }

  function showPrompt(room: RoomIndex): void {
    setMode('prompt');
    const s = store.get();
    const head = el('div', 'ezq-qpanel__head');
    head.append(el('span', 'ezq-qpanel__room', `Комната ${room} из 4`), el('h2', 'ezq-qpanel__title', STORY[room].place));
    const open = button('ezq-btn ezq-btn--big', 'Открыть загадку');
    open.addEventListener('click', openPuzzle);
    const actions = el('div', 'ezq-qpanel__actions');
    actions.appendChild(open);
    setPanel([head, catBubble([PUZZLES[room].intro, `${STORY[room].find} — или кнопку ниже.`])], [actions]);
    if (s.quest.rooms[room].isSolved) showSolvedOnly(room);
    renderHud();
  }

  function destroyView(): void {
    view?.destroy();
    view = null;
    viewRoom = null;
    puzzleBox = null;
  }

  // ---- загадка
  function openPuzzle(): void {
    const s = store.get();
    if (s.quest.isCompleted || mode === 'intro') return;
    const room = s.navigation.currentRoomIndex;
    sfx.play('click');
    if (s.quest.rooms[room].isSolved) {
      showSolvedOnly(room);
      return;
    }
    setMode('puzzle');
    const def = PUZZLES[room];

    const head = el('div', 'ezq-qpanel__head');
    const close = button('ezq-btn ezq-btn--icon ezq-qpanel__close', '✕');
    close.setAttribute('aria-label', 'Свернуть загадку');
    close.addEventListener('click', () => {
      if (checking) return;
      sfx.play('click');
      refs = null;
      showPrompt(room); // собранный ответ (view) сохраняется до следующего открытия
    });
    head.append(el('span', 'ezq-qpanel__room', `Комната ${room} из 4 · ${def.title}`), close);

    if (!puzzleBox || viewRoom !== room) {
      destroyView();
      puzzleBox = el('div', 'ezq-pz');
      viewRoom = room;
      view = def.render(puzzleBox, {
        onAnswerChange: (ready) => {
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

    setPanel([head, catBubble([def.intro]), puzzleBox, feedback, hintsList], [confirmBox, actions]);
    refs = { feedback, hintsList, confirmBox, actions, hintBtn, checkBtn, room };
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
    room: RoomIndex;
  } | null = null;

  function syncButtons(): void {
    if (!refs) return;
    const solved = store.get().quest.rooms[refs.room].isSolved;
    refs.checkBtn.disabled = !answerReady || checking || solved;
    refs.checkBtn.hidden = solved;
    refs.checkBtn.textContent = checking ? 'Проверяю…' : 'Проверить';
  }

  function renderHints(): void {
    if (!refs) return;
    const r = store.get().quest.rooms[refs.room];
    const def = PUZZLES[refs.room];
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
      b.hidden = !controller.canUseHint(refs.room, 1);
      b.textContent = 'Подсказка';
    } else {
      b.hidden = !controller.canUseHint(refs.room, 2);
      b.textContent = 'Ещё подсказка — без монет';
      if (r.attempts >= 2) b.classList.add('ezq-pulse');
    }
  }

  function onHintClick(): void {
    if (!refs || checking) return;
    const room = refs.room;
    const used = store.get().quest.rooms[room].hintsUsed;
    sfx.play('click');
    if (used === 0) {
      controller.useHint(room);
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
    box.replaceChildren(el('p', 'ezq-qpanel__confirm-text', 'Эта подсказка почти решает загадку. Монеты за эту комнату не начислятся. Открыть?'), row);
    no.addEventListener('click', () => {
      sfx.play('click');
      box.hidden = true;
    });
    yes.addEventListener('click', () => {
      controller.useHint(room);
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
    const { room } = refs;
    checking = true;
    syncButtons();
    const res = controller.submit(room, view.getAnswer()); // попытка уже в сохранении
    renderHud();
    later(() => {
      checking = false;
      if (!refs || refs.room !== room) return;
      if (res.correct) onSolved(room, res.reward ?? 0);
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

  function onSolved(room: RoomIndex, reward: number): void {
    if (!refs) return;
    sfx.play('correct');
    view?.showSolvedState();
    scene.setSolved(room, true);
    refs.feedback.className = 'ezq-qpanel__feedback ezq-qpanel__feedback--ok';
    refs.feedback.replaceChildren(
      el('b', 'ezq-qpanel__reward', reward > 0 ? `Верно! +${reward} EasyCoins` : 'Верно! Эта комната без монет — зато ты разобрался.'),
      el('p', 'ezq-qpanel__story', STORY[room].done),
    );
    refs.hintBtn.hidden = true;
    refs.confirmBox.hidden = true;
    syncButtons();
    scene.setActiveHotspot(null);
    awardCoins(refs.feedback, reward);
    renderHud();
    // Сворачиваем панель в карточку, чтобы было видно, как «ожила» комната.
    later(() => {
      if (!triumph && store.get().navigation.currentRoomIndex === room) showSolvedOnly(room);
    }, 1100);
    if (room === 4) later(showTriumph, 2600);
  }

  /** Итог решённой комнаты (и после перезагрузки до «Дальше»): карточка с наградой и «Дальше». */
  function showSolvedOnly(room: RoomIndex): void {
    destroyView();
    setMode('prompt');
    const r = store.get().quest.rooms[room];
    const head = el('div', 'ezq-qpanel__head');
    head.append(el('span', 'ezq-qpanel__room', `Комната ${room} из 4 · ${PUZZLES[room].title}`));
    const fb = el('div', 'ezq-qpanel__feedback ezq-qpanel__feedback--ok');
    fb.append(el('b', 'ezq-qpanel__reward', `Загадка решена: +${r.earnedCoins} EasyCoins`), el('p', 'ezq-qpanel__story', STORY[room].done));
    const actions = el('div', 'ezq-qpanel__actions');
    if (room < 4) {
      const next = button('ezq-btn ezq-btn--big ezq-qpanel__next', 'Дальше →');
      next.addEventListener('click', goNext);
      actions.appendChild(next);
      later(() => next.focus({ preventScroll: true }), 50);
    }
    setPanel([head, fb], [actions]);
    refs = null;
  }

  function goNext(): void {
    if (!controller.advance()) return;
    sfx.play('door');
    refs = null;
    startRoom(store.get().navigation.currentRoomIndex, false);
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

  // ------------------------------------------------------------ триумф
  let triumph: HTMLElement | null = null;
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
    } else {
      syncLine.textContent = 'Отправим куратору, как только появится интернет — код уже твой.';
      syncLine.classList.add('ezq-triumph__sync--pending');
    }
  }

  function showTriumph(): void {
    if (triumph) return;
    const s = store.get();
    if (!s.quest.isCompleted) return;
    setMode('triumph');
    destroyView();
    refs = null;
    scene.setActiveHotspot(null);
    scene.focus('overview');
    sfx.play('fanfare');
    const total = s.quest.totalCoinsEarned;
    const code = s.quest.verificationCode ?? '';

    triumph = el('div', 'ezq-triumph');
    const card = el('div', 'ezq-triumph__card ezq-scroll');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'ezq-triumph-title');

    const title = el('h2', 'ezq-triumph__title', 'Поздравляем!');
    title.id = 'ezq-triumph-title';
    const lead = el('p', 'ezq-triumph__lead');
    lead.append(coinIcon('ezq-coin ezq-coin--lg'), el('span', '', `Ты заработал ${total} EasyCoins из ${MAX_TOTAL_COINS} возможных!`));
    const name = s.leaderboard.playerName;

    const table = el('ul', 'ezq-triumph__rooms');
    for (const n of ROOMS) {
      const r = s.quest.rooms[n];
      const li = el('li', 'ezq-triumph__room');
      const tries = r.attempts <= 1 ? 'с первой попытки' : `попыток: ${r.attempts}`;
      li.append(
        el('span', 'ezq-triumph__room-name', `${n}. ${STORY[n].place}`),
        el('span', 'ezq-triumph__room-tries', r.hintsUsed >= 2 ? `${tries}, с подсказкой` : tries),
        el('b', 'ezq-triumph__room-coins', `${r.earnedCoins} / ${r.maxReward}`),
      );
      table.appendChild(li);
    }

    const codeCap = el('p', 'ezq-triumph__code-cap', name ? `${name}, это твой личный ID для куратора` : 'Твой личный ID для куратора');
    const codeEl = el('div', 'ezq-triumph__code', code);
    codeEl.setAttribute('aria-label', `Личный ID ${code.split('').join(' ')}`);
    const copyBtn = button('ezq-btn ezq-triumph__copy', 'Скопировать личный ID для куратора');
    copyBtn.addEventListener('click', async () => {
      sfx.play('click');
      const okCopy = await copyText(code);
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

  // ------------------------------------------------------------ сборка
  root.append(hud, stageBox, panel, fxLayer);
  host.appendChild(root);
  const fit = fitStage(scene.stage, STAGE_W, STAGE_H);

  const s0 = store.get();
  for (const n of ROOMS) if (s0.quest.rooms[n].isSolved) scene.setSolved(n, false);
  const noProgress = ROOMS.every((n) => s0.quest.rooms[n].attempts === 0 && !s0.quest.rooms[n].isSolved);
  if (s0.quest.isCompleted) {
    scene.focus('overview', true);
    showTriumph();
  } else if (noProgress && s0.navigation.currentRoomIndex === 1) showIntro();
  else startRoom(s0.navigation.currentRoomIndex, true);

  const off = store.subscribe((s, prev) => {
    renderHud(s);
    if (s.quest.isSyncedWithCurator !== prev.quest.isSyncedWithCurator) renderSync(s);
    if (s.quest.isCompleted && !triumph && mode !== 'puzzle') showTriumph();
  });

  return {
    destroy() {
      off();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      stopConfetti();
      destroyView();
      fit.destroy();
      root.remove();
    },
  };
}
