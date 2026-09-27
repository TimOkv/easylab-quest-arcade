import { describe, it, expect } from 'vitest';
import { PUZZLES } from '../src/quest/puzzles';

// Ожидания — из «Решений §4» спецификации (верные ответы и ловушки), не из кода.

describe('Загадка 1 — переменные и типы', () => {
  const check = PUZZLES.var_types.check;

  it('верно: имя ← "Изик", возраст ← 12, любитКодить ← true', () => {
    expect(check({ name: 'izik', age: 'num12', likes: 'true' })).toEqual({ correct: true });
  });

  it('ловушка: "12" в кавычках в коробке number — объясняем про кавычки', () => {
    const r = check({ name: 'izik', age: 'str12', likes: 'true' });
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
    const r = check({ name: 'izik', age: 'true', likes: 'num12' });
    expect(r.correct).toBe(false);
    expect(r.mistake).toBe('BOOLEAN_MISPLACED');
    expect(r.message).toMatch(/true/);
  });

  it('строка "12" как имя — по типу подходит, но это не имя Изика', () => {
    const r = check({ name: 'str12', age: 'num12', likes: 'true' });
    expect(r.correct).toBe(false);
    expect(r.mistake).toBe('WRONG_NAME');
  });

  it('не все коробки заполнены / мусор на входе — INCOMPLETE', () => {
    expect(check({ name: 'izik', age: null, likes: 'true' }).mistake).toBe('INCOMPLETE');
    expect(check(undefined).mistake).toBe('INCOMPLETE');
    expect(check('izik').correct).toBe(false);
  });
});

describe('Загадка 2 — IF / ELSE (датчик жёлтый)', () => {
  const check = PUZZLES.if_fridge.check;

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
  const check = PUZZLES.for_shelf.check;

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
  const check = PUZZLES.fn_mission.check;

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

// Новые загадки — ожидания из таблицы «Загадки» спецификации.
describe('var_assign — шкаф: socks = socks + 3', () => {
  const check = PUZZLES.var_assign.check;
  it('верно: 5', () => expect(check('five')).toEqual({ correct: true }));
  it.each([
    ['two', 'OLD_VALUE', /обновил/],
    ['three', 'ONLY_ADDED', /прибав/],
    ['str23', 'STRING_JOIN', /числ/],
  ])('%s → %s', (a, mistake, msg) => {
    const r = check(a);
    expect(r).toMatchObject({ correct: false, mistake });
    expect(r.message).toMatch(msg);
  });
  it('ничего не выбрано / мусор — INCOMPLETE', () => {
    expect(check(null).mistake).toBe('INCOMPLETE');
    expect(check('seven').mistake).toBe('INCOMPLETE');
  });
});

describe('and_kettle — чайник: if (water && power)', () => {
  const check = PUZZLES.and_kettle.check;
  it('верно: только «вода ✓, ток ✓»', () => expect(check(['yy'])).toEqual({ correct: true }));
  it('строка «вода ✓, ток ✗» или «вода ✗, ток ✓» — && нужны оба условия', () => {
    for (const a of [['yy', 'yn'], ['ny'], ['yy', 'yn', 'ny']]) {
      const r = check(a);
      expect(r).toMatchObject({ correct: false, mistake: 'AND_NEEDS_BOTH' });
      expect(r.message).toMatch(/&&/);
    }
  });
  it('строка «вода ✗, ток ✗» — отдельная ошибка', () => {
    expect(check(['yy', 'nn'])).toMatchObject({ correct: false, mistake: 'NOTHING_TRUE' });
  });
  it('ничего не отмечено — INCOMPLETE', () => {
    expect(check([]).mistake).toBe('INCOMPLETE');
    expect(check(undefined).mistake).toBe('INCOMPLETE');
  });
});

describe('while_pc — старый компьютер: pages -= 2 от 10', () => {
  const check = PUZZLES.while_pc.check;
  it('верно: 5', () => expect(check('five')).toEqual({ correct: true }));
  it.each([
    ['ten', 'STEP_TWO', /на 2/],
    ['six', 'ZERO_IS_FALSE', /pages = 0/],
    ['four', 'MISCOUNT', /10, 8, 6, 4, 2/],
  ])('%s → %s', (a, mistake, msg) => {
    const r = check(a);
    expect(r).toMatchObject({ correct: false, mistake });
    expect(r.message).toMatch(msg);
  });
  it('ничего не выбрано — INCOMPLETE', () => expect(check(null).mistake).toBe('INCOMPLETE'));
});

describe('fn_play — проигрыватель: play("Jazz", 3)', () => {
  const check = PUZZLES.fn_play.check;
  it('верно ровно: play ( "Jazz" , 3 )', () => {
    expect(check(['play', 'lparen', 'str_jazz', 'comma', 'n3', 'rparen'])).toEqual({ correct: true });
  });
  it('play(3, "Jazz") — порядок аргументов важен', () => {
    const r = check(['play', 'lparen', 'n3', 'comma', 'str_jazz', 'rparen']);
    expect(r).toMatchObject({ correct: false, mistake: 'ARG_ORDER' });
    expect(r.message).toMatch(/порядок/i);
  });
  it('play(Jazz, 3) — строку пишем в кавычках', () => {
    const r = check(['play', 'lparen', 'bare_jazz', 'comma', 'n3', 'rparen']);
    expect(r).toMatchObject({ correct: false, mistake: 'NO_QUOTES' });
    expect(r.message).toMatch(/кавычк/);
  });
  it('без запятой между аргументами', () => {
    expect(check(['play', 'lparen', 'str_jazz', 'n3', 'rparen']).mistake).toBe('NO_COMMA');
  });
  it('не хватает аргумента', () => {
    expect(check(['play', 'lparen', 'str_jazz', 'rparen']).mistake).toBe('MISSING_ARG');
  });
  it('без скобок / не с имени функции', () => {
    expect(check(['play', 'str_jazz', 'comma', 'n3']).mistake).toBe('NO_PARENS');
    expect(check(['lparen', 'play', 'str_jazz', 'comma', 'n3', 'rparen']).mistake).toBe('WRONG_ORDER');
  });
  it('пусто — INCOMPLETE', () => expect(check([]).mistake).toBe('INCOMPLETE'));
});

describe('Метаданные загадок', () => {
  it('8 загадок: у каждой id совпадает с ключом, две подсказки и вводная', () => {
    const ids = ['var_types', 'var_assign', 'if_fridge', 'and_kettle', 'for_shelf', 'while_pc', 'fn_play', 'fn_mission'] as const;
    expect(Object.keys(PUZZLES).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(PUZZLES[id].id).toBe(id);
      expect(PUZZLES[id].hints).toHaveLength(2);
      expect(PUZZLES[id].intro.length).toBeGreaterThan(0);
    }
  });

  it('герой — Изик: в первой загадке «Мурзика» больше нет', () => {
    expect(JSON.stringify(PUZZLES.var_types.intro + PUZZLES.var_types.hints.join(''))).not.toMatch(/Мурзик/);
  });
});
