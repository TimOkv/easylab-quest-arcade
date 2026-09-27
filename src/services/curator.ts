// Реестр куратора: регистрация прохождения (RPC register_quest_completion), повторы с backoff,
// перевыпуск кода при CODE_TAKEN, восстановление по student_id (G03).
import { PUZZLE_IDS, type CuratorSync, type RoomIndex } from '../core/types';
import type { Store } from '../core/state';
import { generateVerificationCode, isValidVerificationCode, maxCoinsFromServer } from '../core/rules';
import { NetworkError, RpcError, type RestClient } from './rest';

export interface CuratorSyncOptions {
  /** Код сменился (перевыпуск при CODE_TAKEN или серверная запись при restored) — UI показывает тост «Код обновлён». */
  onCodeChanged?: (code: string) => void;
  /** Источник события `online` (по умолчанию window). */
  win?: EventTarget | null;
  /** Генератор для перевыпуска кода (по умолчанию crypto). */
  random?: () => number;
}

interface RegisterResponse {
  verification_code: string;
  coins_earned: number;
  completed_at: string;
  restored: boolean;
  player_name?: string;
  /** Максимум, из которого считались монеты (75 — старый квест, 150 — новый); у старого сервера нет. */
  coins_max?: number;
}

interface RestoreResponse {
  verification_code: string;
  coins_earned: number;
  player_name: string;
  completed_at: string;
  coins_max?: number;
}

export const MAX_CODE_REISSUES = 5;
export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS = 5 * 60_000;

const ROOMS: readonly RoomIndex[] = [1, 2, 3, 4];
/** Отказы, которые повтор с теми же данными не исправит: ждём смены ника/монет. BAD_COINS — сервер ещё не знает про 150. */
const FATAL = new Set(['BAD_NAME', 'BAD_COINS']);

