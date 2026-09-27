// Экран аркады: профиль ученика (имя, ID с копированием, «Заработано X из M» (M — максимум из состояния: 150, у старых прохождений 75)), «Играть», холст 450×800,
// пауза, тач-зоны. При game over сам пишет arcade.* в store и зовёт onGameOver(result).

import './arcade.css';
import { copyText, createMuteButton, fitStage, showToast } from '../app/shell';
import type { Store } from '../core/state';
import type { RunResult } from '../core/types';
import type { Sfx } from '../services/sfx';
import { VIEW_H, VIEW_W, type InputState, type World } from './engine';
import { createArcadeGame, getSprites, type ArcadeGame } from './game';
import { createArcadeInput, type Side } from './input';
import { drawCoinIcon } from './sprites';
import { button, el } from '../core/dom';

export interface ArcadeScreenDeps {
  store: Store;
  sfx: Sfx;
  onGameOver(result: RunResult): void;
  onOpenLeaderboard(): void;
  /**
   * «Сегодня в рейтинг: X / лимит» (история 60). Нет — демо-режим, строки нет. Строка видна, только пока
   * `isFresh()` (за сессию был свежий ответ сервера); `refresh()` зовётся при открытии, ошибка — молча.
   */
  dailyLimit?: { isFresh(): boolean; refresh(): Promise<unknown> };
  /** Сразу начать забег (кнопка «Ещё раз» на экране рейтинга). */
  autoStart?: boolean;
  /** Подмена ввода (стенд/демо-режим): вызывается каждый шаг вместо клавиатуры и тача. */
  readInput?(world: World, out: InputState): void;
}

/** Записывает итог забега в store: рекорд, число забегов, lastRun. */
export function recordRun(store: Store, r: RunResult, now: number): void {
  store.update((s) => {
    s.arcade.highScore = Math.max(s.arcade.highScore, r.score);
    s.arcade.bestHeightPx = Math.max(s.arcade.bestHeightPx, r.heightPx);
    s.arcade.totalRunsPlayed += 1;
    s.arcade.lastRun = {
      runId: r.runId,
      score: r.score,
      durationSeconds: r.durationSeconds,
      jumpsCount: r.jumpsCount,
      timestamp: now,
      seed: r.seed,
      countedScore: null,
    };
  });
}

