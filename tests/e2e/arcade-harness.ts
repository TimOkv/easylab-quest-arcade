// Временная страница e2e-замеров аркады (обслуживается dev-сервером Vite, в сборку не входит).
import '../../src/app/app.css';
import { createStore } from '../../src/core/state';
import { createSfx } from '../../src/services/sfx';
import { botInput, createArcadeGame, mountArcadeScreen, type ArcadeGame } from '../../src/arcade';
import type { RunResult } from '../../src/core/types';
import type { InputState, World } from '../../src/arcade/engine';

declare global {
  interface Window {
    __ezq: {
      gameOvers: RunResult[];
      perf?: () => { fps: number; avgWorkMs: number; frames: number };
      resetPerf?: () => void;
      restarts: number;
      /** bot=1: мир текущего забега и выключатель бота (для скриншотов). */
      world?: World;
      botOff?: boolean;
    };
  }
}

const root = document.getElementById('ezq-app')!;
const hostEl = document.createElement('div');
hostEl.className = 'ezq-screen-host';
root.appendChild(hostEl);
window.__ezq = { gameOvers: [], restarts: 0 };

const mode = new URLSearchParams(location.search).get('mode') ?? 'screen';
const store = createStore({ storage: window.localStorage });
store.update((s) => {
  s.quest.isCompleted = true;
  s.quest.completedAt = Date.now();
  s.quest.verificationCode = 'EZ-7K3M';
  s.quest.totalCoinsEarned = 60;
  s.arcade.isUnlocked = true;
  s.leaderboard.playerName = 'Тестер';
  s.navigation.currentScreen = 'arcade';
  s.navigation.isAudioMuted = true;
  const hs = Number(new URLSearchParams(location.search).get('highScore') ?? 0);
  if (hs > 0) s.arcade.highScore = hs;
});
const sfx = createSfx(() => store.get().navigation.isAudioMuted);

if (mode === 'perf') {
  // Замер: бот играет в тот же холст 450×800; при проигрыше — новый забег.
  const canvas = document.createElement('canvas');
  canvas.className = 'ezq-arcade__canvas';
  hostEl.appendChild(canvas);
  let game: ArcadeGame;
  let frames = 0;
  let fpsFrames = 0;
  let work = 0;
  let t0 = performance.now();
  const bank = () => {
    const s = game.stats();
    frames += s.frames;
    work += s.avgWorkMs * s.frames;
  };
  const run = () => {
    game = createArcadeGame(canvas, {
      highScore: 300,
      readInput: botInput,
      fallAnimMs: 0,
      onGameOver: () => {
        bank();
        window.__ezq.restarts++;
        run();
      },
    });
    game.setPixelRatio(window.devicePixelRatio || 1);
    game.start();
  };
  // FPS считаем по rAF страницы — не зависит от пересоздания игр.
  const tick = () => {
    fpsFrames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  run();
  window.__ezq.resetPerf = () => {
    game.resetStats();
    frames = 0;
    work = 0;
    fpsFrames = 0;
    t0 = performance.now();
  };
  window.__ezq.perf = () => {
    const s = game.stats();
    const f = frames + s.frames;
    return { frames: f, avgWorkMs: (work + s.avgWorkMs * s.frames) / Math.max(1, f), fps: (fpsFrames * 1000) / (performance.now() - t0) };
  };
} else {
  mountArcadeScreen(hostEl, {
    store,
    sfx,
    onGameOver: (r) => window.__ezq.gameOvers.push(r),
    onOpenLeaderboard: () => {},
    readInput: new URLSearchParams(location.search).get('bot')
      ? (w: World, out: InputState) => {
          window.__ezq.world = w;
          if (!window.__ezq.botOff) return botInput(w, out);
          // «Промах» для скриншота game over: котик уходит под нижний край камеры.
          out.left = out.right = false;
          if (!w.over && w.player.y > w.camY - 60) {
            w.player.y = w.camY - 65;
            w.player.vy = -800;
          }
        }
      : undefined,
  });
}
