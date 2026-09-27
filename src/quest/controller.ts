// Ход квеста поверх store: 8 загадок (по 2 на комнату, любой порядок внутри комнаты), попытки,
// подсказки, монеты, строгий порядок комнат и однократное атомарное завершение. Без DOM.
import type { Store } from '../core/state';
import { PUZZLES_BY_ROOM, PUZZLE_IDS, roomOfPuzzle, type EasyQuestGameState, type HintsUsed, type PuzzleId, type RoomIndex } from '../core/types';
import { generateVerificationCode, rewardFor, validatePlayerName, type PlayerNameResult } from '../core/rules';
import { PUZZLES } from './puzzles';

export type SubmitRejection = 'LOCKED' | 'NOT_CURRENT' | 'ALREADY_SOLVED' | 'INCOMPLETE';

export interface SubmitResult {
  correct: boolean;
  /** Монеты за загадку (только при верном ответе). */
  reward?: number;
  /** Код ошибки загадки (`QUOTED_NUMBER`, …) или `INCOMPLETE`. */
  mistake?: string;
  /** Дружелюбное объяснение ошибки. */
  message?: string;
  /** Ответ не принят к проверке и попыткой не считается. */
  rejected?: SubmitRejection;
}

export interface QuestControllerOptions {
  /** Вызывается один раз — сразу после атомарного завершения (решена последняя из 8 загадок). */
  onCompleted?(state: EasyQuestGameState): void;
  now?(): number;
  /** Источник случайности для кода EZ-XXXX (по умолчанию — crypto). */
  randomFn?(): number;
}

export interface QuestController {
  submit(puzzleId: PuzzleId, answer: unknown): SubmitResult;
  /** Открывает следующую подсказку загадки (1, затем 2) и возвращает её текст; нельзя — null. */
  useHint(puzzleId: PuzzleId): string | null;
  canUseHint(puzzleId: PuzzleId, level: 1 | 2): boolean;
  /** Обе загадки комнаты решены. */
  isRoomCleared(room: RoomIndex): boolean;
  /** Переход в следующую комнату — только если обе загадки текущей решены. */
  advance(): boolean;
  startQuest(playerName: string): StartQuestResult;
  /** «Сейчас за верный ответ»; для решённой загадки — фактически заработанное. */
  currentReward(puzzleId: PuzzleId): number;
}

export type StartQuestResult = PlayerNameResult | { ok: false; error: 'LOCKED'; message: string };

const ROOMS: RoomIndex[] = [1, 2, 3, 4];

const cleared = (s: EasyQuestGameState, room: RoomIndex): boolean => PUZZLES_BY_ROOM[room].every((pid) => s.quest.puzzles[pid].isSolved);

/** Пересчитывает итог комнаты (суммы двух загадок) и общий баланс. */
function syncTotals(d: EasyQuestGameState, room: RoomIndex): void {
  const ps = PUZZLES_BY_ROOM[room].map((pid) => d.quest.puzzles[pid]);
  const r = d.quest.rooms[room];
  r.earnedCoins = ps.reduce((sum, p) => sum + p.earnedCoins, 0);
  r.attempts = ps.reduce((sum, p) => sum + p.attempts, 0);
  r.hintsUsed = ps.reduce((sum, p) => sum + p.hintsUsed, 0);
  r.isSolved = ps.every((p) => p.isSolved);
  d.quest.totalCoinsEarned = PUZZLE_IDS.reduce((sum, pid) => sum + d.quest.puzzles[pid].earnedCoins, 0);
}

