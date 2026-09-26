// Ход квеста поверх store: попытки, подсказки, монеты, строгий порядок комнат и
// однократное атомарное завершение. Без DOM.
import type { Store } from '../core/state';
import type { EasyQuestGameState, HintsUsed, RoomIndex } from '../core/types';
import { generateVerificationCode, rewardFor, validatePlayerName, type PlayerNameResult } from '../core/rules';
import { PUZZLES } from './puzzles';

export type SubmitRejection = 'LOCKED' | 'NOT_CURRENT' | 'ALREADY_SOLVED' | 'INCOMPLETE';

export interface SubmitResult {
  correct: boolean;
  /** Монеты за комнату (только при верном ответе). */
  reward?: number;
  /** Код ошибки загадки (`QUOTED_NUMBER`, …) или `INCOMPLETE`. */
  mistake?: string;
  /** Дружелюбное объяснение ошибки. */
  message?: string;
  /** Ответ не принят к проверке и попыткой не считается. */
  rejected?: SubmitRejection;
}

export interface QuestControllerOptions {
  /** Вызывается один раз — сразу после атомарного завершения (решена 4-я загадка). */
  onCompleted?(state: EasyQuestGameState): void;
  now?(): number;
  /** Источник случайности для кода EZ-XXXX (по умолчанию — crypto). */
  randomFn?(): number;
}

export interface QuestController {
  submit(room: RoomIndex, answer: unknown): SubmitResult;
  /** Открывает следующую подсказку (1, затем 2) и возвращает её текст; нельзя — null. */
  useHint(room: RoomIndex): string | null;
  canUseHint(room: RoomIndex, level: 1 | 2): boolean;
  /** Переход в следующую комнату — только если текущая решена. */
  advance(): boolean;
  startQuest(playerName: string): StartQuestResult;
  /** «Сейчас за верный ответ»; для решённой комнаты — фактически заработанное. */
  currentReward(room: RoomIndex): number;
}

export type StartQuestResult = PlayerNameResult | { ok: false; error: 'LOCKED'; message: string };

const ROOMS: RoomIndex[] = [1, 2, 3, 4];

export function createQuestController(store: Store, opts: QuestControllerOptions = {}): QuestController {
  const now = opts.now ?? (() => Date.now());
  const locked = (): boolean => store.get().quest.isCompleted;

  /** Комната доступна: она текущая, не решена, и все предыдущие решены (подмену индекса не пропускаем). */
  const isPlayable = (s: EasyQuestGameState, room: RoomIndex): boolean =>
    s.navigation.currentRoomIndex === room &&
    !s.quest.rooms[room].isSolved &&
    ROOMS.filter((r) => r < room).every((r) => s.quest.rooms[r].isSolved);

  const canUseHint = (room: RoomIndex, level: 1 | 2): boolean => {
    const s = store.get();
    if (locked() || !isPlayable(s, room)) return false;
    const r = s.quest.rooms[room];
    return level === 1 ? r.hintsUsed === 0 && r.attempts >= 1 : r.hintsUsed === 1;
  };

  return {
    submit(room, answer) {
      if (locked()) return { correct: false, rejected: 'LOCKED' };
      const s0 = store.get();
      if (s0.quest.rooms[room]?.isSolved) return { correct: false, rejected: 'ALREADY_SOLVED' };
      if (!isPlayable(s0, room)) return { correct: false, rejected: 'NOT_CURRENT' };

      const verdict = PUZZLES[room].check(answer);
      if (!verdict.correct && verdict.mistake === 'INCOMPLETE')
        return { correct: false, mistake: 'INCOMPLETE', message: verdict.message, rejected: 'INCOMPLETE' };

      // Попытка — в сохранение до того, как экран покажет результат.
      store.update((d) => {
        d.quest.rooms[room].attempts += 1;
      });
      if (!verdict.correct) return { correct: false, mistake: verdict.mistake, message: verdict.message };

      const r = store.get().quest.rooms[room];
      const reward = rewardFor(room, r.attempts, r.hintsUsed);
      let completed = false;
      store.update((d) => {
        d.quest.rooms[room].isSolved = true;
        d.quest.rooms[room].earnedCoins = reward;
        d.quest.totalCoinsEarned = ROOMS.reduce((sum, n) => sum + d.quest.rooms[n].earnedCoins, 0);
        if (room === 4 && ROOMS.every((n) => d.quest.rooms[n].isSolved) && !d.quest.isCompleted) {
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

    useHint(room) {
      const used = store.get().quest.rooms[room].hintsUsed;
      if (used >= 2) return null;
      const level = (used + 1) as 1 | 2;
      if (!canUseHint(room, level)) return null;
      store.update((d) => {
        d.quest.rooms[room].hintsUsed = level as HintsUsed;
      });
      return PUZZLES[room].hints[level - 1];
    },

    canUseHint,

    advance() {
      const s = store.get();
      const cur = s.navigation.currentRoomIndex;
      if (locked() || cur >= 4 || !s.quest.rooms[cur].isSolved) return false;
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

    currentReward(room) {
      const r = store.get().quest.rooms[room];
      if (r.isSolved) return r.earnedCoins;
      return rewardFor(room, r.attempts + 1, r.hintsUsed);
    },
  };
}
