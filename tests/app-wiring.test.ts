// @vitest-environment happy-dom
// Проводка приложения: квест → триумф → аркада → рейтинг с фейковыми сервисами и фейковым родителем.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { outcomeText } from '../src/leaderboard/screen';
import { mountApp, questCompletedPayload, type AppHandle } from '../src/app/app';
import { NetworkError } from '../src/services/rest';
import type { AppContext } from '../src/app/screens';
import { createBridge, type BridgeWindow } from '../src/services/bridge';
import { createInitialState, SAVE_KEY } from '../src/core/state';
import { PUZZLES_BY_ROOM, type PuzzleId, type RoomIndex, type RunResult, type ScreenName } from '../src/core/types';
import { FakeStorage, fakeServer, type Handler } from './services/helpers';
import type { RestClient } from '../src/services/rest';

// happy-dom не рисует canvas — заглушка 2d-контекста (для настоящего экрана аркады).
const stub: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : stub),
  apply: () => stub,
  set: () => true,
});
HTMLCanvasElement.prototype.getContext = (() => stub) as never;

const RIGHT: Record<PuzzleId, unknown> = {
  var_types: { name: 'izik', age: 'num12', likes: 'true' },
  var_assign: 'five',
  if_fridge: 'else',
  and_kettle: ['yy'],
  for_shelf: ['for_0_lt5', 'put', 'close'],
  while_pc: 'five',
  fn_play: ['play', 'lparen', 'str_jazz', 'comma', 'n3', 'rparen'],
  fn_mission: ['runMission', 'lparen', 'str_arcade', 'rparen'],
};
const WRONG2 = 'if';
const PLATFORM = 'https://app.easycode-lab.ru';

type Listener = (e: { origin: string; data: unknown; source: unknown }) => void;

function fakeParent() {
  const posted: Array<{ data: any; target: string }> = [];
  const listeners = new Set<Listener>();
  const parent = { postMessage: (data: unknown, target: string) => posted.push({ data, target }) };
  const win = {
    location: { origin: 'https://quest.cdn.example' },
    document: { referrer: `${PLATFORM}/lesson/7` },
    parent,
    addEventListener: (_t: string, fn: Listener) => void listeners.add(fn),
    removeEventListener: (_t: string, fn: Listener) => void listeners.delete(fn),
  } as unknown as BridgeWindow;
  const authInit = (payload: object) =>
    listeners.forEach((fn) => fn({ origin: PLATFORM, source: parent, data: { type: 'EASYLAB_AUTH_INIT', payload } }));
  const types = () => posted.map((p) => p.data.type as string);
  const find = (type: string) => posted.find((p) => p.data.type === type);
  return { win, posted, authInit, types, find };
}

