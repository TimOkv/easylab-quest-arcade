// @vitest-environment happy-dom
// Разблокировка звука по правилам автоплея настоящих браузеров (регресс к «нет ни музыки, ни эффектов»).
// Фейковый AudioContext ведёт себя как Chrome/Safari: resume() будит контекст только внутри
// пользовательской активации. Активацию дают keydown, click, pointerup/touchend касания
// и pointerdown мыши; pointerdown касания (Chrome Android, iOS Safari) её НЕ даёт.
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { mountApp, type AppHandle } from '../../src/app/app';
import { createRestClient } from '../../src/services/rest';

let activation = false;

class PolicyAudioContext {
  static all: PolicyAudioContext[] = [];
  state: 'suspended' | 'running' | 'interrupted' | 'closed' = 'suspended';
  currentTime = 0;
  destination = {};
  sampleRate = 44100;
  oscillators = 0;
  constructor() {
    if (activation) this.state = 'running';
    PolicyAudioContext.all.push(this);
  }
  resume(): Promise<void> {
    if (activation) this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    const p = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
    return { gain: p, connect() {}, disconnect() {} };
  }
  createOscillator() {
    this.oscillators++;
    const f = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return { type: '', frequency: f, connect() {}, start() {}, stop() {}, setPeriodicWave() {} };
  }
  createPeriodicWave() { return {}; }
  createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
}

const g = globalThis as { AudioContext?: unknown };
const saved = g.AudioContext;
g.AudioContext = PolicyAudioContext;

let app: AppHandle | null = null;
afterEach(() => {
  app?.destroy();
  app = null;
  PolicyAudioContext.all = [];
  activation = false;
  document.body.textContent = '';
});
afterAll(() => { g.AudioContext = saved; });

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  app = mountApp(root, { storage: null, win: null, rest: createRestClient({ url: '', anonKey: '' }), screens: {
    quest: (_h, ctx) => { ctx.music.play('quest'); return { destroy() {} }; },
    arcade: () => ({ destroy() {} }), leaderboard: () => ({ destroy() {} }),
  } });
  return root;
}

/** Событие жеста; `active` — даёт ли браузер на нём пользовательскую активацию. */
function gesture(target: EventTarget, type: string, active: boolean, init: Record<string, unknown> = {}): void {
  activation = active;
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, init);
  target.dispatchEvent(ev);
  activation = false;
}

const ctx = (): PolicyAudioContext | undefined => PolicyAudioContext.all[0];

describe('разблокировка звука жестом', () => {
  it('касание: pointerdown без активации не «съедает» разблокировку — её завершает отпускание пальца', () => {
    const root = mount();
    gesture(root, 'pointerdown', false, { pointerType: 'touch' });
    expect(ctx()?.state).not.toBe('running');
    gesture(root, 'pointerup', true, { pointerType: 'touch' });
    expect(ctx()?.state).toBe('running');
    expect(PolicyAudioContext.all).toHaveLength(1);
  });

  it('клавиша при фокусе на body (стрелки без клика) будит звук и запускает музыку квеста', () => {
    mount();
    gesture(document.body, 'keydown', true, { code: 'ArrowRight', key: 'ArrowRight' });
    expect(ctx()?.state).toBe('running');
    expect(ctx()!.oscillators).toBeGreaterThan(0);
  });

  it('iOS «прервал» контекст (звонок, другое приложение) — следующий жест будит его снова', () => {
    const root = mount();
    gesture(root, 'click', true);
    expect(ctx()?.state).toBe('running');
    ctx()!.state = 'interrupted';
    gesture(root, 'touchend', true);
    expect(ctx()?.state).toBe('running');
    expect(PolicyAudioContext.all).toHaveLength(1);
  });

  it('эффект в прерванном контексте сам пробует его разбудить', () => {
    const root = mount();
    gesture(root, 'click', true);
    ctx()!.state = 'interrupted';
    activation = true; // обработчик нажатия кнопки
    app!.sfx.play('click');
    activation = false;
    expect(ctx()?.state).toBe('running');
  });

  it('после destroy жесты контекст не создают', () => {
    mount();
    app!.destroy();
    app = null;
    gesture(document.body, 'keydown', true);
    gesture(document.body, 'click', true);
    expect(PolicyAudioContext.all).toHaveLength(0);
  });
});
