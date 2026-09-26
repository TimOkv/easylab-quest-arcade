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
  | { kind: 'demo' }; // сервер не настроен

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

export interface RoomState<Id extends string, Title extends string, Max extends number> {
  id: Id;
  title: Title;
  maxReward: Max;
  earnedCoins: number;
  isSolved: boolean;
  attempts: number;
  hintsUsed: HintsUsed; // §2
}

export interface QuestRooms {
  1: RoomState<'room_variables', 'Рабочее место', 10>;
  2: RoomState<'room_conditions', 'Умный шкаф / Робот', 15>;
  3: RoomState<'room_loops', 'Библиотека знаний', 20>;
  4: RoomState<'room_functions', 'Командный центр маскота', 30>;
}

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
  };
  quest: {
    totalCoinsEarned: number;
    maxPossibleCoins: 75;
    isCompleted: boolean;
    completedAt: number | null;
    verificationCode: string | null;
    isSyncedWithCurator: boolean;
    syncAttempts: number; // §2
    lastSyncError: string | null; // §2
    rooms: QuestRooms;
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
