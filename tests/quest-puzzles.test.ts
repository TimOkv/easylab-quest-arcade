import { describe, it, expect } from 'vitest';
import { PUZZLES } from '../src/quest/puzzles';

// Ожидания — из «Решений §4» спецификации (верные ответы и ловушки), не из кода.

describe('Загадка 1 — переменные и типы', () => {
  const check = PUZZLES[1].check;

  it('верно: имя ← "Мурзик", возраст ← 12, любитКодить ← true', () => {
    expect(check({ name: 'murzik', age: 'num12', likes: 'true' })).toEqual({ correct: true });
  });

  it('ловушка: "12" в кавычках в коробке number — объясняем про кавычки', () => {
    const r = check({ name: 'murzik', age: 'str12', likes: 'true' });
    expect(r.correct).toBe(false);
    expect(r.mistake).toBe('QUOTED_NUMBER');
    expect(r.message).toMatch(/кавычк/i);
  });

  it('число 12 без кавычек в коробке string — ошибка типа', () => {
    const r = check({ name: 'num12', age: 'str12', likes: 'true' });
    expect(r.correct).toBe(false);
    expect(r.mistake).toBe('NUMBER_IN_STRING');
  });

  it('true не в своей коробке — объясняем про boolean', () => {
    const r = check({ name: 'murzik', age: 'true', likes: 'num12' });
    expect(r.correct).toBe(false);
    expect(r.mistake).toBe('BOOLEAN_MISPLACED');
    expect(r.message).toMatch(/true/);
  });

  it('строка "12" как имя — по типу подходит, но это не имя котика', () => {
    const r = check({ name: 'str12', age: 'num12', likes: 'true' });
    expect(r.correct).toBe(false);
    expect(r.mistake).toBe('WRONG_NAME');
  });

  it('не все коробки заполнены / мусор на входе — INCOMPLETE', () => {
    expect(check({ name: 'murzik', age: null, likes: 'true' }).mistake).toBe('INCOMPLETE');
    expect(check(undefined).mistake).toBe('INCOMPLETE');
    expect(check('murzik').correct).toBe(false);
  });
});

describe('Загадка 2 — IF / ELSE (датчик жёлтый)', () => {
  const check = PUZZLES[2].check;

  it('верно: выполнится ветка else', () => {
    expect(check('else')).toEqual({ correct: true });
  });

  it('ветка red — объясняем, что условие ложно', () => {
    const r = check('if');
    expect(r).toMatchObject({ correct: false, mistake: 'RED_BRANCH' });
    expect(r.message).toMatch(/red/);
  });

  it('ветка green — тоже ложно', () => {
    expect(check('elseif')).toMatchObject({ correct: false, mistake: 'GREEN_BRANCH' });
  });

  it('ничего не выбрано — INCOMPLETE', () => {
    expect(check(null)).toMatchObject({ correct: false, mistake: 'INCOMPLETE' });
  });
});

describe('Загадка 3 — цикл «ровно 5 книг»', () => {
  const check = PUZZLES[3].check;

  it('верно: for (i = 0; i < 5) → putBook → }', () => {
    expect(check(['for_0_lt5', 'put', 'close'])).toEqual({ correct: true });
  });

  it('i <= 5 — это 6 книг', () => {
    const r = check(['for_0_le5', 'put', 'close']);
    expect(r).toMatchObject({ correct: false, mistake: 'SIX_BOOKS' });
    expect(r.message).toMatch(/6/);
  });

  it('i = 1; i < 5 — это 4 книги', () => {
    const r = check(['for_1_lt5', 'put', 'close']);
    expect(r).toMatchObject({ correct: false, mistake: 'FOUR_BOOKS' });
    expect(r.message).toMatch(/4/);
  });

  it('takeBook вместо putBook — книги убираются, а не ставятся', () => {
    expect(check(['for_0_lt5', 'take', 'close'])).toMatchObject({ correct: false, mistake: 'TAKE_BOOK' });
  });

  it('неверный порядок блоков', () => {
    expect(check(['put', 'for_0_lt5', 'close'])).toMatchObject({ correct: false, mistake: 'WRONG_ORDER' });
    expect(check(['for_0_lt5', 'close', 'put'])).toMatchObject({ correct: false, mistake: 'WRONG_ORDER' });
  });

  it('пустой слот — INCOMPLETE', () => {
    expect(check(['for_0_lt5', null, 'close'])).toMatchObject({ correct: false, mistake: 'INCOMPLETE' });
  });
});

describe('Загадка 4 — вызов runMission("ARCADE")', () => {
  const check = PUZZLES[4].check;

  it('верно ровно: runMission ( "ARCADE" )', () => {
    expect(check(['runMission', 'lparen', 'str_arcade', 'rparen'])).toEqual({ correct: true });
  });

  it('ARCADE без кавычек — строку пишем в кавычках', () => {
    const r = check(['runMission', 'lparen', 'bare_arcade', 'rparen']);
    expect(r).toMatchObject({ correct: false, mistake: 'NO_QUOTES' });
    expect(r.message).toMatch(/кавычк/i);
  });

  it('run_mission — у функции другое имя', () => {
    expect(check(['run_mission', 'lparen', 'str_arcade', 'rparen'])).toMatchObject({ correct: false, mistake: 'WRONG_NAME' });
  });

  it('знак = — это присваивание, а не вызов', () => {
    expect(check(['runMission', 'eq', 'str_arcade'])).toMatchObject({ correct: false, mistake: 'ASSIGNMENT' });
  });

  it('без скобок функция не вызывается', () => {
    expect(check(['runMission', 'str_arcade'])).toMatchObject({ correct: false, mistake: 'NO_PARENS' });
  });

  it('скобки не в том порядке', () => {
    expect(check(['runMission', 'rparen', 'str_arcade', 'lparen'])).toMatchObject({ correct: false, mistake: 'WRONG_ORDER' });
  });

  it('вызов без аргумента', () => {
    expect(check(['runMission', 'lparen', 'rparen'])).toMatchObject({ correct: false, mistake: 'NO_ARGUMENT' });
  });

  it('пусто — INCOMPLETE', () => {
    expect(check([])).toMatchObject({ correct: false, mistake: 'INCOMPLETE' });
  });
});

describe('Метаданные загадок', () => {
  it('у каждой загадки две подсказки и вводная', () => {
    for (const n of [1, 2, 3, 4] as const) {
      expect(PUZZLES[n].hints).toHaveLength(2);
      expect(PUZZLES[n].intro.length).toBeGreaterThan(0);
    }
  });
});
