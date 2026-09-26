// Оболочка модуля: корень .ezq-root, safe-area, блокировка жестов, store, звук, роутер —
// и проводка сервисов: реестр куратора (с повторами), рейтинг (с очередью), мост EasyLab, G03.
import { createStore, type Store } from '../core/state';
import type { KeyValueStorage, RunResult, ScreenName, SubmitOutcome, EasyQuestGameState, RoomIndex } from '../core/types';
import { validatePlayerName } from '../core/rules';
import { createSfx, type Sfx } from '../services/sfx';
import { createRestClientFromEnv, type RestClient } from '../services/rest';
import { createCuratorSync } from '../services/curator';
import { createLeaderboardService, type LeaderboardServiceHandle } from '../services/leaderboard';
import { createBridge, parseExtraOrigins, type AuthInit, type Bridge, type QuestCompletedPayload } from '../services/bridge';
import { createQuestController, type QuestController } from '../quest/controller';
import type { CuratorSync } from '../core/types';
import { blockGestures, showToast } from './shell';
import { createRouter, type Router, type ScreenFactory } from './router';
import { SCREENS, type AppContext } from './screens';

export const AUTH_WAIT_MS = 1500;
export const RESTORED_TOAST = 'С возвращением! Квест уже пройден — вот твой код';

export interface MountAppOptions {
  /** Хранилище сохранения и очереди забегов (по умолчанию localStorage; null — только память). */
  storage?: KeyValueStorage | null;
  /** Источник события `online` для повторов (по умолчанию window; null — без него). */
  win?: EventTarget | null;
  rest?: RestClient;
  bridge?: Bridge;
  screens?: Record<ScreenName, ScreenFactory<AppContext>>;
  /** Сколько встроенный модуль ждёт EASYLAB_AUTH_INIT на экране загрузки. */
  authWaitMs?: number;
}

export interface AppHandle {
  store: Store;
  sfx: Sfx;
  bridge: Bridge;
  controller: QuestController;
  curator: CuratorSync;
  leaderboard: LeaderboardServiceHandle;
  /** null, пока идёт экран загрузки. */
  readonly router: Router | null;
  /** Роутер запущен (после AUTH_INIT/восстановления или таймаута ожидания). */
  ready: Promise<void>;
  destroy(): void;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const ROOMS: readonly RoomIndex[] = [1, 2, 3, 4];

/** Полезная нагрузка EASYLAB_QUEST_COMPLETED из состояния. */
export function questCompletedPayload(s: EasyQuestGameState): QuestCompletedPayload {
  const q = s.quest;
  return {
    coinsEarned: q.totalCoinsEarned,
    maxCoins: 75,
    verificationCode: q.verificationCode ?? '',
    completedAt: new Date(q.completedAt ?? Date.now()).toISOString(),
    studentId: s.meta.platformStudentId,
    rooms: ROOMS.map((room) => {
      const r = q.rooms[room];
      return { room, id: r.id, earnedCoins: r.earnedCoins, maxReward: r.maxReward, attempts: r.attempts, hintsUsed: r.hintsUsed };
    }),
  };
}

function buildLoading(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'ezq-loading';
  box.setAttribute('role', 'status');
  const logo = document.createElement('div');
  logo.className = 'ezq-loading__logo';
  logo.textContent = 'easycode';
  const dots = document.createElement('div');
  dots.className = 'ezq-loading__dots';
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('span');
    d.className = 'ezq-loading__dot';
    dots.appendChild(d);
  }
  const text = document.createElement('div');
  text.className = 'ezq-loading__text';
  text.textContent = 'Загружаем квест…';
  box.append(logo, dots, text);
  return box;
}