function stubScreens(seen: Array<{ name: ScreenName; ctx: AppContext }>) {
  const make = (name: ScreenName) => (_host: HTMLElement, ctx: AppContext) => {
    seen.push({ name, ctx });
    return { destroy() {} };
  };
  return { quest: make('quest'), arcade: make('arcade'), leaderboard: make('leaderboard') };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

let app: AppHandle | null = null;
afterEach(() => {
  app?.destroy();
  app = null;
  document.body.textContent = '';
});

function mount(routes: Record<string, Handler>, storage = new FakeStorage()) {
  const server = fakeServer(routes);
  const parent = fakeParent();
  const seen: Array<{ name: ScreenName; ctx: AppContext }> = [];
  const root = document.createElement('div');
  document.body.appendChild(root);
  app = mountApp(root, {
    storage,
    win: null,
    rest: server.rest,
    bridge: createBridge({ win: parent.win }),
    screens: stubScreens(seen),
    authWaitMs: 200,
  });
  return { server, parent, seen, app, storage, last: () => seen[seen.length - 1] };
}

const REGISTER: Handler = (a) => ({ body: { verification_code: a.p_code, coins_earned: a.p_coins, completed_at: a.p_completed_at, restored: false } });
const SUBMIT: Handler = (a) => ({
  body: { counted: a.p_score, season_total: 4100, today_counted: 1200, daily_limit: 3000, rank: 5, gap_to_top10: null, is_hidden: false, season_ends_at: null, season_closed: false },
});

describe('app wiring', () => {
  it('полный путь: AUTH_INIT → квест → QUEST_COMPLETED куратору и платформе → аркада → забег → GAME_FINISHED и рейтинг', async () => {
    const t = mount({ restore_by_student: () => ({ body: null }), register_quest_completion: REGISTER, submit_arcade_score: SUBMIT });
    expect(t.parent.types()).toEqual(['EASYLAB_READY']);

    t.parent.authInit({ studentId: 'stu-9', name: 'Аня', theme: 'light' });
    await t.app.ready;
    const s0 = t.app.store.get();
    expect(s0.meta).toMatchObject({ platformStudentId: 'stu-9', isEmbedded: true, theme: 'light' });
    expect(s0.leaderboard.playerName).toBe('Аня');
    expect(t.server.rpcCalls('restore_by_student')[0]?.args).toEqual({ p_student_id: 'stu-9' });
    expect(t.last()?.name).toBe('quest');

    const ctx = t.last()!.ctx;
    expect(ctx.controller.startQuest('Аня').ok).toBe(true);
    for (const n of [1, 2, 3, 4] as RoomIndex[]) {
      if (n === 2) ctx.controller.submit('if_fridge', WRONG2);
      for (const pid of PUZZLES_BY_ROOM[n]) expect(ctx.controller.submit(pid, RIGHT[pid]).correct).toBe(true);
      if (n < 4) ctx.controller.advance();
    }
    await tick();
    const q = t.app.store.get().quest;
    expect(q.isCompleted).toBe(true);
    expect(q.totalCoinsEarned).toBe(150 - 15 + 11); // холодильник — со второй попытки (таблица «Монеты»)

    // Куратор получил запись, платформа — событие с точными монетами, кодом и комнатами.
    expect(t.server.rpcCalls('register_quest_completion')[0]?.args).toMatchObject({ p_code: q.verificationCode, p_coins: 146, p_student_id: 'stu-9' });
    const done = t.parent.find('EASYLAB_QUEST_COMPLETED');
    expect(done?.target).toBe(PLATFORM);
    expect(done?.data).toMatchObject({ source: 'ezq', version: 1 });
    expect(done?.data.payload).toMatchObject({ coinsEarned: 146, maxCoins: 150, verificationCode: q.verificationCode, studentId: 'stu-9' });
    expect(done?.data.payload.completedAt).toBe(new Date(q.completedAt!).toISOString());
    expect(done?.data.payload.rooms.map((r: { earnedCoins: number }) => r.earnedCoins)).toEqual([20, 26, 40, 60]);
    expect(done?.data.payload.rooms[1]).toMatchObject({ room: 2, attempts: 3, maxReward: 30 });
    expect(done?.data.payload.puzzles).toHaveLength(8);
    expect(done?.data.payload.puzzles.find((p: { id: string }) => p.id === 'if_fridge')).toEqual({ id: 'if_fridge', room: 2, earnedCoins: 11, maxReward: 15, attempts: 2, hintsUsed: 0 });

    // Триумф ждёт кнопку: роутер не уводит с квеста сам.
    expect(t.app.router?.current()).toBe('quest');
    ctx.navigate('arcade');
    expect(t.last()?.name).toBe('arcade');

    const run: RunResult = { runId: '0b7f3a52-4c1e-4a8e-9d2b-6f1c3e5a7b90', score: 900, durationSeconds: 40, jumpsCount: 55, seed: 7, heightPx: 9000, isNewRecord: true };
    t.app.store.update((d) => { d.arcade.highScore = 900; });
    t.last()!.ctx.onGameOver(run);
    expect(t.last()?.name).toBe('leaderboard');
    const lastRun = t.last()!.ctx.lastRun;
    expect(lastRun?.result).toBe(run);
    await expect(lastRun!.submit).resolves.toMatchObject({ kind: 'counted', counted: 900, seasonTotal: 4100 });
    await tick();

    expect(t.server.rpcCalls('submit_arcade_score')[0]?.args).toMatchObject({ p_run_id: run.runId, p_score: 900, p_code: q.verificationCode });
    const fin = t.parent.find('EASYLAB_GAME_FINISHED');
    expect(fin?.target).toBe(PLATFORM);
    expect(fin?.data.payload).toEqual({ score: 900, highScore: 900, seasonTotal: 4100, durationSeconds: 40, jumpsCount: 55, verificationCode: q.verificationCode });
  });

  it('G03: ученик уже прошёл квест на другом устройстве → аркада с тостом, квест не повторяется', async () => {
    const t = mount({
      restore_by_student: () => ({ body: { verification_code: 'EZ-7K3P', coins_earned: 61, player_name: 'Миша', completed_at: '2026-09-20T09:00:00Z' } }),
    });
    t.parent.authInit({ studentId: 'stu-1' });
    await t.app.ready;
    await tick();
    expect(t.app.router?.current()).toBe('arcade');
    expect(t.app.store.get().quest).toMatchObject({ isCompleted: true, verificationCode: 'EZ-7K3P', totalCoinsEarned: 61 });
    expect(document.querySelector('.ezq-toast')?.textContent).toContain('С возвращением');
    expect(t.parent.types()).not.toContain('EASYLAB_QUEST_COMPLETED');
    t.last()!.ctx.navigate('quest');
    expect(t.app.router?.current()).toBe('arcade');
  });

  it('восстановленное с сервера прохождение на 150 (restoreByStudent): в QUEST_COMPLETED нет 8 нулевых записей puzzles', async () => {
    const t = mount({
      restore_by_student: () => ({ body: { verification_code: 'EZ-7K3P', coins_earned: 120, coins_max: 150, player_name: 'Миша', completed_at: '2026-09-20T09:00:00Z' } }),
    });
    t.parent.authInit({ studentId: 'stu-2' });
    await t.app.ready;
    await tick();
    const s = t.app.store.get();
    expect(s.quest).toMatchObject({ isCompleted: true, verificationCode: 'EZ-7K3P', totalCoinsEarned: 120, maxPossibleCoins: 150, isRestored: true });
    const p = questCompletedPayload(s)!;
    expect(p).toMatchObject({ coinsEarned: 120, maxCoins: 150, verificationCode: 'EZ-7K3P', studentId: 'stu-2' });
    // Разбивка восстановленного неизвестна: ни комнат, ни загадок (docs/INTEGRATION.md).
    expect(p.rooms).toEqual([]);
    expect(p.puzzles).toEqual([]);
  });

  it('register ответил restored: true с другим кодом → повторное QUEST_COMPLETED с серверными кодом и монетами, без комнат и загадок', async () => {
    const t = mount({
      restore_by_student: () => ({ body: null }),
      register_quest_completion: () => ({ body: { verification_code: 'EZ-7K3P', coins_earned: 120, coins_max: 150, completed_at: '2026-09-20T09:00:00Z', restored: true } }),
    });
    t.parent.authInit({ studentId: 'stu-3', name: 'Аня' });
    await t.app.ready;
    const ctx = t.last()!.ctx;
    expect(ctx.controller.startQuest('Аня').ok).toBe(true);
    for (const n of [1, 2, 3, 4] as RoomIndex[]) {
      for (const pid of PUZZLES_BY_ROOM[n]) expect(ctx.controller.submit(pid, RIGHT[pid]).correct).toBe(true);
      if (n < 4) ctx.controller.advance();
    }
    await tick();
    await tick();
    const sent = t.parent.posted.filter((m) => m.data.type === 'EASYLAB_QUEST_COMPLETED').map((m) => m.data.payload);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ coinsEarned: 150, maxCoins: 150 });
    expect(sent[0].puzzles).toHaveLength(8);
    expect(sent[0].rooms.map((r: { earnedCoins: number }) => r.earnedCoins)).toEqual([20, 30, 40, 60]);
    expect(sent[1]).toMatchObject({ coinsEarned: 120, maxCoins: 150, verificationCode: 'EZ-7K3P', completedAt: '2026-09-20T09:00:00.000Z' });
    // Местные комнаты (сумма 150) к серверному итогу 120 не относятся — разбивка неизвестна.
    expect(sent[1].rooms).toEqual([]);
    expect(sent[1].puzzles).toEqual([]);
    expect(t.app.store.get().quest).toMatchObject({ verificationCode: 'EZ-7K3P', totalCoinsEarned: 120, isRestored: true, isSyncedWithCurator: true });
  });

  it('без AUTH_INIT встроенный модуль ждёт не дольше authWaitMs и продолжает как гость; пройденный квест → старт в аркаде', async () => {
    const storage = new FakeStorage();
    const s = createInitialState(1, 'sess-x');
    s.quest.isCompleted = true;
    s.quest.verificationCode = 'EZ-AB2C';
    s.arcade.isUnlocked = true;
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    const t = mount({}, storage);
    const started = Date.now();
    await t.app.ready;
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    expect(t.app.router?.current()).toBe('arcade');
    expect(t.server.rpcCalls('restore_by_student')).toEqual([]);
  });

  it('профиль аркады: вчерашний лимит из сохранения не показывается, после ответа сервера — «0 / 3 000»', async () => {
    const storage = new FakeStorage();
    const s = createInitialState(1, 'sess-y');
    s.quest.isCompleted = true;
    s.quest.verificationCode = 'EZ-AB2C';
    s.quest.isSyncedWithCurator = true;
    s.arcade.isUnlocked = true;
    s.leaderboard.playerName = 'Аня';
    s.leaderboard.todayCounted = 3000; // вчерашнее значение
    s.leaderboard.dailyLimit = 3000;
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    let open: () => void = () => {};
    const gate = new Promise<void>((r) => { open = r; });
    const rest: RestClient = {
      isConfigured: true,
      select: async () => [] as never,
      rpc: (async (name: string) => {
        if (name !== 'get_my_standing') return null;
        await gate;
        return { season_total: 5000, today_counted: 0, daily_limit: 3000, rank: 12, gap_to_top10: 100, is_hidden: false };
      }) as RestClient['rpc'],
    };
    const root = document.createElement('div');
    document.body.appendChild(root);
    app = mountApp(root, { storage, win: null, rest, bridge: createBridge({ win: null }) });
    await app.ready;
    const text = () => (root.textContent ?? '').replace(/\s+/g, ' ');
    expect(app.router?.current()).toBe('arcade');
    expect(text()).not.toContain('Сегодня в рейтинг');
    open();
    await tick();
    await tick();
    expect(text()).toContain('Сегодня в рейтинг: 0 / 3 000');
  });
});