export function mountArcadeScreen(host: HTMLElement, deps: ArcadeScreenDeps): { destroy(): void } {
  const { store, sfx } = deps;
  const root = el('div', 'ezq-screen ezq-arcade');
  const viewport = el('div', 'ezq-arcade__viewport');
  const stage = el('div', 'ezq-arcade__stage');
  const canvas = el('canvas', 'ezq-arcade__canvas');
  canvas.setAttribute('aria-label', 'Игровое поле аркады');

  // --- тач-зоны и стрелки-подсказки
  const zoneL = el('div', 'ezq-arcade__zone ezq-arcade__zone--left');
  const zoneR = el('div', 'ezq-arcade__zone ezq-arcade__zone--right');
  const arrows = el('div', 'ezq-arcade__arrows');
  const arrowL = el('span', 'ezq-arcade__arrow', '◀');
  const arrowR = el('span', 'ezq-arcade__arrow', '▶');
  arrows.append(arrowL, arrowR);

  // --- HUD
  const hud = el('div', 'ezq-arcade__hud');
  const pauseBtn = button('ezq-btn ezq-btn--icon ezq-arcade__pause-btn', '⏸', () => togglePause());
  pauseBtn.setAttribute('aria-label', 'Пауза');
  const muteBtn = createMuteButton(store, sfx);
  hud.append(pauseBtn, muteBtn);

  // --- карточка профиля
  const card = el('div', 'ezq-arcade__card');
  const title = el('div', 'ezq-arcade__title', 'Бесконечная аркада');
  const lead = el('div', 'ezq-arcade__lead', 'Прыгай всё выше! ТОП-3 школы получат фирменный мерч Easycode.');
  const profile = el('div', 'ezq-arcade__profile');
  const nameRow = el('div', 'ezq-arcade__row');
  const nameLabel = el('span', 'ezq-arcade__label', 'Игрок');
  const nameVal = el('span', 'ezq-arcade__value');
  nameRow.append(nameLabel, nameVal);
  const codeRow = el('div', 'ezq-arcade__row');
  const codeLabel = el('span', 'ezq-arcade__label', 'Твой ID');
  const codeVal = el('span', 'ezq-arcade__code');
  const copyBtn = button('ezq-btn ezq-arcade__copy', 'Скопировать', () => void onCopy());
  codeRow.append(codeLabel, codeVal, copyBtn);
  const coinsRow = el('div', 'ezq-arcade__row ezq-arcade__coins');
  const coinIcon = el('canvas', 'ezq-arcade__coin');
  coinIcon.width = 24;
  coinIcon.height = 24;
  drawCoinIcon(coinIcon);
  const coinsVal = el('span', 'ezq-arcade__value');
  coinsRow.append(coinIcon, coinsVal);
  const recordVal = el('div', 'ezq-arcade__record');
  const lastVal = el('div', 'ezq-arcade__last');
  const dailyVal = el('div', 'ezq-arcade__record ezq-arcade__daily');
  profile.append(nameRow, codeRow, coinsRow, recordVal);
  const actions = el('div', 'ezq-arcade__actions');
  const playBtn = button('ezq-btn ezq-arcade__play', '▶ Играть', () => startRun());
  const boardBtn = button('ezq-btn ezq-arcade__board', '🏆 Рейтинг', () => {
    sfx.play('click');
    deps.onOpenLeaderboard();
  });
  actions.append(playBtn, boardBtn);
  const help = el('div', 'ezq-arcade__help', '← → или A / D. На телефоне жми на левую или правую половину экрана.');
  card.append(title, lead, profile, lastVal, actions, help);

  // --- пауза
  const pauseLayer = el('div', 'ezq-arcade__overlay');
  const pauseBox = el('div', 'ezq-arcade__pausebox');
  pauseBox.append(
    el('div', 'ezq-arcade__title', 'Пауза'),
    button('ezq-btn ezq-arcade__play', '▶ Продолжить', () => setPaused(false)),
    el('div', 'ezq-arcade__help', 'Esc или P — пауза'),
  );
  pauseLayer.append(pauseBox);

  stage.append(canvas, zoneL, zoneR, arrows, hud, card, pauseLayer);
  viewport.append(el('div', 'ezq-arcade__pad'), stage);
  root.append(viewport);
  host.appendChild(root);

  // --- состояние экрана
  type Mode = 'idle' | 'playing' | 'over';
  let mode: Mode = 'idle';
  let paused = false;
  let game: ArcadeGame | null = null;
  let k = 1;

  const setMode = (m: Mode): void => {
    mode = m;
    root.dataset.mode = m;
    card.hidden = m !== 'idle';
    pauseBtn.hidden = m !== 'playing';
  };

  const renderProfile = (): void => {
    const s = store.get();
    nameVal.textContent = s.leaderboard.playerName || 'Гость';
    codeVal.textContent = s.quest.verificationCode ?? '—';
    copyBtn.disabled = !s.quest.verificationCode;
    coinsVal.textContent = `Заработано ${s.quest.totalCoinsEarned} из ${s.quest.maxPossibleCoins} EasyCoins`;
    recordVal.textContent = s.arcade.highScore > 0 ? `Твой рекорд: ${s.arcade.highScore} очков` : 'Рекорда пока нет — самое время!';
    const nf = new Intl.NumberFormat('ru-RU');
    const showDaily = !!deps.dailyLimit?.isFresh();
    if (showDaily && !dailyVal.isConnected) profile.appendChild(dailyVal);
    if (!showDaily) dailyVal.remove();
    dailyVal.textContent = `Сегодня в рейтинг: ${nf.format(s.leaderboard.todayCounted)} / ${nf.format(s.leaderboard.dailyLimit)}`;
    playBtn.textContent = s.arcade.totalRunsPlayed > 0 ? '▶ Ещё раз' : '▶ Играть';
  };

  const onCopy = async (): Promise<void> => {
    const code = store.get().quest.verificationCode;
    if (!code) return;
    sfx.play('click');
    const ok = await copyText(code);
    if (ok) {
      copyBtn.textContent = 'Скопировано ✓';
      copyBtn.classList.add('ezq-arcade__copy--done');
      showToast('ID скопирован — отправь его куратору');
      window.setTimeout(() => {
        copyBtn.textContent = 'Скопировать';
        copyBtn.classList.remove('ezq-arcade__copy--done');
      }, 1600);
    } else showToast(`Не получилось скопировать. Твой ID: ${code}`);
  };

  const showSide = (side: Side): void => {
    zoneL.classList.toggle('ezq-arcade__zone--on', side === -1);
    zoneR.classList.toggle('ezq-arcade__zone--on', side === 1);
    arrowL.classList.toggle('ezq-arcade__arrow--on', side === -1);
    arrowR.classList.toggle('ezq-arcade__arrow--on', side === 1);
  };

  const input = createArcadeInput({
    target: viewport,
    isActive: () => mode === 'playing' && !paused,
    onSide: showSide,
    onPauseKey: () => togglePause(),
  });

  const setPaused = (next: boolean): void => {
    if (mode !== 'playing' || !game || next === paused) return;
    paused = next;
    pauseLayer.classList.toggle('ezq-arcade__overlay--on', paused);
    if (paused) {
      game.pause();
      input.reset();
    } else {
      sfx.unlock();
      game.resume();
    }
  };
  const togglePause = (): void => setPaused(!paused);

  const newGame = (start: boolean): void => {
    game?.destroy();
    game = createArcadeGame(canvas, {
      highScore: store.get().arcade.highScore,
      sfx,
      sprites: getSprites(),
      readInput: deps.readInput ?? ((w, out) => input.read(w, out)),
      onGameOver: (result) => {
        setMode('over');
        input.reset();
        recordRun(store, result, Date.now());
        lastVal.textContent = `Последний забег: ${result.score} очков${result.isNewRecord ? ' — новый рекорд!' : ''}`;
        renderProfile();
        setMode('idle');
        newGame(false); // за карточкой — снова стартовая комната, а не кадр падения
        deps.onGameOver(result);
      },
    });
    game.setPixelRatio(k);
    if (start) game.start();
  };

  function startRun(): void {
    sfx.unlock();
    sfx.play('click');
    paused = false;
    pauseLayer.classList.remove('ezq-arcade__overlay--on');
    input.reset();
    setMode('playing');
    newGame(true);
  }

  const fit = fitStage(stage, VIEW_W, VIEW_H, {
    onScale: (scale) => {
      k = Math.min(3, (window.devicePixelRatio || 1) * scale);
      game?.setPixelRatio(k);
    },
  });
  k = Math.min(3, (window.devicePixelRatio || 1) * fit.scale());

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') setPaused(true);
  };
  const onBlur = (): void => setPaused(true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  const offStore = store.subscribe(() => renderProfile());
  deps.dailyLimit?.refresh().then(() => renderProfile(), () => undefined);

  renderProfile();
  setMode('idle');
  newGame(false); // холст за карточкой — стартовая комната
  if (deps.autoStart) startRun();

  return {
    destroy() {
      game?.destroy();
      game = null;
      input.destroy();
      fit.destroy();
      offStore();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      root.remove();
    },
  };
}
