// @vitest-environment happy-dom
// Музыка: секвенсор на фейковом AudioContext — молчит до unlock, уважает mute и скрытую вкладку,
// меняет тему через затухание, общий контекст с эффектами, громкость ≤ 40% от эффектов.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMusic, themeLoopSeconds, type Music } from '../src/services/music';
import { createAudioContextProvider, createSfx } from '../src/services/sfx';
import { createMusicButton } from '../src/app/shell';
import { createStore } from '../src/core/state';
import { mountArcadeScreen } from '../src/arcade';
import { mountLeaderboardScreen } from '../src/leaderboard';
import type { LeaderboardService } from '../src/core/types';

interface ParamCall { kind: string; v: number; t: number }
class FakeParam {
  value: number;
  calls: ParamCall[] = [];
  constructor(v: number) { this.value = v; }
  private rec(kind: string, v: number, t: number): this { this.calls.push({ kind, v, t }); this.value = v; return this; }
  setValueAtTime(v: number, t: number) { return this.rec('set', v, t); }
  linearRampToValueAtTime(v: number, t: number) { return this.rec('linear', v, t); }
  exponentialRampToValueAtTime(v: number, t: number) { return this.rec('exp', v, t); }
  setTargetAtTime(v: number, t: number) { return this.rec('target', v, t); }
  cancelScheduledValues() { return this; }
}
class FakeNode {
  out: unknown[] = [];
  connect(n: unknown) { this.out.push(n); return n; }
  disconnect() { this.out = []; }
}
class FakeGain extends FakeNode { gain = new FakeParam(1); }
class FakeOsc extends FakeNode {
  type = 'sine';
  frequency = new FakeParam(440);
  starts: number[] = [];
  start(t = 0) { this.starts.push(t); }
  stop() {}
  setPeriodicWave() { this.type = 'custom'; }
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  starts: number[] = [];
  start(t = 0) { this.starts.push(t); }
  stop() {}
}
class FakeCtx {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  oscs: FakeOsc[] = [];
  sources: FakeSource[] = [];
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createOscillator() { const o = new FakeOsc(); this.oscs.push(o); return o; }
  createPeriodicWave() { return {}; }
  createBuffer(_ch: number, len: number) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createBiquadFilter() { const f = new FakeGain() as FakeGain & { type: string; frequency: FakeParam }; f.type = 'lowpass'; f.frequency = new FakeParam(350); return f; }
}

let made: FakeCtx[] = [];
const factory = (): AudioContext => {
  const c = new FakeCtx();
  made.push(c);
  return c as unknown as AudioContext;
};
const ctx = (): FakeCtx => made[0]!;
/** Идёт «реальное» время: и таймеры, и часы аудио-контекста. */
function advance(ms: number): void {
  for (let t = 0; t < ms; t += 10) {
    for (const c of made) if (c.state === 'running') c.currentTime += 0.01;
    vi.advanceTimersByTime(10);
  }
}
const notes = (): number => (made[0] ? ctx().oscs.length + ctx().sources.length : 0);

let music: Music | null = null;
beforeEach(() => {
  made = [];
  vi.useFakeTimers();
});
afterEach(() => {
  music?.destroy();
  music = null;
  vi.useRealTimers();
});

