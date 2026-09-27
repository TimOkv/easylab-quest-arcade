// 8-бит музыка на WebAudio-синтезе (0 аудиофайлов): секвенсор «на 100 мс вперёд» по таймеру.
// Две темы — спокойная для квеста и бодрая для аркады; ноты — таблица ниже. Контекст общий с эффектами
// (AudioContextProvider из sfx): до разблокировки жестом музыка молчит и контекст не создаёт.
import { SFX_MASTER_GAIN, createAudioContextProvider, type AudioContextProvider } from './sfx';

export type MusicTheme = 'quest' | 'arcade';

export interface Music {
  /** Включить тему. Та же тема уже играет — ничего не делает; другая — смена через затухание 0,3 с. */
  play(theme: MusicTheme): void;
  /** Затихнуть (0,3 с) и забыть тему. */
  stop(): void;
  /** Приглушить (панель загадки, экран рейтинга) или вернуть обычную громкость. */
  duck(on: boolean): void;
  /** Разблокировать звук (из обработчика жеста) и начать отложенную тему. */
  unlock(): void;
  destroy(): void;
}

/** Громкость музыки относительно шины эффектов (≤ 40%). */
export const MUSIC_LEVEL = 0.4;
/** Во сколько раз тише при duck(true). */
export const DUCK_LEVEL = 0.45;
/** Затухание при смене темы, приглушении и stop(), с. */
export const FADE_S = 0.3;
const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

// ---------------------------------------------------------------- ноты

type Voice = 'tri' | 'sq' | 'p25' | 'hat';
interface Track { voice: Voice; vol: number; bars: readonly string[] }
interface ThemeDef { bpm: number; tracks: readonly Track[] }

// Такт = 8 восьмых. Токен: нота («C5», «F#3», «Bb4») — новый звук, «-» — тянуть, «.» — пауза;
// у хэтов «x» — тихий удар, «X» — акцент.
const rep = <T,>(a: readonly T[], n: number): T[] => Array.from({ length: n }, () => a).flat();

// Квест: 90 BPM, до мажор, C–Am–F–G ×2 (8 тактов ≈ 21 с). Треугольник — мелодия, пульс 25% — арпеджио.
const QUEST: ThemeDef = {
  bpm: 90,
  tracks: [
    {
      voice: 'tri',
      vol: 0.16,
      bars: [
        'E5 - G5 - C6 - G5 -',
        'A5 - - - E5 - C5 -',
        'F5 - A5 - C6 - A5 -',
        'G5 - - - D5 - B4 -',
        'E5 - G5 - C6 - D6 -',
        'E6 - D6 - C6 - A5 -',
        'A5 - G5 - F5 - D5 -',
        'G5 - - - - - . .',
      ],
    },
    {
      voice: 'p25',
      vol: 0.05,
      bars: rep(
        ['C4 E4 G4 E4 C4 E4 G4 E4', 'A3 C4 E4 C4 A3 C4 E4 C4', 'F3 A3 C4 A3 F3 A3 C4 A3', 'G3 B3 D4 B3 G3 B3 D4 B3'],
        2,
      ),
    },
    {
      voice: 'tri',
      vol: 0.12,
      bars: rep(['C3 - - - G2 - - -', 'A2 - - - E2 - - -', 'F2 - - - C3 - - -', 'G2 - - - D3 - - -'], 2),
    },
  ],
};

// Аркада: 140 BPM, C–G–Am–F ×4 (16 тактов ≈ 27 с). Квадрат 50% — мелодия, треугольник — бас-«прыгун», шумовые хэты.
const ARCADE: ThemeDef = {
  bpm: 140,
  tracks: [
    {
      voice: 'sq',
      vol: 0.07,
      bars: [
        'C5 . C5 E5 G5 - E5 G5',
        'D6 - B5 G5 D5 - G5 -',
        'C6 . C6 B5 A5 - E5 A5',
        'A5 - G5 F5 G5 - - -',
        'E5 G5 C6 G5 E5 G5 C6 E6',
        'D6 - B5 - G5 - B5 D6',
        'C6 - A5 - E5 - A5 C6',
        'C6 - A5 - F5 - G5 -',
        'G5 G5 . G5 C6 - G5 -',
        'B5 B5 . B5 D6 - B5 -',
        'A5 A5 . A5 C6 - E6 -',
        'F6 - E6 - D6 - C6 -',
        'E6 - D6 C6 G5 - E5 G5',
        'D6 - - - B5 - G5 -',
        'A5 - C6 - E6 - D6 C6',
        'D6 - B5 - G5 - B5 -',
      ],
    },
    {
      voice: 'tri',
      vol: 0.14,
      bars: [
        ...rep(['C3 C4 C3 C4 C3 C4 C3 C4', 'G2 G3 G2 G3 G2 G3 G2 G3', 'A2 A3 A2 A3 A2 A3 A2 A3', 'F2 F3 F2 F3 F2 F3 F2 F3'], 3),
        'C3 C4 C3 C4 C3 C4 C3 C4',
        'G2 G3 G2 G3 G2 G3 G2 G3',
        'A2 A3 A2 A3 A2 A3 A2 A3',
        'G2 G3 G2 G3 G2 G3 G2 G3',
      ],
    },
    { voice: 'hat', vol: 0.05, bars: rep(['x X x X x X x X'], 16) },
  ],
};

