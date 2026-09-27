import { describe, it, expect } from 'vitest';
import {
  PUZZLE_REWARDS,
  MAX_TOTAL_COINS,
  roomMaxReward,
  rewardFor,
  generateVerificationCode,
  isValidVerificationCode,
  normalizeVerificationCode,
  validatePlayerName,
  isRunPlausible,
  MAX_POINTS_PER_SECOND,
  MIN_RUN_SECONDS,
  MAX_SCORE,
  LEGACY_MAX_COINS,
  isLegacyFormat,
  hasLocalBreakdown,
  hasPuzzleRecords,
  maxCoinsFromServer,
} from '../src/core/rules';
import type { PuzzleId } from '../src/core/types';

// Ожидания — таблица «Монеты» спецификации: пул загадки = прежний пул её комнаты.
const ALL: PuzzleId[] = ['var_types', 'var_assign', 'if_fridge', 'and_kettle', 'for_shelf', 'while_pc', 'fn_play', 'fn_mission'];

describe('rewardFor — монеты за загадку (таблица «Монеты»)', () => {
  it.each([
    ['var_types', [10, 7, 5]], ['var_assign', [10, 7, 5]],
    ['if_fridge', [15, 11, 8]], ['and_kettle', [15, 11, 8]],
    ['for_shelf', [20, 14, 10]], ['while_pc', [20, 14, 10]],
    ['fn_play', [30, 22, 15]], ['fn_mission', [30, 22, 15]],
  ] as const)('%s: 1-я / 2-я / 3-я попытка → %j', (pid, row) => {
    expect([1, 2, 3].map((a) => rewardFor(pid, a, 0))).toEqual(row);
    expect(PUZZLE_REWARDS[pid]).toEqual(row);
  });

  it('3+ попытка = третья колонка', () => {
    expect(rewardFor('var_assign', 7, 0)).toBe(5);
    expect(rewardFor('fn_play', 40, 0)).toBe(15);
  });

  it('первая подсказка не снижает награду сама по себе', () => {
    expect(rewardFor('and_kettle', 2, 1)).toBe(11);
  });

  it('вторая подсказка → 0 монет за эту загадку', () => {
    expect(rewardFor('var_types', 1, 2)).toBe(0);
    expect(rewardFor('fn_mission', 3, 2)).toBe(0);
  });

  it('никогда не меньше нуля; всё с первой попытки = 150', () => {
    for (const pid of ALL) for (let a = 0; a < 10; a++) for (const h of [0, 1, 2] as const) expect(rewardFor(pid, a, h)).toBeGreaterThanOrEqual(0);
    expect(ALL.reduce((sum, pid) => sum + rewardFor(pid, 1, 0), 0)).toBe(150);
    expect(MAX_TOTAL_COINS).toBe(150);
  });

  it('максимум комнаты = сумма пулов двух её загадок: 20 / 30 / 40 / 60', () => {
    expect([1, 2, 3, 4].map((r) => roomMaxReward(r as 1 | 2 | 3 | 4))).toEqual([20, 30, 40, 60]);
  });
});

describe('код EZ-XXXX', () => {
  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  it('генерирует EZ- и 4 символа только из алфавита без 0/O/1/I', () => {
    for (let i = 0; i < 300; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^EZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    }
  });

  it('детерминирован при заданном randomFn', () => {
    expect(generateVerificationCode(() => 0)).toBe('EZ-2222');
    expect(generateVerificationCode(() => 0.9999)).toBe('EZ-ZZZZ');
  });

  it('использует весь алфавит (криптослучайно)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const ch of generateVerificationCode().slice(3)) seen.add(ch);
    expect(seen.size).toBe(ALPHABET.length);
  });

  it('isValidVerificationCode', () => {
    expect(isValidVerificationCode('EZ-8492')).toBe(true);
    expect(isValidVerificationCode('EZ-AB3K')).toBe(true);
    expect(isValidVerificationCode('EZ-8402')).toBe(false); // 0
    expect(isValidVerificationCode('EZ-O1IK')).toBe(false);
    expect(isValidVerificationCode('ez-8492')).toBe(false);
    expect(isValidVerificationCode('EZ-84922')).toBe(false);
    expect(isValidVerificationCode(' EZ-8492')).toBe(false);
  });

  it('normalizeVerificationCode', () => {
    expect(normalizeVerificationCode('ez8492')).toBe('EZ-8492');
    expect(normalizeVerificationCode(' ez-8492 ')).toBe('EZ-8492');
    expect(normalizeVerificationCode('EZ 84 92')).toBe('EZ-8492');
    expect(normalizeVerificationCode('8492')).toBe('EZ-8492');
    expect(normalizeVerificationCode('ЕZ-ав3к')).toBe('EZ-AB3K'); // кириллица-двойники
    expect(normalizeVerificationCode('EZ-8402')).toBeNull();
    expect(normalizeVerificationCode('EZ-849')).toBeNull();
    expect(normalizeVerificationCode('')).toBeNull();
  });
});