describe('questCompletedPayload', () => {
  it('незавершённый квест или квест без кода → null (нечего слать платформе)', () => {
    const s = createInitialState(1_700_000_000_000, 'sess');
    expect(questCompletedPayload(s)).toBeNull();
    const noCode = { ...s, quest: { ...s.quest, isCompleted: true, completedAt: 1_700_000_000_000, verificationCode: null } };
    expect(questCompletedPayload(noCode)).toBeNull();
    const noDate = { ...s, quest: { ...s.quest, isCompleted: true, completedAt: null, verificationCode: 'EZ-AB2C' } };
    expect(questCompletedPayload(noDate)).toBeNull();
    const done = { ...s, quest: { ...s.quest, isCompleted: true, completedAt: 1_700_000_000_000, verificationCode: 'EZ-AB2C', totalCoinsEarned: 61 } };
    expect(questCompletedPayload(done)).toMatchObject({ coinsEarned: 61, maxCoins: 150, verificationCode: 'EZ-AB2C', completedAt: new Date(1_700_000_000_000).toISOString() });
    expect(questCompletedPayload(done)!.puzzles.map((p) => p.id)).toEqual(['var_types', 'var_assign', 'if_fridge', 'and_kettle', 'for_shelf', 'while_pc', 'fn_play', 'fn_mission']);
  });

  it('старое прохождение (максимум 75): maxCoins из состояния, комнаты на месте, puzzles пусто', () => {
    const s = createInitialState(1_700_000_000_000, 'sess');
    const legacy = { ...s, quest: { ...s.quest, isCompleted: true, completedAt: 1, verificationCode: 'EZ-AB2C', totalCoinsEarned: 72, maxPossibleCoins: 75 as const } };
    const p = questCompletedPayload(legacy)!;
    expect(p).toMatchObject({ coinsEarned: 72, maxCoins: 75, puzzles: [] });
    expect(p.rooms).toHaveLength(4);
  });
});