const THEMES: Record<MusicTheme, ThemeDef> = { quest: QUEST, arcade: ARCADE };

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(tok: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
  if (!m) throw new Error(`music: плохая нота ${tok}`);
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

interface NoteEv { voice: Voice; f: number; v: number; len: number }
interface Compiled { stepS: number; steps: NoteEv[][] }

function compile(def: ThemeDef): Compiled {
  const total = Math.max(...def.tracks.map((t) => t.bars.length)) * 8;
  const steps: NoteEv[][] = Array.from({ length: total }, () => []);
  for (const tr of def.tracks) {
    const toks = tr.bars.join(' ').trim().split(/\s+/);
    toks.forEach((tok, i) => {
      if (tok === '-' || tok === '.') return;
      let len = 1;
      while (toks[i + len] === '-') len++;
      const isHat = tr.voice === 'hat';
      const v = isHat && tok === 'x' ? tr.vol * 0.5 : tr.vol;
      steps[i % total]!.push({ voice: tr.voice, f: isHat ? 0 : noteFreq(tok), v, len });
    });
  }
  return { stepS: 60 / def.bpm / 2, steps };
}

const COMPILED: Partial<Record<MusicTheme, Compiled>> = {};
const compiled = (t: MusicTheme): Compiled => (COMPILED[t] ??= compile(THEMES[t]));

/** Длина петли темы, с. */
export function themeLoopSeconds(t: MusicTheme): number {
  const c = compiled(t);
  return c.steps.length * c.stepS;
}

// ---------------------------------------------------------------- синтез

const pulseWaves = new WeakMap<AudioContext, PeriodicWave | null>();
function pulse25(c: AudioContext): PeriodicWave | null {
  if (!pulseWaves.has(c)) {
    let w: PeriodicWave | null = null;
    try {
      const n = 32;
      const re = new Float32Array(n);
      const im = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        re[k] = Math.sin(2 * Math.PI * k * 0.25) / (Math.PI * k);
        im[k] = (1 - Math.cos(2 * Math.PI * k * 0.25)) / (Math.PI * k);
      }
      w = c.createPeriodicWave(re, im);
    } catch {
      w = null;
    }
    pulseWaves.set(c, w);
  }
  return pulseWaves.get(c) ?? null;
}

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer | null>();
function noise(c: AudioContext): AudioBuffer | null {
  if (!noiseBuffers.has(c)) {
    let b: AudioBuffer | null = null;
    try {
      const len = Math.max(1, Math.floor(c.sampleRate * 0.05));
      b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      b = null;
    }
    noiseBuffers.set(c, b);
  }
  return noiseBuffers.get(c) ?? null;
}

function envelope(g: AudioParam, v: number, t: number, end: number): void {
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(v, t + 0.008);
  g.exponentialRampToValueAtTime(v * 0.6, t + (end - t) * 0.6);
  g.exponentialRampToValueAtTime(0.0001, end);
}

function voice(c: AudioContext, out: AudioNode, ev: NoteEv, t: number, stepS: number): void {
  try {
    const gain = c.createGain();
    gain.connect(out);
    if (ev.voice === 'hat') {
      const buf = noise(c);
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      envelope(gain.gain, ev.v, t, t + 0.04);
      src.start(t);
      src.stop(t + 0.05);
      return;
    }
    const osc = c.createOscillator();
    const wave = ev.voice === 'p25' ? pulse25(c) : null;
    if (wave) osc.setPeriodicWave(wave);
    else osc.type = ev.voice === 'tri' ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(ev.f, t);
    osc.connect(gain);
    const end = t + ev.len * stepS * 0.92;
    envelope(gain.gain, ev.v, t, end);
    osc.start(t);
    osc.stop(end + 0.02);
  } catch {
    /* музыка не критична */
  }
}