describe('validatePlayerName', () => {
  it('принимает нормальные ники и триммит', () => {
    expect(validatePlayerName('  Тимофей  ')).toEqual({ ok: true, value: 'Тимофей' });
    expect(validatePlayerName('Max_2012')).toEqual({ ok: true, value: 'Max_2012' });
    expect(validatePlayerName('Ёжик-Ли.9')).toEqual({ ok: true, value: 'Ёжик-Ли.9' });
    expect(validatePlayerName('Аня К')).toEqual({ ok: true, value: 'Аня К' });
  });

  it('длина 2–16 после trim', () => {
    expect(validatePlayerName(' a ')).toMatchObject({ ok: false, error: 'TOO_SHORT' });
    expect(validatePlayerName('a'.repeat(17))).toMatchObject({ ok: false, error: 'TOO_LONG' });
    expect(validatePlayerName('a'.repeat(16)).ok).toBe(true);
  });

  it('запрещённые символы (XSS)', () => {
    expect(validatePlayerName('<script>')).toMatchObject({ ok: false, error: 'BAD_CHARS' });
    expect(validatePlayerName('Tom"&')).toMatchObject({ ok: false, error: 'BAD_CHARS' });
    expect(validatePlayerName('Ник😀')).toMatchObject({ ok: false, error: 'BAD_CHARS' });
  });

  it('ошибка содержит понятный текст', () => {
    const r = validatePlayerName('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(3);
  });

  it.each([
    'хуй', 'ХУЙ', 'х у й', 'х.у.й', 'xyй', 'нахуя', 'пиздец', 'Ёбарь', 'сука_2012', 'бляха',
    'Мудак', 'п1дор', 'fuck', 'F.u.c.k', 'FuCk_off', 'shit', 'b1tch', 'suka', 'pizdec', 'huy',
  ])('фильтр мата: «%s» отклоняется', (bad) => {
    expect(validatePlayerName(bad)).toMatchObject({ ok: false, error: 'PROFANITY' });
  });

  it.each(['Хлебушек', 'Оскар', 'Скорпион', 'Мандарин', 'Sasha', 'Classic', 'Небо', 'Потребитель', 'Пуховик'])(
    'без ложных срабатываний: «%s»',
    (good) => {
      expect(validatePlayerName(good).ok).toBe(true);
    },
  );
});

describe('isRunPlausible — клиентский античит', () => {
  it('константы', () => {
    expect(MAX_POINTS_PER_SECOND).toBe(120);
    expect(MIN_RUN_SECONDS).toBe(5);
    expect(MAX_SCORE).toBe(50000);
  });
  it('нормальный забег проходит, ровно 120 очков/с — допустимо', () => {
    expect(isRunPlausible({ score: 1200, timeSpentSeconds: 30 })).toEqual({ ok: true });
    expect(isRunPlausible({ score: 1200, timeSpentSeconds: 10 })).toEqual({ ok: true });
  });
  it('> 120 очков/с → CHEAT_SPEED', () => {
    expect(isRunPlausible({ score: 1201, timeSpentSeconds: 10 })).toEqual({ ok: false, reason: 'CHEAT_SPEED' });
  });
  it('< 5 с → TOO_SHORT', () => {
    expect(isRunPlausible({ score: 10, timeSpentSeconds: 4.9 })).toEqual({ ok: false, reason: 'TOO_SHORT' });
    expect(isRunPlausible({ score: 10, timeSpentSeconds: 5 }).ok).toBe(true);
  });
  it('> 50000 или отрицательный/нечисловой счёт → SCORE_RANGE', () => {
    expect(isRunPlausible({ score: 50001, timeSpentSeconds: 1000 })).toEqual({ ok: false, reason: 'SCORE_RANGE' });
    expect(isRunPlausible({ score: -1, timeSpentSeconds: 10 })).toEqual({ ok: false, reason: 'SCORE_RANGE' });
    expect(isRunPlausible({ score: Number.NaN, timeSpentSeconds: 10 })).toEqual({ ok: false, reason: 'SCORE_RANGE' });
  });
});

describe('формат на 75, восстановленное с сервера, максимум из ответа сервера', () => {
  it('isLegacyFormat — только максимум 75; hasLocalBreakdown — только не восстановленное; hasPuzzleRecords — оба условия', () => {
    expect(LEGACY_MAX_COINS).toBe(75);
    expect(isLegacyFormat({ maxPossibleCoins: 150 })).toBe(false);
    expect(isLegacyFormat({ maxPossibleCoins: 75 })).toBe(true);
    expect(hasLocalBreakdown({ isRestored: false })).toBe(true);
    expect(hasLocalBreakdown({ isRestored: true })).toBe(false);
    expect(hasPuzzleRecords({ maxPossibleCoins: 150, isRestored: false })).toBe(true);
    expect(hasPuzzleRecords({ maxPossibleCoins: 75, isRestored: false })).toBe(false);
    expect(hasPuzzleRecords({ maxPossibleCoins: 150, isRestored: true })).toBe(false);
    expect(hasPuzzleRecords({ maxPossibleCoins: 75, isRestored: true })).toBe(false);
  });

  it('maxCoinsFromServer: coins_max 75/150 — как есть; без него — 75 при монетах ≤ 75, иначе 150', () => {
    expect(maxCoinsFromServer(75, 120)).toBe(75);
    expect(maxCoinsFromServer(150, 10)).toBe(150);
    expect(maxCoinsFromServer(undefined, 75)).toBe(75);
    expect(maxCoinsFromServer(undefined, 76)).toBe(150);
    expect(maxCoinsFromServer(100, 40)).toBe(75);
    expect(maxCoinsFromServer('150', 90)).toBe(150);
  });
});
