// Общие типы проекта. Фиксируются таском 01; дальше только расширяются (не меняются).

export type RoomIndex = 1 | 2 | 3 | 4;
export type ScreenName = 'quest' | 'arcade' | 'leaderboard';
export type Theme = 'light' | 'dark';

export interface RunResult {
  runId: string;
  score: number;
  durationSeconds: number;
  jumpsCount: number;
  seed: number;
  heightPx: number;
  isNewRecord: boolean;
}

export type RejectReason =
  | 'CHEAT_SPEED'
  | 'TOO_SHORT'
  | 'NO_QUEST'
  | 'BAD_CODE'
  | 'BAD_NAME'
  | 'SCORE_RANGE'
  | 'RATE_LIMIT';

export type SubmitOutcome =
  | {
      kind: 'counted';
      counted: number;
      seasonTotal: number;
      todayCounted: number;
      dailyLimit: number;
      rank: number | null;
      gapToTop10: number | null;
      seasonClosed: boolean;
      isHidden: boolean;
    }
  | { kind: 'queued' } // сеть — лежит в pending_scores
  | { kind: 'rejected'; reason: RejectReason }
  | { kind: 'demo' } // сервер не настроен
  | { kind: 'error' }; // сбой клиента (не сеть) — забег не отправлен, ошибка в консоли

export interface PublicRow {
  playerName: string;
  score: number;
  createdAt: string;
  runsCount: number;
}

export interface Standing {
  rank: number | null;
  seasonTotal: number;
  gapToTop10: number | null;
  todayCounted: number;
  dailyLimit: number;
  isHidden: boolean;
}

export interface SeasonInfo {
  title: string;
  endsAt: string | null;
  dailyLimit: number;
  isClosed: boolean;
}

export interface LeaderboardService {
  isConfigured: boolean;
  fetchTop(): Promise<PublicRow[]>; // бросает NetworkError; кэш — в store.leaderboard.cachedTop
  fetchStanding(): Promise<Standing | null>;
  fetchSeason(): Promise<SeasonInfo | null>;
  submitRun(r: RunResult): Promise<SubmitOutcome>;
  flushQueue(): Promise<void>;
  pendingCount(): number;
}

export interface CuratorSync {
  isConfigured: boolean;
  syncNow(): Promise<'synced' | 'pending' | 'demo'>;
  restoreByStudent(studentId: string): Promise<boolean>;
  startRetryLoop(): () => void;
}

// ---------------------------------------------------------------------------
// Состояние: §4.1 CLAUDE.md + аддитивные поля «Решений §2».

export type HintsUsed = 0 | 1 | 2;

/** 8 загадок квеста: по 2 на комнату (спальня, кухня, библиотека, чердак). */
export type PuzzleId =
  | 'var_types' | 'var_assign' // комната 1, спальня: компьютер, шкаф
  | 'if_fridge' | 'and_kettle' // комната 2, кухня: холодильник, чайник
  | 'for_shelf' | 'while_pc' // комната 3, библиотека: стеллаж, старый компьютер
  | 'fn_play' | 'fn_mission'; // комната 4, чердак: проигрыватель, сундук (финал)

export const PUZZLES_BY_ROOM: Readonly<Record<RoomIndex, readonly [PuzzleId, PuzzleId]>> = {
  1: ['var_types', 'var_assign'],
  2: ['if_fridge', 'and_kettle'],
  3: ['for_shelf', 'while_pc'],
  4: ['fn_play', 'fn_mission'],
};

/** Все 8 загадок по порядку комнат. */
export const PUZZLE_IDS: readonly PuzzleId[] = ([1, 2, 3, 4] as const).flatMap((r) => PUZZLES_BY_ROOM[r]);

/** Комната загадки; для чужой строки — null. */
export function roomOfPuzzle(pid: unknown): RoomIndex | null {
  for (const r of [1, 2, 3, 4] as const) if ((PUZZLES_BY_ROOM[r] as readonly unknown[]).includes(pid)) return r;
  return null;
}

export interface PuzzleState {
  earnedCoins: number;
  isSolved: boolean;
  attempts: number;
  hintsUsed: HintsUsed;
}

/**
 * Итог комнаты (для совместимости: мост, триумф, старые сохранения). У квеста формата 2 —
 * суммы по двум загадкам комнаты; `isSolved` — обе решены.
 */
export interface RoomState {
  id: string;
  title: string;
  maxReward: number;
  earnedCoins: number;
  isSolved: boolean;
  attempts: number;
  hintsUsed: number; // §2; в формате 2 — сумма подсказок двух загадок
}

export type QuestRooms = Record<RoomIndex, RoomState>;

export interface LastRun {
  runId: string;
  score: number;
  durationSeconds: number;
  jumpsCount: number;
  timestamp: number;
  seed: number; // §2
  countedScore: number | null; // §2
}

export interface EasyQuestGameState {
  meta: {
    version: '1.0.0';
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    isEmbedded: boolean;
    platformStudentId: string | null;
    theme: Theme; // §2
  };
  navigation: {
    currentScreen: ScreenName;
    currentRoomIndex: RoomIndex;
    isAudioMuted: boolean;
    isMusicMuted: boolean;
  };
  quest: {
    totalCoinsEarned: number;
    /** 150 — квест из 8 загадок; 75 — прохождение старого квеста (остаётся из сохранения). */
    maxPossibleCoins: 75 | 150;
    /** Метка формата квеста (8 загадок). Сохранения без неё мигрируют при загрузке. */
    format: 2;
    isCompleted: boolean;
    completedAt: number | null;
    verificationCode: string | null;
    isSyncedWithCurator: boolean;
    syncAttempts: number; // §2
    lastSyncError: string | null; // §2
    rooms: QuestRooms;
    puzzles: Record<PuzzleId, PuzzleState>;
    /**
     * Прохождение взято с сервера (restore_by_student или ответ register с `restored: true`): монеты и код —
     * серверные, местной разбивки по комнатам и загадкам у него нет. Читать через `hasLocalBreakdown` / `hasPuzzleRecords` из `core/rules`. // §2
     */
    isRestored: boolean;
  };
  arcade: {
    isUnlocked: boolean;
    highScore: number;
    totalRunsPlayed: number;
    bestHeightPx: number; // §2
    lastRun: LastRun | null;
  };
  leaderboard: {
    playerName: string;
    hasSubmittedScore: boolean;
    lastSubmittedScore: number;
    currentRank: number | null;
    isTop3Winner: boolean;
    seasonTotal: number; // §2
    todayCounted: number; // §2
    dailyLimit: number; // §2
    isHidden: boolean; // §2
    cachedTop: { rows: PublicRow[]; fetchedAt: number } | null; // §2
  };
}

/** Минимальный интерфейс хранилища (подмножество Web Storage) — для тестов на фейке. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