describe('ctx.onGameOver — ошибки отправки забега', () => {
  const run: RunResult = { runId: '0b7f3a52-4c1e-4a8e-9d2b-6f1c3e5a7b90', score: 900, durationSeconds: 40, jumpsCount: 55, seed: 7, heightPx: 9000, isNewRecord: false };

  it('NetworkError → «ждёт интернета» (queued), без console.error', async () => {
    const t = mount({});
    await t.app.ready;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    t.app.leaderboard.submitRun = async () => { throw new NetworkError('offline'); };
    t.last()!.ctx.onGameOver(run);
    await expect(t.last()!.ctx.lastRun!.submit).resolves.toEqual({ kind: 'queued' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('любая другая ошибка → console.error и исход, отличимый от офлайна', async () => {
    const t = mount({});
    await t.app.ready;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bug = new TypeError('x is undefined');
    t.app.leaderboard.submitRun = async () => { throw bug; };
    t.last()!.ctx.onGameOver(run);
    const o = await t.last()!.ctx.lastRun!.submit;
    expect(o.kind).toBe('error');
    expect(spy).toHaveBeenCalledWith(expect.anything(), bug);
    expect(outcomeText(o, run)).not.toBe(outcomeText({ kind: 'queued' }, run));
    spy.mockRestore();
  });
});