describe('music', () => {
  it('play() до unlock() не создаёт контекст и молчит; после unlock тема звучит', () => {
    music = createMusic(() => false, createAudioContextProvider(factory));
    music.play('arcade');
    advance(1000);
    expect(made.length).toBe(0);
    music.unlock();
    expect(made.length).toBe(1);
    advance(1000);
    expect(notes()).toBeGreaterThan(0);
  });

  it('navigation.isMusicMuted на лету: mute глушит шину и перестаёт ставить ноты, unmute — продолжает', () => {
    let muted = false;
    music = createMusic(() => muted, createAudioContextProvider(factory));
    music.unlock();
    music.play('quest');
    advance(1000);
    expect(notes()).toBeGreaterThan(0);
    muted = true;
    advance(100);
    const master = ctx().gains.find((g) => g.out.includes(ctx().destination))!;
    expect(master.gain.value).toBe(0);
    const before = notes();
    advance(3000);
    expect(notes()).toBe(before);
    muted = false;
    advance(1000);
    expect(notes()).toBeGreaterThan(before);
    expect(master.gain.value).toBeGreaterThan(0);
  });

  it('скрытая вкладка — пауза, вернулся — продолжает', () => {
    let vis: DocumentVisibilityState = 'visible';
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => vis);
    try {
      music = createMusic(() => false, createAudioContextProvider(factory));
      music.unlock();
      music.play('arcade');
      advance(1000);
      vis = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      advance(100);
      const before = notes();
      advance(3000);
      expect(notes()).toBe(before);
      vis = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      advance(1000);
      expect(notes()).toBeGreaterThan(before);
    } finally {
      spy.mockRestore();
    }
  });

  it('смена темы — старая затухает за 0,3 с, новая звучит; повторный play той же темы не перезапускает', () => {
    music = createMusic(() => false, createAudioContextProvider(factory));
    music.unlock();
    music.play('quest');
    advance(1000);
    expect(ctx().sources.length).toBe(0); // у квеста нет шумовых хэтов
    const master = ctx().gains.find((g) => g.out.includes(ctx().destination))!;
    const buses = (): FakeGain[] => ctx().gains.filter((g) => g.out.includes(master));
    const questBus = buses()[0]!;
    const t = ctx().currentTime;
    music.play('arcade');
    const last = questBus.gain.calls.at(-1)!;
    expect(last).toMatchObject({ kind: 'linear', v: 0 });
    expect(last.t).toBeCloseTo(t + 0.3, 5);
    advance(1000);
    expect(ctx().sources.length).toBeGreaterThan(0); // хэты аркады
    const arcadeBuses = buses().length;
    const arcadeBus = buses().at(-1)!;
    const calls = arcadeBus.gain.calls.length;
    music.play('arcade');
    advance(500);
    music.play('arcade');
    expect(buses().length).toBe(arcadeBuses);
    expect(arcadeBus.gain.calls.length).toBe(calls);
  });

  it('один AudioContext на эффекты и музыку; музыка ≤ 40% громкости эффектов, duck(true) — ещё тише', () => {
    const audio = createAudioContextProvider(factory);
    const sfx = createSfx(() => false, audio);
    music = createMusic(() => false, audio);
    music.play('arcade');
    sfx.unlock();
    music.unlock();
    sfx.play('coin');
    expect(made.length).toBe(1);
    advance(500);
    const [sfxBus, musicBus] = ctx().gains.filter((g) => g.out.includes(ctx().destination));
    expect(sfxBus!.gain.value).toBeGreaterThan(0);
    const normal = musicBus!.gain.value;
    expect(normal).toBeGreaterThan(0);
    expect(normal).toBeLessThanOrEqual(0.4 * sfxBus!.gain.value);
    music.duck(true);
    expect(musicBus!.gain.value).toBeGreaterThan(0);
    expect(musicBus!.gain.value).toBeLessThan(normal);
    music.duck(false);
    expect(musicBus!.gain.value).toBe(normal);
  });

  it('обе темы — петли ≈ 20–30 с', () => {
    for (const t of ['quest', 'arcade'] as const) {
      expect(themeLoopSeconds(t)).toBeGreaterThanOrEqual(20);
      expect(themeLoopSeconds(t)).toBeLessThanOrEqual(30);
    }
  });
});

describe('кнопка 🎵', () => {
  it('переключает только navigation.isMusicMuted; aria-pressed и подписи', () => {
    const store = createStore({ storage: null });
    const btn = createMusicButton(store);
    document.body.appendChild(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Выключить музыку');
    expect(btn.textContent).toContain('🎵');
    btn.click();
    expect(store.get().navigation.isMusicMuted).toBe(true);
    expect(store.get().navigation.isAudioMuted).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Включить музыку');
    btn.click();
    expect(store.get().navigation.isMusicMuted).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe('Выключить музыку');
    btn.remove();
    store.destroy();
  });
});

describe('музыка на экранах аркады и рейтинга', () => {
  // happy-dom не рисует canvas — заглушка 2d-контекста.
  const stub: any = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : stub),
    apply: () => stub,
    set: () => true,
  });
  const fakeMusic = () => {
    const calls: string[] = [];
    const m: Music = {
      play: (t) => void calls.push(`play:${t}`),
      stop: () => void calls.push('stop'),
      duck: (on) => void calls.push(`duck:${on}`),
      unlock: () => void calls.push('unlock'),
      destroy: () => void calls.push('destroy'),
    };
    return { m, calls };
  };
  const svc: LeaderboardService = {
    isConfigured: false,
    fetchTop: async () => [],
    fetchStanding: async () => null,
    fetchSeason: async () => null,
    submitRun: async () => ({ kind: 'demo' }),
    flushQueue: async () => {},
    pendingCount: () => 0,
  };
  const sfx = { play() {}, unlock() {} };

  it('аркада: тема arcade в полную громкость, кнопка 🎵 рядом с 🔊', () => {
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => stub) as never;
    const store = createStore({ storage: null });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { m, calls } = fakeMusic();
    const h = mountArcadeScreen(host, { store, sfx, music: m, onGameOver() {}, onOpenLeaderboard() {} });
    try {
      expect(calls).toEqual(['duck:false', 'play:arcade']);
      const hud = host.querySelector('.ezq-arcade__hud')!;
      expect(hud.querySelector('.ezq-mute')).not.toBeNull();
      expect(hud.querySelector('.ezq-music')).not.toBeNull();
    } finally {
      h.destroy();
      host.remove();
      store.destroy();
      HTMLCanvasElement.prototype.getContext = saved;
    }
  });

  it('рейтинг: тема arcade приглушена, кнопка 🎵 в шапке', () => {
    const store = createStore({ storage: null });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { m, calls } = fakeMusic();
    const h = mountLeaderboardScreen(host, { store, sfx, music: m, service: svc, lastRun: null, onPlayAgain() {}, onBack() {} });
    try {
      expect(calls).toEqual(['duck:true', 'play:arcade']);
      const head = host.querySelector('.ezq-lb__head')!;
      expect(head.querySelector('.ezq-mute')).not.toBeNull();
      expect(head.querySelector('.ezq-music')).not.toBeNull();
    } finally {
      h.destroy();
      host.remove();
      store.destroy();
    }
  });
});
