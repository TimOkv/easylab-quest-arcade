// 8-бит эффекты на WebAudio-синтезе (0 байт аудиофайлов). AudioContext создаётся только в unlock()
// (из обработчика жеста — политика автоплея); play() до разблокировки — тихий no-op.

export type SfxName =
  | 'click'
  | 'correct'
  | 'wrong'
  | 'coin'
  | 'door'
  | 'fanfare'
  | 'jump'
  | 'spring'
  | 'rocket'
  | 'gameover';

export interface Sfx {
  play(name: SfxName): void;
  /** Создать/возобновить AudioContext. Звать из обработчика жеста пользователя. */
  unlock(): void;
}

interface Note {
  f: number; // частота, Гц
  to?: number; // скольжение к частоте
  t: number; // сдвиг старта, с
  d: number; // длительность, с
  w?: OscillatorType;
  v?: number; // громкость 0..1
}

const N = { C4: 262, E4: 330, G4: 392, C5: 523, E5: 659, G5: 784, B5: 988, C6: 1047, E6: 1319 };

const PATCHES: Record<SfxName, Note[]> = {
  click: [{ f: 880, t: 0, d: 0.04, w: 'square', v: 0.12 }],
  correct: [
    { f: N.C5, t: 0, d: 0.09, w: 'triangle' },
    { f: N.E5, t: 0.08, d: 0.09, w: 'triangle' },
    { f: N.G5, t: 0.16, d: 0.18, w: 'triangle' },
  ],
  wrong: [{ f: 220, to: 130, t: 0, d: 0.28, w: 'square', v: 0.14 }],
  coin: [
    { f: N.B5, t: 0, d: 0.07, w: 'square', v: 0.12 },
    { f: N.E6, t: 0.07, d: 0.22, w: 'square', v: 0.12 },
  ],
  door: [
    { f: 110, to: 70, t: 0, d: 0.35, w: 'sawtooth', v: 0.12 },
    { f: 220, to: 330, t: 0.3, d: 0.15, w: 'triangle', v: 0.12 },
  ],
  fanfare: [
    { f: N.C5, t: 0, d: 0.12, w: 'square', v: 0.12 },
    { f: N.E5, t: 0.12, d: 0.12, w: 'square', v: 0.12 },
    { f: N.G5, t: 0.24, d: 0.12, w: 'square', v: 0.12 },
    { f: N.C6, t: 0.36, d: 0.45, w: 'square', v: 0.12 },
    { f: N.G5, t: 0.36, d: 0.45, w: 'triangle', v: 0.1 },
  ],
  jump: [{ f: 300, to: 620, t: 0, d: 0.12, w: 'square', v: 0.08 }],
  spring: [{ f: 200, to: 1200, t: 0, d: 0.25, w: 'triangle', v: 0.14 }],
  rocket: [
    { f: 80, to: 420, t: 0, d: 0.7, w: 'sawtooth', v: 0.1 },
    { f: 160, to: 840, t: 0.05, d: 0.6, w: 'square', v: 0.05 },
  ],
  gameover: [
    { f: N.G4, t: 0, d: 0.18, w: 'square', v: 0.12 },
    { f: N.E4, t: 0.18, d: 0.18, w: 'square', v: 0.12 },
    { f: N.C4, to: 110, t: 0.36, d: 0.5, w: 'square', v: 0.12 },
  ],
};

type AudioCtor = typeof AudioContext;

export function createSfx(isMuted: () => boolean): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const unlock = (): void => {
    const c = ensure();
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
  };

  const play = (name: SfxName): void => {
    if (isMuted()) return;
    const c = ctx;
    if (!c || !master) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    const t0 = c.currentTime + 0.01;
    for (const n of PATCHES[name]) {
      try {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = n.w ?? 'square';
        const start = t0 + n.t;
        const end = start + n.d;
        osc.frequency.setValueAtTime(n.f, start);
        if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, end);
        const v = n.v ?? 0.15;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(v, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(end + 0.02);
      } catch {
        /* звук не критичен */
      }
    }
  };

  return { play, unlock };
}
