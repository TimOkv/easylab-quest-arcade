import { describe, it, expect } from 'vitest';
import { createBridge, isAllowedOrigin, type BridgeWindow } from '../../src/services/bridge';

describe('isAllowedOrigin', () => {
  it.each([
    ['https://easycode-lab.ru', true],
    ['https://app.easycode-lab.ru', true],
    ['https://a.b.easycode-lab.ru', true],
    ['http://easycode-lab.ru', false],
    ['http://app.easycode-lab.ru', false],
    ['https://evil-easycode-lab.ru', false],
    ['https://easycode-lab.ru.evil.com', false],
    ['https://easycode-lab.ru:8443', false],
    ['null', false],
    ['', false],
  ])('%s → %s', (origin, ok) => {
    expect(isAllowedOrigin(origin)).toBe(ok);
  });

  it('дополнительные origin — точное совпадение или маска *.', () => {
    expect(isAllowedOrigin('http://localhost:5173', ['http://localhost:5173'])).toBe(true);
    expect(isAllowedOrigin('http://localhost:5174', ['http://localhost:5173'])).toBe(false);
    expect(isAllowedOrigin('https://x.school.dev', ['https://*.school.dev'])).toBe(true);
    expect(isAllowedOrigin('https://school.dev.evil.io', ['https://*.school.dev'])).toBe(false);
  });
});

type Listener = (e: { origin: string; data: unknown; source: unknown }) => void;

function fakeWindow(opts: { embedded: boolean; referrer?: string; origin?: string }) {
  const posted: Array<{ data: any; target: string }> = [];
  const listeners = new Set<Listener>();
  const parent = { postMessage: (data: unknown, target: string) => posted.push({ data, target }) };
  const win: BridgeWindow = {
    location: { origin: opts.origin ?? 'https://quest.cdn.example' },
    document: { referrer: opts.referrer ?? '' },
    parent: opts.embedded ? parent : null,
    addEventListener: (_t: 'message', fn: Listener) => void listeners.add(fn),
    removeEventListener: (_t: 'message', fn: Listener) => void listeners.delete(fn),
  } as unknown as BridgeWindow;
  if (!opts.embedded) (win as { parent: unknown }).parent = win;
  const receive = (origin: string, data: unknown, source: unknown = parent) =>
    listeners.forEach((fn) => fn({ origin, data, source }));
  return { win, posted, receive, parent, listeners };
}

const QUEST = {
  coinsEarned: 58, maxCoins: 75 as const, verificationCode: 'EZ-AB2C', completedAt: '2026-09-26T10:00:00.000Z',
  studentId: null, rooms: [],
};

describe('createBridge', () => {
  it('вне iframe ничего не шлёт', () => {
    const f = fakeWindow({ embedded: false, referrer: 'https://easycode-lab.ru/lesson' });
    const b = createBridge({ win: f.win });
    b.announceReady();
    b.sendQuestCompleted(QUEST);
    expect(b.isEmbedded).toBe(false);
    expect(f.posted).toEqual([]);
  });

  it('READY уходит на origin из referrer в конверте ezq, только если он в белом списке', () => {
    const f = fakeWindow({ embedded: true, referrer: 'https://app.easycode-lab.ru/course/1' });
    createBridge({ win: f.win }).announceReady();
    expect(f.posted).toEqual([
      { data: { source: 'ezq', version: 1, type: 'EASYLAB_READY', payload: {} }, target: 'https://app.easycode-lab.ru' },
    ]);

    const g = fakeWindow({ embedded: true, referrer: 'https://evil-easycode-lab.ru/' });
    createBridge({ win: g.win }).announceReady();
    expect(g.posted).toEqual([]);
  });

  it('AUTH_INIT с чужого origin игнорируется; с разрешённого — применяется и открывает отправку на него', () => {
    const f = fakeWindow({ embedded: true });
    const b = createBridge({ win: f.win });
    const got: unknown[] = [];
    b.onAuthInit((a) => got.push(a));

    f.receive('https://easycode-lab.ru.evil.com', { type: 'EASYLAB_AUTH_INIT', payload: { studentId: 'x' } });
    b.sendQuestCompleted(QUEST);
    expect(got).toEqual([]);
    expect(f.posted).toEqual([]);

    f.receive('https://easycode-lab.ru', { type: 'EASYLAB_AUTH_INIT', payload: { studentId: 's-42', name: 'Аня', theme: 'light' } });
    expect(got).toEqual([{ studentId: 's-42', name: 'Аня', theme: 'light' }]);
    // Отправленное до знакомства с родителем не теряется — уходит на проверенный origin.
    expect(f.posted).toEqual([
      { data: { source: 'ezq', version: 1, type: 'EASYLAB_QUEST_COMPLETED', payload: QUEST }, target: 'https://easycode-lab.ru' },
    ]);
  });

  it('AUTH_INIT не от родительского окна игнорируется; мусорные поля отбрасываются', () => {
    const f = fakeWindow({ embedded: true });
    const b = createBridge({ win: f.win });
    const got: unknown[] = [];
    b.onAuthInit((a) => got.push(a));
    f.receive('https://easycode-lab.ru', { type: 'EASYLAB_AUTH_INIT', payload: { studentId: 's' } }, {});
    f.receive('https://easycode-lab.ru', { type: 'EASYLAB_AUTH_INIT', payload: { studentId: 77, name: { x: 1 }, theme: 'neon' } });
    expect(got).toEqual([{ studentId: '77', name: null, theme: null }]);
  });

  it('собственный origin модуля и extraOrigins разрешены', () => {
    const f = fakeWindow({ embedded: true, origin: 'http://localhost:5173', referrer: 'http://localhost:5173/parent_test.html' });
    const b = createBridge({ win: f.win });
    b.sendGameFinished({ score: 900, highScore: 1200, seasonTotal: 3000, durationSeconds: 40, jumpsCount: 55, verificationCode: 'EZ-AB2C' });
    expect(f.posted[0]).toMatchObject({ target: 'http://localhost:5173', data: { type: 'EASYLAB_GAME_FINISHED', payload: { score: 900 } } });

    const g = fakeWindow({ embedded: true, referrer: 'https://lms.partner.org/x' });
    createBridge({ win: g.win, extraOrigins: ['https://lms.partner.org'] }).announceReady();
    expect(g.posted[0]?.target).toBe('https://lms.partner.org');
  });

  it('destroy снимает слушатель', () => {
    const f = fakeWindow({ embedded: true });
    const b = createBridge({ win: f.win });
    expect(f.listeners.size).toBe(1);
    b.destroy();
    expect(f.listeners.size).toBe(0);
  });
});