export function mountApp(rootEl: HTMLElement, opts: MountAppOptions = {}): AppHandle {
  rootEl.classList.add('ezq-root');
  rootEl.textContent = '';

  const storage = opts.storage !== undefined ? opts.storage : safeLocalStorage();
  const svcWin = opts.win !== undefined ? opts.win : typeof window !== 'undefined' ? window : null;
  const store = createStore({ storage });
  const sfx = createSfx(() => store.get().navigation.isAudioMuted);
  const rest = opts.rest ?? createRestClientFromEnv();
  const bridge = opts.bridge ?? createBridge({ extraOrigins: parseExtraOrigins(import.meta.env?.VITE_BRIDGE_EXTRA_ORIGINS) });
  let destroyed = false;
  let router: Router | null = null;

  if (store.get().meta.isEmbedded !== bridge.isEmbedded) {
    store.update((d) => { d.meta.isEmbedded = bridge.isEmbedded; });
  }

  const applyTheme = (): void => {
    rootEl.dataset.ezqTheme = store.get().meta.theme;
  };
  applyTheme();
  const offTheme = store.subscribe((s, prev) => {
    if (s.meta.theme !== prev.meta.theme) applyTheme();
  });

  // ---- сервисы
  const curator = createCuratorSync(rest, store, {
    win: svcWin,
    onCodeChanged: (code) => {
      if (destroyed || !store.get().quest.isCompleted) return;
      showToast(`Код обновлён: ${code}`);
      bridge.sendQuestCompleted(questCompletedPayload(store.get()));
    },
  });
  const leaderboard = createLeaderboardService(rest, store, storage, { win: svcWin, curator });
  const controller = createQuestController(store, {
    onCompleted: (s) => {
      void curator.syncNow().catch(() => undefined);
      bridge.sendQuestCompleted(questCompletedPayload(s));
    },
  });
  const stopCuratorLoop = curator.startRetryLoop();
  const stopLeaderboardLoop = leaderboard.startRetryLoop();

  const unblock = blockGestures(rootEl);

  // AudioContext создаётся по первому жесту пользователя (политика автоплея).
  const unlock = (): void => {
    sfx.unlock();
    rootEl.removeEventListener('pointerdown', unlock);
    rootEl.removeEventListener('keydown', unlock);
  };
  rootEl.addEventListener('pointerdown', unlock);
  rootEl.addEventListener('keydown', unlock);

  const host = document.createElement('div');
  host.className = 'ezq-screen-host';
  rootEl.appendChild(host);

  // «Сегодня в рейтинг» из сохранения может быть вчерашним (МСК) — верим ему только после свежего ответа сервера.
  let dailyFresh = false;
  const fetchStanding = (): ReturnType<LeaderboardServiceHandle['fetchStanding']> =>
    leaderboard.fetchStanding().then((r) => {
      dailyFresh = true;
      return r;
    });
  const screenLeaderboard: LeaderboardServiceHandle = { ...leaderboard, fetchStanding };

  const ctx: AppContext = {
    root: rootEl,
    store,
    sfx,
    navigate: (screen) => router?.go(screen),
    controller,
    curator,
    leaderboard: screenLeaderboard,
    bridge,
    isServerConfigured: rest.isConfigured,
    dailyLimit: { isFresh: () => dailyFresh, refresh: fetchStanding },
    lastRun: null,
    autoStart: false,
    onGameOver: (result: RunResult) => {
      const submit: Promise<SubmitOutcome> = leaderboard.submitRun(result).catch((): SubmitOutcome => ({ kind: 'queued' }));
      ctx.lastRun = { result, submit };
      void submit.then((o) => {
        if (o.kind === 'counted') dailyFresh = true;
        if (destroyed) return;
        const s = store.get();
        bridge.sendGameFinished({
          score: result.score,
          highScore: Math.max(s.arcade.highScore, result.score),
          seasonTotal: o.kind === 'counted' ? o.seasonTotal : s.leaderboard.seasonTotal,
          durationSeconds: result.durationSeconds,
          jumpsCount: result.jumpsCount,
          verificationCode: s.quest.verificationCode,
        });
      });
      router?.go('leaderboard');
    },
  };

  // ---- старт: во встраивании ждём AUTH_INIT (≤ authWaitMs) на экране загрузки
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => { resolveReady = r; });
  let loading: HTMLElement | null = null;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;

  const start = (): void => {
    if (router || destroyed) return;
    if (waitTimer) clearTimeout(waitTimer);
    loading?.remove();
    loading = null;
    router = createRouter({ store, host, screens: opts.screens ?? SCREENS, ctx });
    resolveReady();
  };

  const applyAuth = async (a: AuthInit): Promise<void> => {
    store.update((d) => {
      d.meta.isEmbedded = true;
      if (a.studentId) d.meta.platformStudentId = a.studentId;
      if (a.theme) d.meta.theme = a.theme;
      if (a.name && !d.quest.isCompleted && !d.leaderboard.playerName) {
        const v = validatePlayerName(a.name.slice(0, 16).trim());
        if (v.ok) d.leaderboard.playerName = v.value;
      }
    });
    if (!a.studentId || store.get().quest.isCompleted) return;
    const restored = await curator.restoreByStudent(a.studentId).catch(() => false);
    if (!restored || destroyed) return;
    // restoreByStudent пишет navigation сам (локально) — роутер об этом не узнаёт, переводим явно.
    router?.go('arcade');
    showToast(RESTORED_TOAST, 4000);
  };

  const offAuth = bridge.onAuthInit((a) => {
    const done = applyAuth(a);
    if (!router) void done.finally(start);
  });

  if (bridge.isEmbedded) {
    loading = buildLoading();
    rootEl.appendChild(loading);
    bridge.announceReady();
    waitTimer = setTimeout(start, opts.authWaitMs ?? AUTH_WAIT_MS);
  } else {
    start();
  }

  return {
    store,
    sfx,
    bridge,
    controller,
    curator,
    leaderboard,
    get router() {
      return router;
    },
    ready,
    destroy() {
      destroyed = true;
      if (waitTimer) clearTimeout(waitTimer);
      offAuth();
      stopCuratorLoop();
      stopLeaderboardLoop();
      bridge.destroy();
      router?.destroy();
      loading?.remove();
      offTheme();
      unblock();
      unlock();
      store.destroy();
      host.remove();
    },
  };
}
