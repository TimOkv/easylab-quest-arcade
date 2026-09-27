// @vitest-environment happy-dom
// Звук: AudioContext рождается только в unlock() (жест), play() до разблокировки — тихий no-op.
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createSfx } from '../src/services/sfx';
import { mountApp } from '../src/app/app';
import { createRestClient } from '../src/services/rest';

class FakeAudioContext {
  static made = 0;
  state = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators = 0;
  resumes = 0;
  constructor() { FakeAudioContext.made++; last = this; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() {
    this.oscillators++;
    return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} };
  }
}
let last: FakeAudioContext | null = null;
const g = globalThis as { AudioContext?: unknown };
const saved = g.AudioContext;
g.AudioContext = FakeAudioContext;

afterEach(() => {
  FakeAudioContext.made = 0;
  last = null;
  document.body.textContent = '';
});

describe('sfx', () => {
  it('play() до unlock() не создаёт AudioContext и молчит', () => {
    const sfx = createSfx(() => false);
    sfx.play('click');
    sfx.play('coin');
    expect(FakeAudioContext.made).toBe(0);
  });

  it('unlock() создаёт контекст один раз и будит его; после — play() звучит', () => {
    const sfx = createSfx(() => false);
    sfx.unlock();
    sfx.unlock();
    expect(FakeAudioContext.made).toBe(1);
    expect(last!.resumes).toBeGreaterThan(0);
    sfx.play('coin');
    expect(last!.oscillators).toBe(2);
  });

  it('mountApp → destroy без жеста: контекст не создан и не разбужен', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = mountApp(root, { storage: null, win: null, rest: createRestClient({ url: '', anonKey: '' }), screens: {
      quest: () => ({ destroy() {} }), arcade: () => ({ destroy() {} }), leaderboard: () => ({ destroy() {} }),
    } });
    app.sfx.play('click');
    app.destroy();
    expect(FakeAudioContext.made).toBe(0);
  });

  it('первый жест в корне приложения разблокирует звук', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = mountApp(root, { storage: null, win: null, rest: createRestClient({ url: '', anonKey: '' }), screens: {
      quest: () => ({ destroy() {} }), arcade: () => ({ destroy() {} }), leaderboard: () => ({ destroy() {} }),
    } });
    root.dispatchEvent(new Event('pointerdown'));
    expect(FakeAudioContext.made).toBe(1);
    app.destroy();
    expect(FakeAudioContext.made).toBe(1);
  });
});

afterAll(() => { g.AudioContext = saved; });
