// @vitest-environment happy-dom
// Экран рейтинга на фейковом сервисе: ТОП-10 с бейджами, своя позиция, отсчёт, карточка забега, ошибки.
import { describe, it, expect, afterEach } from 'vitest';
import { mountLeaderboardScreen } from '../src/leaderboard';
import type { LeaderboardService, PublicRow, RunResult, SeasonInfo, Standing, SubmitOutcome } from '../src/core/types';
import { makeStore } from './services/helpers';

const DAY = 86_400_000;
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const tick = () => new Promise((r) => setTimeout(r, 0));

function rows(n: number): PublicRow[] {
  return Array.from({ length: n }, (_, i) => ({ playerName: `Игрок ${i + 1}`, score: 10_000 - i * 500, createdAt: '2026-09-20T10:00:00Z', runsCount: 3 }));
}

function fakeService(p: { top?: PublicRow[] | Error; standing?: Standing | null; season?: SeasonInfo | null; isConfigured?: boolean; flush?: () => void } = {}) {
  const calls = { top: 0, flush: 0 };
  const svc: LeaderboardService = {
    isConfigured: p.isConfigured ?? true,
    fetchTop: async () => {
      calls.top++;
      if (p.top instanceof Error) throw p.top;
      return p.top ?? [];
    },
    fetchStanding: async () => p.standing ?? null,
    fetchSeason: async () => p.season ?? null,
    submitRun: async () => ({ kind: 'demo' }),
    flushQueue: async () => { calls.flush++; p.flush?.(); },
    pendingCount: () => 0,
  };
  return { svc, calls };
}

const STANDING = (rank: number | null, extra: Partial<Standing> = {}): Standing => ({
  rank, seasonTotal: 3420, gapToTop10: rank && rank > 10 ? 1280 : null, todayCounted: 1200, dailyLimit: 3000, isHidden: false, ...extra,
});

const RUN: RunResult = { runId: '0b7f3a52-4c1e-4a8e-9d2b-6f1c3e5a7b90', score: 1500, durationSeconds: 75, jumpsCount: 88, seed: 1, heightPx: 15000, isNewRecord: true };

let destroy: (() => void) | null = null;
afterEach(() => {
  destroy?.();
  destroy = null;
  document.body.textContent = '';
});

async function mount(svc: LeaderboardService, lastRun: { result: RunResult; submit: Promise<SubmitOutcome> } | null = null, store = makeStore()) {
  const host = document.createElement('div');
  host.className = 'ezq-root';
  document.body.appendChild(host);
  const nav: string[] = [];
  const h = mountLeaderboardScreen(host, { store, service: svc, lastRun, onPlayAgain: () => nav.push('again'), onBack: () => nav.push('back') });
  destroy = h.destroy;
  await tick();
  await tick();
  return { host, nav, store };
}