export function createQuestController(store: Store, opts: QuestControllerOptions = {}): QuestController {
  const now = opts.now ?? (() => Date.now());
  const locked = (): boolean => store.get().quest.isCompleted;

  /** Загадка доступна: её комната текущая, все предыдущие очищены (подмену индекса не пропускаем), сама не решена. */
  const isPlayable = (s: EasyQuestGameState, pid: PuzzleId): boolean => {
    const room = roomOfPuzzle(pid);
    return (
      room !== null &&
      s.navigation.currentRoomIndex === room &&
      !s.quest.puzzles[pid].isSolved &&
      ROOMS.filter((r) => r < room).every((r) => cleared(s, r))
    );
  };

  const canUseHint = (pid: PuzzleId, level: 1 | 2): boolean => {
    const s = store.get();
    if (locked() || !isPlayable(s, pid)) return false;
    const p = s.quest.puzzles[pid];
    return level === 1 ? p.hintsUsed === 0 && p.attempts >= 1 : p.hintsUsed === 1;
  };

  return {
    submit(pid, answer) {
      if (locked()) return { correct: false, rejected: 'LOCKED' };
      const s0 = store.get();
      const room = roomOfPuzzle(pid);
      if (room === null) return { correct: false, rejected: 'NOT_CURRENT' };
      if (s0.quest.puzzles[pid].isSolved) return { correct: false, rejected: 'ALREADY_SOLVED' };
      if (!isPlayable(s0, pid)) return { correct: false, rejected: 'NOT_CURRENT' };

      const verdict = PUZZLES[pid].check(answer);
      if (!verdict.correct && verdict.mistake === 'INCOMPLETE')
        return { correct: false, mistake: 'INCOMPLETE', message: verdict.message, rejected: 'INCOMPLETE' };

      // Попытка — в сохранение до того, как экран покажет результат.
      store.update((d) => {
        d.quest.puzzles[pid].attempts += 1;
        syncTotals(d, room);
      });
      if (!verdict.correct) return { correct: false, mistake: verdict.mistake, message: verdict.message };

      const p = store.get().quest.puzzles[pid];
      const reward = rewardFor(pid, p.attempts, p.hintsUsed);
      let completed = false;
      store.update((d) => {
        d.quest.puzzles[pid].isSolved = true;
        d.quest.puzzles[pid].earnedCoins = reward;
        syncTotals(d, room);
        if (PUZZLE_IDS.every((id) => d.quest.puzzles[id].isSolved) && !d.quest.isCompleted) {
          d.quest.isCompleted = true;
          d.quest.completedAt = now();
          d.quest.verificationCode = d.quest.verificationCode ?? generateVerificationCode(opts.randomFn);
          d.arcade.isUnlocked = true;
          completed = true;
        }
      });
      if (completed) opts.onCompleted?.(store.get());
      return { correct: true, reward };
    },

    useHint(pid) {
      const room = roomOfPuzzle(pid);
      if (room === null) return null;
      const used = store.get().quest.puzzles[pid].hintsUsed;
      if (used >= 2) return null;
      const level = (used + 1) as 1 | 2;
      if (!canUseHint(pid, level)) return null;
      store.update((d) => {
        d.quest.puzzles[pid].hintsUsed = level as HintsUsed;
        syncTotals(d, room);
      });
      return PUZZLES[pid].hints[level - 1];
    },

    canUseHint,

    isRoomCleared: (room) => cleared(store.get(), room),

    advance() {
      const s = store.get();
      const cur = s.navigation.currentRoomIndex;
      if (locked() || cur >= 4 || !ROOMS.filter((r) => r <= cur).every((r) => cleared(s, r))) return false;
      store.update((d) => {
        d.navigation.currentRoomIndex = (cur + 1) as RoomIndex;
      });
      return true;
    },

    startQuest(playerName) {
      if (locked()) return { ok: false, error: 'LOCKED', message: 'Квест уже пройден' };
      const res = validatePlayerName(playerName);
      if (res.ok) {
        store.update((d) => {
          d.leaderboard.playerName = res.value;
          d.navigation.currentScreen = 'quest';
        });
      }
      return res;
    },

    currentReward(pid) {
      const p = store.get().quest.puzzles[pid];
      if (!p) return 0;
      if (p.isSolved) return p.earnedCoins;
      return rewardFor(pid, p.attempts + 1, p.hintsUsed);
    },
  };
}
