// @vitest-environment happy-dom
// Профиль аркады: дневной лимит рейтинга (история 60) — из store, в демо-режиме не показывается.
import { describe, it, expect, afterEach } from 'vitest';
import { mountArcadeScreen } from '../src/arcade';
import type { Sfx } from '../src/services/sfx';
import { makeStore } from './services/helpers';

// happy-dom не рисует canvas — заглушка 2d-контекста: любой метод — no-op, возвращающий заглушку.
const stub: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : stub),
  apply: () => stub,
  set: () => true,
});
HTMLCanvasElement.prototype.getContext = (() => stub) as never;

const sfx: Sfx = { play() {}, unlock() {} };
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
let destroy: (() => void) | null = null;
afterEach(() => { destroy?.(); destroy = null; document.body.textContent = ''; });

function mount(dailyLimit?: { isFresh(): boolean; refresh(): Promise<unknown> }) {
  const store = makeStore((d) => { d.leaderboard.todayCounted = 1200; d.leaderboard.dailyLimit = 3000; });
  const host = document.createElement('div');
  host.className = 'ezq-root';
  document.body.appendChild(host);
  destroy = mountArcadeScreen(host, { store, sfx, dailyLimit, onGameOver() {}, onOpenLeaderboard() {} }).destroy;
  return { host, store };
}

describe('arcade profile: дневной лимит', () => {
  it('с сервером — «Сегодня в рейтинг: X / лимит» из store и обновляется', () => {
    const { host, store } = mount({ isFresh: () => true, refresh: async () => {} });
    expect(text(host)).toContain('Сегодня в рейтинг: 1 200 / 3 000');
    store.update((d) => { d.leaderboard.todayCounted = 2500; });
    expect(text(host)).toContain('Сегодня в рейтинг: 2 500 / 3 000');
  });

  it('в демо-режиме строки нет', () => {
    const { host } = mount(undefined);
    expect(text(host)).not.toContain('Сегодня в рейтинг');
  });
});