describe('leaderboard/screen', () => {
  it('шапка-призы, ТОП-10 с бейджами 1–3 и отметками, своя строка подсвечена, ники — только текстом', async () => {
    const top = rows(10);
    top[4].playerName = '<img src=x onerror="alert(1)">';
    top[1].playerName = 'Аня'; // своя строка: ник из store и очки = seasonTotal позиции
    const { host } = await mount(fakeService({ top, standing: STANDING(2, { seasonTotal: 9500 }) }).svc);

    expect(text(host)).toContain('Удерживай позиции в ТОП-3 школы и получи фирменный мерч от Easycode!');
    const items = [...host.querySelectorAll('.ezq-lb__row')];
    expect(items).toHaveLength(10);
    expect(text(items[0])).toContain('🥇');
    expect(text(items[0])).toContain('Главный приз');
    expect(text(items[1])).toContain('🥈');
    expect(text(items[1])).toContain('Призовой мерч');
    expect(text(items[2])).toContain('🥉');
    expect(text(items[2])).toContain('Призовой мерч');
    expect(text(items[3])).not.toMatch(/Приз|🥇|🥈|🥉/);
    expect(text(items[3])).toContain('4');
    expect(host.querySelector('img')).toBeNull();
    expect(text(items[4])).toContain('<img src=x onerror="alert(1)">');
    expect(items[1].classList.contains('ezq-lb__row--me')).toBe(true);
    expect(host.querySelectorAll('.ezq-lb__row--me')).toHaveLength(1);
    expect(text(host)).toContain('Сегодня в рейтинг: 1 200 / 3 000');
  });

  it('вне ТОП-10 — закреплённая строка с целью', async () => {
    const { host } = await mount(fakeService({ top: rows(10), standing: STANDING(47) }).svc);
    expect(text(host.querySelector('.ezq-lb__me'))).toContain('Ты — 47-й, 3 420 очков. До ТОП-10 — 1 280');
    expect(host.querySelectorAll('.ezq-lb__row--me')).toHaveLength(0);
  });

  it('пусто → «Стань первым»; ошибка → кэш с «обновлено N мин назад» и «Повторить»', async () => {
    const empty = await mount(fakeService({ top: [] }).svc);
    expect(text(empty.host)).toContain('Стань первым в рейтинге сезона!');
    destroy?.();
    document.body.textContent = '';

    const store = makeStore((d) => { d.leaderboard.cachedTop = { rows: rows(3), fetchedAt: Date.now() - 7 * 60_000 }; });
    const f = fakeService({ top: new Error('offline') });
    const { host } = await mount(f.svc, null, store);
    expect(host.querySelectorAll('.ezq-lb__row')).toHaveLength(3);
    expect(text(host)).toContain('обновлено 7 мин назад');
    const retry = [...host.querySelectorAll('button')].find((b) => text(b) === 'Повторить');
    expect(retry).toBeTruthy();
    retry!.click();
    await tick();
    expect(f.calls.top).toBe(2);
  });

  it('отсчёт до итогов и «Сезон завершён»', async () => {
    const endsAt = new Date(Date.now() + 5 * DAY + 3 * 3_600_000 + 30_000).toISOString();
    const a = await mount(fakeService({ top: rows(1), season: { title: 'Осень', endsAt, dailyLimit: 3000, isClosed: false } }).svc);
    expect(text(a.host)).toContain('Итоги сезона через 5 д 03 ч');
    destroy?.();
    document.body.textContent = '';

    const b = await mount(fakeService({ top: rows(1), season: { title: 'Осень', endsAt: new Date(Date.now() - DAY).toISOString(), dailyLimit: 3000, isClosed: true } }).svc);
    expect(text(b.host)).toContain('Сезон завершён, итоги подводятся');
  });

  it.each<[SubmitOutcome, string]>([
    [{ kind: 'counted', counted: 1500, seasonTotal: 4700, todayCounted: 2700, dailyLimit: 3000, rank: 12, gapToTop10: 300, seasonClosed: false, isHidden: false }, '+1 500 в рейтинг сезона (сегодня 2 700 / 3 000)'],
    [{ kind: 'counted', counted: 0, seasonTotal: 4700, todayCounted: 3000, dailyLimit: 3000, rank: 12, gapToTop10: 300, seasonClosed: false, isHidden: false }, '+0 — дневной лимит набран, возвращайся завтра!'],
    [{ kind: 'rejected', reason: 'TOO_SHORT' }, 'не засчитан — слишком короткий'],
    [{ kind: 'queued' }, 'ждёт интернета'],
    [{ kind: 'demo' }, 'Демо-режим'],
  ])('карточка последнего забега: %o', async (outcome, expected) => {
    const { host, nav } = await mount(fakeService({ top: rows(3) }).svc, { result: RUN, submit: Promise.resolve(outcome) });
    const card = host.querySelector('.ezq-lb__run');
    expect(text(card)).toContain('1 500');
    expect(text(card)).toContain('Новый рекорд!');
    expect(text(card).toLowerCase()).toContain(expected.toLowerCase());
    [...card!.querySelectorAll('button')].find((b) => text(b).includes('Ещё раз'))!.click();
    [...card!.querySelectorAll('button')].find((b) => text(b).includes('квест-профиль'))!.click();
    expect(nav).toEqual(['again', 'back']);
  });

  it('BAD_NAME → диалог смены ника; новый ник сохраняется и очередь отправляется заново', async () => {
    const f = fakeService({ top: rows(3) });
    const { host, store } = await mount(f.svc, { result: RUN, submit: Promise.resolve({ kind: 'rejected', reason: 'BAD_NAME' }) });
    const dialog = host.querySelector('.ezq-lb__dialog');
    expect(dialog).toBeTruthy();
    const input = dialog!.querySelector('input')!;
    input.value = 'Котлета';
    dialog!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(store.get().leaderboard.playerName).toBe('Котлета');
    expect(f.calls.flush).toBe(1);
    expect(host.querySelector('.ezq-lb__dialog')).toBeNull();
  });
  it('ничья: подсвечивается ровно своя строка (ник + очки), чужая с тем же рангом — нет', async () => {
    const top: PublicRow[] = [
      { playerName: 'Космокот', score: 5000, createdAt: '', runsCount: 1 },
      { playerName: 'Аня', score: 3000, createdAt: '', runsCount: 1 },
      { playerName: 'Борис', score: 3000, createdAt: '', runsCount: 1 },
    ];
    const { host } = await mount(fakeService({ top, standing: STANDING(3, { seasonTotal: 3000 }) }).svc);
    const me = [...host.querySelectorAll('.ezq-lb__row--me')];
    expect(me).toHaveLength(1);
    expect(text(me[0])).toContain('Аня');
  });

  it('ничья с однофамильцем того же счёта — не подсвечиваем ничего, если не ясно, какая строка своя', async () => {
    const top: PublicRow[] = [
      { playerName: 'Аня', score: 3000, createdAt: '', runsCount: 1 },
      { playerName: 'Аня', score: 3000, createdAt: '', runsCount: 1 },
    ];
    const { host } = await mount(fakeService({ top, standing: STANDING(1, { seasonTotal: 3000 }) }).svc);
    expect(host.querySelectorAll('.ezq-lb__row--me')).toHaveLength(0);
  });

  it('скрытый куратором ученик видит «Твоя запись скрыта куратором»', async () => {
    const { host } = await mount(fakeService({ top: rows(3), standing: STANDING(47, { isHidden: true }) }).svc);
    expect(text(host.querySelector('.ezq-lb__me'))).toBe('Твоя запись скрыта куратором');
  });

  it('демо-режим: только сообщение о неподключённом рейтинге и личная статистика, без «Стань первым»', async () => {
    const store = makeStore((d) => { d.arcade.highScore = 1500; d.arcade.totalRunsPlayed = 4; });
    const { host } = await mount(fakeService({ isConfigured: false }).svc, null, store);
    expect(text(host)).toContain('Рейтинг школы появится после подключения сервера');
    expect(text(host)).not.toContain('Стань первым');
    expect(host.querySelectorAll('.ezq-lb__row')).toHaveLength(0);
    expect(text(host.querySelector('.ezq-lb__me'))).toContain('Твой рекорд: 1 500');
    expect(text(host)).not.toContain('Сегодня в рейтинг');
  });
});