// ---------------------------------------------------------------- секвенсор

interface Bus { gain: GainNode; theme: MusicTheme }

export function createMusic(isMuted: () => boolean, audio: AudioContextProvider = createAudioContextProvider()): Music {
  let theme: MusicTheme | null = null;
  let ducked = false;
  let master: GainNode | null = null;
  let masterOf: AudioContext | null = null;
  let bus: Bus | null = null;
  let step = 0;
  let nextTime = 0;
  let restart = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;
  let applied = -1;

  const doc = typeof document !== 'undefined' ? document : null;
  const hidden = (): boolean => doc?.visibilityState === 'hidden';
  const silent = (): boolean => isMuted() || hidden();
  const level = (): number => (silent() ? 0 : SFX_MASTER_GAIN * MUSIC_LEVEL * (ducked ? DUCK_LEVEL : 1));

  const graph = (): { c: AudioContext; m: GainNode } | null => {
    const c = audio.get();
    if (!c) return null;
    if (masterOf !== c || !master) {
      try {
        master = c.createGain();
        applied = level();
        master.gain.value = applied;
        master.connect(c.destination);
        masterOf = c;
      } catch {
        master = null;
        return null;
      }
    }
    return { c, m: master };
  };

  const fadeTo = (p: AudioParam, v: number, c: AudioContext, s: number): void => {
    try {
      const t = c.currentTime;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(v, t + s);
    } catch {
      p.value = v;
    }
  };

  const applyLevel = (): void => {
    const c = audio.get();
    const target = level();
    if (!c || !master || masterOf !== c || target === applied) return;
    // Глушим быстро, приглушаем/возвращаем — плавно.
    fadeTo(master.gain, target, c, target === 0 ? 0.05 : FADE_S);
    applied = target;
  };

  const tick = (): void => {
    const g = graph();
    if (!g || !theme) return;
    const { c, m } = g;
    applyLevel();
    if (silent()) {
      // Пауза: ноты не ставим, при возврате продолжаем с того же места.
      restart = true;
      return;
    }
    if (!bus || bus.theme !== theme) {
      let gain: GainNode;
      try {
        gain = c.createGain();
      } catch {
        return; // музыка не критична
      }
      gain.gain.value = 0;
      gain.connect(m);
      fadeTo(gain.gain, 1, c, FADE_S);
      bus = { gain, theme };
      step = 0;
      restart = true;
    }
    if (restart) {
      nextTime = c.currentTime + 0.05;
      restart = false;
    }
    const song = compiled(theme);
    while (nextTime < c.currentTime + LOOKAHEAD_S) {
      for (const ev of song.steps[step]!) voice(c, bus.gain, ev, nextTime, song.stepS);
      step = (step + 1) % song.steps.length;
      nextTime += song.stepS;
    }
  };

  const sync = (): void => {
    const run = !destroyed && theme !== null && audio.get() !== null && !hidden();
    if (run && !timer) timer = setInterval(tick, TICK_MS);
    if (!run && timer) {
      clearInterval(timer);
      timer = null;
    }
    if (run) tick();
  };

  const dropBus = (): void => {
    const b = bus;
    const c = audio.get();
    bus = null;
    if (!b || !c) return;
    fadeTo(b.gain.gain, 0, c, FADE_S);
    setTimeout(() => {
      try {
        b.gain.disconnect();
      } catch {
        /* уже отключена */
      }
    }, FADE_S * 1000 + 200);
  };

  // Скрытая вкладка: заглушить шину и остановить таймер; вернулась — продолжить с того же места.
  const onVisibility = (): void => {
    tick();
    sync();
  };
  doc?.addEventListener('visibilitychange', onVisibility);

  return {
    play(t) {
      if (destroyed || theme === t) return;
      dropBus();
      theme = t;
      sync();
    },
    stop() {
      dropBus();
      theme = null;
      sync();
    },
    duck(on) {
      ducked = on;
      applyLevel();
    },
    unlock() {
      audio.unlock();
      sync();
    },
    destroy() {
      dropBus();
      theme = null;
      destroyed = true;
      doc?.removeEventListener('visibilitychange', onVisibility);
      sync();
    },
  };
}