export function createCuratorSync(rest: RestClient, store: Store, opts: CuratorSyncOptions = {}): CuratorSync {
  const isConfigured = rest.isConfigured;
  let inFlight: Promise<'synced' | 'pending' | 'demo'> | null = null;
  /** Данные, которые сервер отверг безнадёжно; с ними RPC не повторяем. */
  let rejectedKey: string | null = null;
  const keyOf = (): string => {
    const s = store.get();
    return JSON.stringify([s.quest.verificationCode, s.leaderboard.playerName, s.quest.totalCoinsEarned, s.meta.platformStudentId]);
  };

  const setCode = (code: string): void => {
    if (store.get().quest.verificationCode === code) return;
    store.update((d) => { d.quest.verificationCode = code; });
    opts.onCodeChanged?.(code);
  };

  const fail = (error: string): 'pending' => {
    store.update((d) => {
      d.quest.syncAttempts += 1;
      d.quest.lastSyncError = error;
    });
    return 'pending';
  };

  async function run(): Promise<'synced' | 'pending' | 'demo'> {
    if (!isConfigured) return 'demo';
    for (let reissues = 0; ; reissues++) {
      const s = store.get();
      const q = s.quest;
      if (q.isSyncedWithCurator) return 'synced';
      if (!q.isCompleted || !q.verificationCode) return 'pending';
      if (rejectedKey === keyOf()) return 'pending';
      try {
        const r = await rest.rpc<RegisterResponse>('register_quest_completion', {
          p_code: q.verificationCode,
          p_player_name: s.leaderboard.playerName,
          p_student_id: s.meta.platformStudentId,
          p_coins: q.totalCoinsEarned,
          p_completed_at: new Date(q.completedAt ?? Date.now()).toISOString(),
        });
        // Сервер может выдать другой код: запись этого ученика (restored) или замена занятого кода.
        // Код и серверное прохождение пишутся одним update, и только потом onCodeChanged — иначе повторное
        // EASYLAB_QUEST_COMPLETED ушло бы с новым кодом, но с локальными монетами и загадками.
        const prevCode = q.verificationCode;
        const code = r?.verification_code && isValidVerificationCode(r.verification_code) ? r.verification_code : null;
        store.update((d) => {
          if (code) d.quest.verificationCode = code;
          if (r?.restored) {
            // Серверное прохождение вместо локального: локальные записи по загадкам к этим монетам не относятся.
            d.quest.totalCoinsEarned = r.coins_earned;
            d.quest.maxPossibleCoins = maxCoinsFromServer(r.coins_max, r.coins_earned);
            d.quest.isRestored = true;
            const at = Date.parse(r.completed_at);
            if (Number.isFinite(at)) d.quest.completedAt = at;
          }
          d.quest.isSyncedWithCurator = true;
          d.quest.syncAttempts += 1;
          d.quest.lastSyncError = null;
        });
        if (code && code !== prevCode) opts.onCodeChanged?.(code);
        return 'synced';
      } catch (e) {
        if (e instanceof RpcError && e.code === 'CODE_TAKEN' && reissues < MAX_CODE_REISSUES) {
          let next = generateVerificationCode(opts.random);
          while (next === q.verificationCode) next = generateVerificationCode(opts.random);
          setCode(next);
          continue;
        }
        if (e instanceof RpcError && FATAL.has(e.code)) rejectedKey = keyOf();
        return fail(e instanceof RpcError ? e.code : e instanceof NetworkError ? 'NETWORK' : 'UNKNOWN');
      }
    }
  }

  function syncNow(): Promise<'synced' | 'pending' | 'demo'> {
    if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function restoreByStudent(studentId: string): Promise<boolean> {
    const id = (studentId ?? '').trim();
    if (!isConfigured || !id || store.get().quest.isCompleted) return false;
    let r: RestoreResponse | null;
    try {
      r = await rest.rpc<RestoreResponse | null>('restore_by_student', { p_student_id: id });
    } catch {
      return false;
    }
    if (!r || !r.verification_code || store.get().quest.isCompleted) return false;
    const at = Date.parse(r.completed_at);
    store.update((d) => {
      d.meta.platformStudentId = id;
      d.quest.isCompleted = true;
      d.quest.completedAt = Number.isFinite(at) ? at : Date.now();
      d.quest.verificationCode = r.verification_code;
      d.quest.totalCoinsEarned = r.coins_earned;
      d.quest.maxPossibleCoins = maxCoinsFromServer(r.coins_max, r.coins_earned);
      d.quest.isRestored = true;
      d.quest.isSyncedWithCurator = true;
      d.quest.lastSyncError = null;
      for (const i of ROOMS) d.quest.rooms[i].isSolved = true;
      for (const pid of PUZZLE_IDS) d.quest.puzzles[pid].isSolved = true;
      d.arcade.isUnlocked = true;
      if (r.player_name) d.leaderboard.playerName = r.player_name;
      d.navigation.currentScreen = 'arcade';
    });
    return true;
  }

  function startRetryLoop(): () => void {
    const win = opts.win !== undefined ? opts.win : typeof window !== 'undefined' ? window : null;
    let delay = RETRY_BASE_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const schedule = (ms: number): void => {
      if (timer) clearTimeout(timer);
      timer = stopped ? null : setTimeout(attempt, ms);
    };
    const attempt = async (): Promise<void> => {
      timer = null;
      if (stopped) return;
      const q = store.get().quest;
      if (q.isSyncedWithCurator) return;
      if (!q.isCompleted) return schedule(RETRY_BASE_MS); // ждём финиша (подписка ниже ускорит)
      const res = await syncNow();
      if (stopped || res !== 'pending') return;
      schedule(delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    };
    const onOnline = (): void => {
      delay = RETRY_BASE_MS;
      schedule(0);
    };
    const off = store.subscribe((s, prev) => {
      if (s.quest.isSyncedWithCurator || !s.quest.isCompleted) return;
      // финиш квеста или смена ника после безнадёжного отказа — пробуем сразу
      if (!prev.quest.isCompleted || (rejectedKey && s.leaderboard.playerName !== prev.leaderboard.playerName)) onOnline();
    });

    if (isConfigured) {
      win?.addEventListener('online', onOnline);
      schedule(0);
    }
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      win?.removeEventListener('online', onOnline);
      off();
    };
  }

  return { isConfigured, syncNow, restoreByStudent, startRetryLoop };
}
