import { describe, it, expect } from 'vitest';
import {
  REWARDS,
  rewardFor,
  generateVerificationCode,
  isValidVerificationCode,
  normalizeVerificationCode,
  validatePlayerName,
  isRunPlausible,
  MAX_POINTS_PER_SECOND,
  MIN_RUN_SECONDS,
  MAX_SCORE,
} from '../src/core/rules';

describe('rewardFor — таблица монет (Решения §3)', () => {
  // Таблица из спецификации, история 25: [10,7,5] / [15,11,8] / [20,14,10] / [30,22,15]
  const table: Array<[1 | 2 | 3 | 4, number, number]> = [
    [1, 1, 10], [1, 2, 7], [1, 3, 5],
    [2, 1, 15], [2, 2, 11], [2, 3, 8],
    [3, 1, 20], [3, 2, 14], [3, 3, 10],
    [4, 1, 30], [4, 2, 22], [4, 3, 15],
  ];
  it.each(table)('комната %i, попытка %i → %i', (room, attempts, expected) => {
    expect(rewardFor(room, attempts, 0)).toBe(expected);
  });

  it('3+ попытка = третья колонка', () => {
    expect(rewardFor(1, 7, 0)).toBe(5);
    expect(rewardFor(4, 40, 0)).toBe(15);
  });

  it('первая подсказка не снижает награду сама по себе', () => {
    expect(rewardFor(2, 2, 1)).toBe(11);
  });

  it('вторая подсказка → 0 монет', () => {
    expect(rewardFor(1, 1, 2)).toBe(0);
    expect(rewardFor(4, 3, 2)).toBe(0);
  });

  it('никогда не меньше нуля и максимум 75', () => {
    for (const room of [1, 2, 3, 4] as const) {
      for (let a = 0; a < 10; a++) {
        for (const h of [0, 1, 2] as const) expect(rewardFor(room, a, h)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(REWARDS[1][0] + REWARDS[2][0] + REWARDS[3][0] + REWARDS[4][0]).toBe(75);
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
