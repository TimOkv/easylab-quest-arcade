// Рейтинг аркады: отправка забегов через RPC submit_arcade_score с офлайн-очередью
// (localStorage['ezq_pending_scores_v1']), клиентский античит, чтение ТОП-10, позиции и сезона.
import type {
  CuratorSync, KeyValueStorage, LeaderboardService, PublicRow, RejectReason, RunResult,
  SeasonInfo, Standing, SubmitOutcome,
} from '../core/types';
import { newUuid, type Store } from '../core/state';
import { isRunPlausible, isValidVerificationCode } from '../core/rules';
import { RpcError, type RestClient } from './rest';

export const PENDING_KEY = 'ezq_pending_scores_v1';
export const MAX_PENDING = 50;
export const TOP_QUERY = 'leaderboard?order=score.desc,created_at.asc&limit=10';
export const FLUSH_INTERVAL_MS = 30_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/** Отказы, после которых забег удаляется из очереди (повтор ничего не изменит). */
const FINAL: ReadonlySet<string> = new Set<RejectReason>(['CHEAT_SPEED', 'TOO_SHORT', 'SCORE_RANGE', 'NO_QUEST', 'BAD_CODE', 'RATE_LIMIT']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LeaderboardServiceOptions {
  /** Источник события `online` (по умолчанию window). */
  win?: EventTarget | null;
  /** Если квест ещё не в реестре куратора — сначала регистрируем (иначе сервер ответит NO_QUEST). */
  curator?: Pick<CuratorSync, 'syncNow'>;
  now?: () => number;
}

export type LeaderboardServiceHandle = LeaderboardService & {
  /** Отправка очереди при `online` и каждые 30 с (с backoff записей); возвращает stop. */
  startRetryLoop(): () => void;
};

interface PendingRun {
  runId: string; // uuid, уходит на сервер как p_run_id
  sourceId: string; // RunResult.runId — для дедупликации и arcade.lastRun
  score: number;
  timeSpent: number;
  jumps: number;
  sessionId: string;
  queuedAt: number;
  attempts: number;
  nextAt: number;
  blockedName?: string; // BAD_NAME: ждём смены ника
}

interface ServerStanding {
  counted?: number;
  season_total: number;
  today_counted: number;
  daily_limit: number;
  rank: number | null;
  gap_to_top10: number | null;
  is_hidden: boolean;
  season_closed?: boolean;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || d);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

function toStanding(r: ServerStanding): Standing {
  return {
    rank: numOrNull(r.rank),
    seasonTotal: num(r.season_total),
    gapToTop10: numOrNull(r.gap_to_top10),
    todayCounted: num(r.today_counted),
    dailyLimit: num(r.daily_limit, 3000),
    isHidden: !!r.is_hidden,
  };
}

function isPending(v: unknown): v is PendingRun {
  const o = v as PendingRun;
  return !!o && typeof o.runId === 'string' && typeof o.sourceId === 'string' && Number.isFinite(o.score)
    && Number.isFinite(o.timeSpent) && Number.isFinite(o.nextAt) && Number.isFinite(o.attempts);
}

export function createLeaderboardService(
  rest: RestClient,
  store: Store,
  storage: KeyValueStorage | null,
  opts: LeaderboardServiceOptions = {},
): LeaderboardServiceHandle {
  const isConfigured = rest.isConfigured;
  const now = opts.now ?? (() => Date.now());
  let mem: PendingRun[] = [];

  // ------------------------------------------------------------ очередь
  const load = (): PendingRun[] => {
    try {
      const raw = storage?.getItem(PENDING_KEY);
      if (raw == null) return mem;
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(isPending) : [];
    } catch {
      return mem;
    }
  };
  const save = (q: PendingRun[]): void => {
    mem = q.slice(-MAX_PENDING);
    try {
      if (mem.length) storage?.setItem(PENDING_KEY, JSON.stringify(mem));
      else storage?.removeItem(PENDING_KEY);
    } catch {
      /* storage недоступен — очередь живёт в памяти вкладки */
    }
  };
  const mutate = (fn: (q: PendingRun[]) => PendingRun[]): void => save(fn(load()));
  const remove = (id: string): void => mutate((q) => q.filter((x) => x.runId !== id));
  const patch = (id: string, p: Partial<PendingRun>): void =>
    mutate((q) => q.map((x) => (x.runId === id ? { ...x, ...p } : x)));

  // ------------------------------------------------------------ store
  const applyStanding = (st: Standing): void =>
    store.update((d) => {
      const lb = d.leaderboard;
      lb.currentRank = st.rank;
      lb.isTop3Winner = st.rank !== null && st.rank <= 3;
      lb.seasonTotal = st.seasonTotal;
      lb.todayCounted = st.todayCounted;
      lb.dailyLimit = st.dailyLimit;
      lb.isHidden = st.isHidden;
    });

  // ------------------------------------------------------------ отправка
  async function sendOne(item: PendingRun, name: string): Promise<SubmitOutcome | 'retry'> {
    const s = store.get();
    try {
      const r = await rest.rpc<ServerStanding>('submit_arcade_score', {
        p_run_id: item.runId,
        p_code: s.quest.verificationCode,
        p_session_id: item.sessionId,
        p_student_id: s.meta.platformStudentId,
        p_player_name: name,
        p_score: item.score,
        p_time_spent: item.timeSpent,
        p_jumps: item.jumps,
      });
      remove(item.runId);
      const st = toStanding(r);
      applyStanding(st);
      const counted = num(r.counted);
      store.update((d) => {
        d.leaderboard.hasSubmittedScore = true;
        d.leaderboard.lastSubmittedScore = item.score;
        if (d.arcade.lastRun?.runId === item.sourceId) d.arcade.lastRun.countedScore = counted;
      });
      return { kind: 'counted', counted, ...st, seasonClosed: !!r.season_closed };
    } catch (e) {
      if (e instanceof RpcError && FINAL.has(e.code)) {
        remove(item.runId);
        return { kind: 'rejected', reason: e.code as RejectReason };
      }
      if (e instanceof RpcError && e.code === 'BAD_NAME') {
        patch(item.runId, { blockedName: name });
        return { kind: 'rejected', reason: 'BAD_NAME' };
      }
      const attempts = item.attempts + 1;
      patch(item.runId, { attempts, nextAt: now() + Math.min(FLUSH_INTERVAL_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS) });
      return 'retry'; // сеть, таймаут, 5xx или незнакомая ошибка сервера — повторим позже
    }
  }

  async function doFlush(force: boolean): Promise<Map<string, SubmitOutcome>> {
    const out = new Map<string, SubmitOutcome>();
    if (!isConfigured || !load().length) return out;
    if (!store.get().quest.isSyncedWithCurator && opts.curator) {
      try { await opts.curator.syncNow(); } catch { /* повторим позже */ }
    }
    const s = store.get();
    if (!s.quest.isSyncedWithCurator || !s.quest.isCompleted) return out;
    const name = s.leaderboard.playerName;
    let online = false;
    for (const item of load()) {
      if (item.blockedName !== undefined && item.blockedName === name) continue;
      if (!force && !online && item.nextAt > now()) continue;
      const res = await sendOne(item, name);
      if (res === 'retry') break;
      out.set(item.runId, res);
      online = true; // сервер отвечает — остальное шлём, не дожидаясь backoff
    }
    return out;
  }

  let chain: Promise<unknown> = Promise.resolve();
  const flush = (force: boolean): Promise<Map<string, SubmitOutcome>> => {
    const p = chain.then(() => doFlush(force));
    chain = p.catch(() => undefined);
    return p;
  };

  async function submitRun(r: RunResult): Promise<SubmitOutcome> {
    if (!isConfigured) return { kind: 'demo' };
    const s = store.get();
    if (!s.quest.isCompleted) return { kind: 'rejected', reason: 'NO_QUEST' };
    if (!isValidVerificationCode(s.quest.verificationCode)) return { kind: 'rejected', reason: 'BAD_CODE' };
    const timeSpent = Math.floor(num(r.durationSeconds));
    const check = isRunPlausible({ score: r.score, timeSpentSeconds: timeSpent });
    if (!check.ok) return { kind: 'rejected', reason: check.reason };

    let item = load().find((x) => x.sourceId === r.runId);
    if (!item) {
      item = {
        runId: UUID_RE.test(r.runId) ? r.runId : newUuid(),
        sourceId: r.runId,
        score: Math.round(r.score),
        timeSpent,
        jumps: Math.max(0, Math.round(num(r.jumpsCount))),
        sessionId: s.meta.sessionId,
        queuedAt: now(),
        attempts: 0,
        nextAt: 0,
      };
      const fresh = item;
      mutate((q) => [...q, fresh]);
    }
    const results = await flush(true);
    return results.get(item.runId) ?? { kind: 'queued' };
  }

  // ------------------------------------------------------------ чтение
  async function fetchTop(): Promise<PublicRow[]> {
    if (!isConfigured) return [];
    const raw = await rest.select<Array<Record<string, unknown>>>(TOP_QUERY);
    const rows: PublicRow[] = (Array.isArray(raw) ? raw : []).map((x) => ({
      playerName: String(x.player_name ?? ''),
      score: num(x.score),
      createdAt: String(x.created_at ?? ''),
      runsCount: num(x.runs_count),
    }));
    store.update((d) => { d.leaderboard.cachedTop = { rows, fetchedAt: now() }; });
    return rows;
  }

  async function fetchStanding(): Promise<Standing | null> {
    const code = store.get().quest.verificationCode;
    if (!isConfigured || !isValidVerificationCode(code)) return null;
    const r = await rest.rpc<ServerStanding | null>('get_my_standing', { p_code: code });
    if (!r) return null;
    const st = toStanding(r);
    applyStanding(st);
    return st;
  }

  async function fetchSeason(): Promise<SeasonInfo | null> {
    if (!isConfigured) return null;
    const r = await rest.rpc<{ title: string; ends_at: string | null; daily_limit: number; is_closed: boolean } | null>('get_season_info', {});
    if (!r) return null;
    const info: SeasonInfo = { title: String(r.title ?? ''), endsAt: r.ends_at ?? null, dailyLimit: num(r.daily_limit, 3000), isClosed: !!r.is_closed };
    store.update((d) => { d.leaderboard.dailyLimit = info.dailyLimit; });
    return info;
  }

  function startRetryLoop(): () => void {
    if (!isConfigured) return () => {};
    const win = opts.win !== undefined ? opts.win : typeof window !== 'undefined' ? window : null;
    const onOnline = (): void => void flush(true).catch(() => undefined);
    const timer = setInterval(() => void flush(false).catch(() => undefined), FLUSH_INTERVAL_MS);
    win?.addEventListener('online', onOnline);
    void flush(false).catch(() => undefined);
    return () => {
      clearInterval(timer);
      win?.removeEventListener('online', onOnline);
    };
  }

  return {
    isConfigured,
    fetchTop,
    fetchStanding,
    fetchSeason,
    submitRun,
    flushQueue: async () => { await flush(true); },
    pendingCount: () => load().length,
    startRetryLoop,
  };
}
