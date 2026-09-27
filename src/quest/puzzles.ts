// Содержимое и проверка восьми загадок квеста (таблица «Загадки»: по 2 на комнату). `check` — чистая
// функция без DOM; `render` строит разметку панели только при вызове. Рассказчик — котик Изик.
import type { PuzzleId } from '../core/types';
import { createCheckRows, createChoice, createSlotBoard, createTokenLine } from './puzzle-ui';
import { el } from '../core/dom';

export interface CheckResult {
  correct: boolean;
  /** Код конкретной ошибки (для тестов и аналитики). */
  mistake?: string;
  /** Дружелюбное объяснение именно этой ошибки. */
  message?: string;
}

export interface PuzzleRenderApi {
  /** Ответ собран / разобран — экран включает или выключает «Проверить». */
  onAnswerChange(ready: boolean): void;
}

export interface PuzzleView {
  getAnswer(): unknown;
  reset(): void;
  showSolvedState(): void;
  destroy(): void;
}

export interface PuzzleDef {
  id: PuzzleId;
  title: string;
  /** Вводная Изика (1–2 фразы, на «ты»). */
  intro: string;
  hints: [string, string];
  check(answer: unknown): CheckResult;
  render(host: HTMLElement, api: PuzzleRenderApi): PuzzleView;
}

const ok: CheckResult = { correct: true };
const fail = (mistake: string, message: string): CheckResult => ({ correct: false, mistake, message });
const INCOMPLETE = (message: string): CheckResult => fail('INCOMPLETE', message);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// ------------------------------------------------------------------ 1. Переменные и типы

const P1_CARDS = [
  { id: 'izik', label: '"Изик"' },
  { id: 'num12', label: '12' },
  { id: 'true', label: 'true' },
  { id: 'str12', label: '"12"' },
];
const P1_BOXES = [
  { id: 'name', label: 'имя', type: 'string' },
  { id: 'age', label: 'возраст', type: 'number' },
  { id: 'likes', label: 'любитКодить', type: 'boolean' },
];

function checkVariables(answer: unknown): CheckResult {
  const a = isObj(answer) ? answer : {};
  const name = strOrNull(a.name);
  const age = strOrNull(a.age);
  const likes = strOrNull(a.likes);
  if (!name || !age || !likes) return INCOMPLETE('Разложи значения по всем трём коробкам.');
  if (name === 'true' || age === 'true')
    return fail('BOOLEAN_MISPLACED', 'true — это boolean, ответ «да» или «нет». Ему место только в коробке boolean.');
  if (likes !== 'true')
    return fail('NOT_BOOLEAN', 'В коробку любитКодить: boolean подходит только true или false — без кавычек.');
  if (name === 'num12')
    return fail('NUMBER_IN_STRING', '12 без кавычек — это число (number). В коробку string кладём текст в кавычках.');
  if (name === 'str12')
    return fail('WRONG_NAME', '"12" — это строка, по типу подходит. Но меня зовут не «12»! Найди моё настоящее имя.');
  if (age === 'str12')
    return fail('QUOTED_NUMBER', '"12" в кавычках — это строка (string). А коробке возраст: number нужно число без кавычек.');
  if (age !== 'num12')
    return fail('STRING_IN_NUMBER', 'В коробку number кладём число без кавычек, а не текст.');
  return name === 'izik' ? ok : INCOMPLETE('Разложи значения по всем трём коробкам.');
}

function renderVariables(host: HTMLElement, api: PuzzleRenderApi): PuzzleView {
  const board = createSlotBoard(host, {
    cards: P1_CARDS,
    slots: P1_BOXES.map((b) => ({ id: b.id, caption: `${b.label}: ${b.type}`, className: `ezq-pz-box ezq-pz-box--${b.type}` })),
    slotsLabel: 'Коробки-переменные',
    cardsLabel: 'Значения',
    layout: 'boxes',
    onChange: (filled) => api.onAnswerChange(filled === P1_BOXES.length),
  });
  return {
    getAnswer: () => {
      const v = board.values();
      return { name: v[0], age: v[1], likes: v[2] };
    },
    reset: board.reset,
    showSolvedState: board.lock,
    destroy: board.destroy,
  };
}

// ------------------------------------------------------------------ 2. IF / ELSE

const P2_BRANCHES = [
  { id: 'if', head: 'if (signal === "red") {', body: 'fridge.lock()' },
  { id: 'elseif', head: '} else if (signal === "green") {', body: 'fridge.open()' },
  { id: 'else', head: '} else {', body: 'fridge.beep()' },
];

function checkConditions(answer: unknown): CheckResult {
  if (answer === 'else') return ok;
  if (answer === 'if')
    return fail('RED_BRANCH', 'Датчик светится жёлтым, а не красным. Условие signal === "red" ложно — эту ветку холодильник пропустит.');
  if (answer === 'elseif')
    return fail('GREEN_BRANCH', 'signal === "green" тоже ложно: жёлтый — не зелёный. Проверь, куда попадает всё остальное.');
  return INCOMPLETE('Нажми на ветку, которая выполнится.');
}

function renderConditions(host: HTMLElement, api: PuzzleRenderApi): PuzzleView {
  let picked: string | null = null;
  let locked = false;
  const sensor = el('div', 'ezq-pz-sensor');
  const lamp = el('span', 'ezq-pz-sensor__lamp');
  const sensorText = el('span', 'ezq-pz-sensor__text', 'Датчик: signal = "yellow"');
  sensor.append(lamp, sensorText);
  const code = el('div', 'ezq-pz-code');
  code.setAttribute('role', 'radiogroup');
  code.setAttribute('aria-label', 'Ветки кода');
  const buttons = P2_BRANCHES.map((b) => {
    const btn = el('button', 'ezq-pz-branch');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.append(el('span', 'ezq-pz-branch__head', b.head), el('span', 'ezq-pz-branch__body', b.body));
    btn.addEventListener('click', () => {
      if (locked) return;
      picked = b.id;
      sync();
    });
    code.appendChild(btn);
    return btn;
  });
  code.appendChild(el('div', 'ezq-pz-branch__tail', '}'));
  const sync = (): void => {
    buttons.forEach((btn, i) => {
      const on = P2_BRANCHES[i].id === picked;
      btn.classList.toggle('ezq-pz-branch--picked', on);
      btn.setAttribute('aria-checked', String(on));
    });
    api.onAnswerChange(picked !== null);
  };
  host.append(el('p', 'ezq-pz-q', 'Какая ветка выполнится?'), sensor, code);
  return {
    getAnswer: () => picked,
    reset: () => {
      picked = null;
      sync();
    },
    showSolvedState: () => {
      locked = true;
      buttons.forEach((b) => (b.disabled = true));
      host.classList.add('ezq-pz--solved');
    },
    destroy: () => host.replaceChildren(),
  };
}

// ------------------------------------------------------------------ 3. Циклы

const P3_BLOCKS = [
  { id: 'for_0_lt5', label: 'for (let i = 0; i < 5; i++) {' },
  { id: 'for_0_le5', label: 'for (let i = 0; i <= 5; i++) {' },
  { id: 'for_1_lt5', label: 'for (let i = 1; i < 5; i++) {' },
  { id: 'put', label: '  shelf.putBook()' },
  { id: 'take', label: '  shelf.takeBook()' },
  { id: 'close', label: '}' },
];
const HEADERS: Record<string, number> = { for_0_lt5: 5, for_0_le5: 6, for_1_lt5: 4 };
const BODIES = new Set(['put', 'take']);

/** Сколько раз повторится цикл с этим заголовком (для превью), иначе null. */
export function loopRepeats(headerId: string | null): number | null {
  return headerId && headerId in HEADERS ? HEADERS[headerId] : null;
}

function checkLoops(answer: unknown): CheckResult {
  const a = Array.isArray(answer) ? answer.map(strOrNull) : [];
  if (a.length !== 3 || a.some((x) => !x)) return INCOMPLETE('Заполни все три строчки кода.');
  const [head, body, tail] = a as string[];
  if (!(head in HEADERS) || !BODIES.has(body) || tail !== 'close')
    return fail('WRONG_ORDER', 'Цикл собирается так: сверху заголовок for, в середине — что повторять, внизу — закрывающая скобка }.');
  if (head === 'for_0_le5')
    return fail('SIX_BOOKS', 'С i <= 5 цикл пройдёт для 0, 1, 2, 3, 4 и 5 — это 6 книг, одна лишняя.');
  if (head === 'for_1_lt5')
    return fail('FOUR_BOOKS', 'Если начать с i = 1 и идти пока i < 5, получится 1, 2, 3, 4 — только 4 книги.');
  if (body === 'take')
    return fail('TAKE_BOOK', 'shelf.takeBook() снимает книги с полки, а нам нужно их поставить.');
  return ok;
}

function renderLoops(host: HTMLElement, api: PuzzleRenderApi): PuzzleView {
  const preview = el('div', 'ezq-pz-shelf');
  preview.setAttribute('aria-live', 'polite');
  const board = createSlotBoard(host, {
    cards: P3_BLOCKS,
    slots: [0, 1, 2].map((i) => ({ id: `s${i}`, caption: `строка ${i + 1}`, className: 'ezq-pz-line' })),
    slotsLabel: 'Строки кода',
    cardsLabel: 'Блоки',
    layout: 'lines',
    onChange: (filled, values) => {
      renderShelf(values);
      api.onAnswerChange(filled === 3);
    },
  });
  const renderShelf = (values: (string | null)[]): void => {
    const head = values.find((v) => v !== null && v in HEADERS) ?? null;
    const n = loopRepeats(head);
    const books = el('div', 'ezq-pz-shelf__books');
    for (let i = 0; i < (n ?? 0); i++) books.appendChild(el('span', `ezq-pz-book ezq-pz-book--${i % 4}`));
    const caption = n === null ? 'Выбери заголовок цикла — покажу, сколько раз он повторится' : `Цикл повторится ${n} раз`;
    preview.replaceChildren(books, el('span', 'ezq-pz-shelf__caption', caption));
  };
  renderShelf([null, null, null]);
  host.appendChild(preview);
  return {
    getAnswer: () => board.values(),
    reset: board.reset,
    showSolvedState: board.lock,
    destroy: board.destroy,
  };
}

// ------------------------------------------------------------------ 4. Функции и аргументы

const P4_TOKENS = [
  { id: 'runMission', label: 'runMission' },
  { id: 'run_mission', label: 'run_mission' },
  { id: 'lparen', label: '(' },
  { id: 'rparen', label: ')' },
  { id: 'str_arcade', label: '"ARCADE"' },
  { id: 'bare_arcade', label: 'ARCADE' },
  { id: 'eq', label: '=' },
];
const FN_NAMES = new Set(['runMission', 'run_mission']);

function checkFunctions(answer: unknown): CheckResult {
  const t = Array.isArray(answer) ? answer.filter((x): x is string => typeof x === 'string') : [];
  if (t.length === 0) return INCOMPLETE('Собери вызов функции из кусочков.');
  if (t.includes('eq'))
    return fail('ASSIGNMENT', 'Знак = кладёт значение в переменную. А чтобы запустить функцию, её вызывают со скобками.');
  if (!FN_NAMES.has(t[0]))
    return fail('WRONG_ORDER', 'Вызов начинается с имени функции, потом скобки.');
  if (t[0] === 'run_mission')
    return fail('WRONG_NAME', 'Посмотри на объявление: функция называется runMission, без подчёркивания. Имя должно совпадать буква в букву.');
  if (!t.includes('lparen') || !t.includes('rparen'))
    return fail('NO_PARENS', 'Без круглых скобок функция не запустится: runMission( … ).');
  if (t[1] !== 'lparen' || t[t.length - 1] !== 'rparen')
    return fail('WRONG_ORDER', 'Порядок такой: имя функции, открывающая скобка (, аргумент, закрывающая скобка ).');
  const inner = t.slice(2, -1);
  if (inner.length === 0) return fail('NO_ARGUMENT', 'Сундуку нужен код миссии — положи его внутрь скобок.');
  if (inner.length === 1 && inner[0] === 'bare_arcade')
    return fail('NO_QUOTES', 'ARCADE без кавычек компьютер примет за имя переменной. Текст-строку пишем в кавычках: "ARCADE".');
  if (inner.length === 1 && inner[0] === 'str_arcade') return ok;
  return fail('EXTRA', 'Внутри скобок должен быть ровно один аргумент — код миссии.');
}

function renderFunctions(host: HTMLElement, api: PuzzleRenderApi): PuzzleView {
  const decl = el('pre', 'ezq-pz-code ezq-pz-code--static');
  decl.textContent = 'function runMission(code) {\n  if (code === "ARCADE") chest.open()\n}';
  host.append(decl, el('p', 'ezq-pz-q', 'Собери вызов, чтобы сундук открылся и миссия запустилась:'));
  const line = createTokenLine(host, {
    tokens: P4_TOKENS,
    placeholder: 'Нажимай на кусочки кода по порядку',
    onChange: (n) => api.onAnswerChange(n > 0),
  });
  return {
    getAnswer: () => line.values(),
    reset: line.reset,
    showSolvedState: line.lock,
    destroy: line.destroy,
  };
}

// ------------------------------------------------------------------ 1б. Присваивание (шкаф)

const ASSIGN_OPTIONS = [
  { id: 'two', label: '2' },
  { id: 'three', label: '3' },
  { id: 'five', label: '5' },
  { id: 'str23', label: '"23"' },
];

function checkAssign(answer: unknown): CheckResult {
  if (answer === 'five') return ok;
  if (answer === 'two')
    return fail('OLD_VALUE', 'Во второй строке переменная обновилась: socks = socks + 3 кладёт в неё новое значение.');
  if (answer === 'three')
    return fail('ONLY_ADDED', 'Тройку не положили вместо двух — её прибавили к старому значению: 2 + 3.');
  if (answer === 'str23')
    return fail('STRING_JOIN', '2 и 3 здесь — числа, а не строки, поэтому они складываются, а не склеиваются.');
  return INCOMPLETE('Выбери один ответ.');
}

// ------------------------------------------------------------------ 2б. Условие И (чайник)

const KETTLE_ROWS = [
  { id: 'yy', cells: ['✓', '✓'] },
  { id: 'yn', cells: ['✓', '✗'] },
  { id: 'ny', cells: ['✗', '✓'] },
  { id: 'nn', cells: ['✗', '✗'] },
];

function checkKettle(answer: unknown): CheckResult {
  const a = Array.isArray(answer) ? answer.filter((x): x is string => typeof x === 'string') : [];
  if (a.length === 0) return INCOMPLETE('Отметь строки, где чайник закипит.');
  if (a.includes('yn') || a.includes('ny'))
    return fail('AND_NEEDS_BOTH', '&& — нужны оба условия: без воды или без тока чайник не закипит.');
  if (a.includes('nn'))
    return fail('NOTHING_TRUE', 'Когда нет ни воды, ни тока, оба условия ложны — чайник точно не закипит.');
  return a.length === 1 && a[0] === 'yy' ? ok : INCOMPLETE('Отметь строки, где чайник закипит.');
}

function renderKettle(host: HTMLElement, api: PuzzleRenderApi): PuzzleView {
  const decl = el('pre', 'ezq-pz-code ezq-pz-code--static');
  decl.textContent = 'if (water && power) {\n  kettle.boil()\n}';
  host.append(decl, el('p', 'ezq-pz-q', 'Отметь все строки, где чайник закипит:'));
  const rows = createCheckRows(host, {
    columns: ['вода', 'ток'],
    rows: KETTLE_ROWS,
    label: 'Вода и ток',
    onChange: (checked) => api.onAnswerChange(checked.length > 0),
  });
  return { getAnswer: () => rows.values(), reset: rows.reset, showSolvedState: rows.lock, destroy: rows.destroy };
}

// ------------------------------------------------------------------ 3б. Цикл WHILE (старый компьютер)

const WHILE_OPTIONS = [
  { id: 'four', label: '4' },
  { id: 'five', label: '5' },
  { id: 'six', label: '6' },
  { id: 'ten', label: '10' },
];

function checkWhile(answer: unknown): CheckResult {
  if (answer === 'five') return ok;
  if (answer === 'ten')
    return fail('STEP_TWO', 'pages уменьшается на 2 за раз, а не на 1 — повторов будет меньше десяти.');
  if (answer === 'six')
    return fail('ZERO_IS_FALSE', 'При pages = 0 условие pages > 0 ложно — цикл остановится и печатать не будет.');
  if (answer === 'four')
    return fail('MISCOUNT', 'Посчитай значения pages, при которых печать сработает: 10, 8, 6, 4, 2.');
  return INCOMPLETE('Выбери один ответ.');
}

/** Выбор из 4 с кодом над вариантами (var_assign, while_pc). */
function choiceRenderer(code: string, question: string, options: { id: string; label: string }[]) {
  return (host: HTMLElement, api: PuzzleRenderApi): PuzzleView => {
    const decl = el('pre', 'ezq-pz-code ezq-pz-code--static');
    decl.textContent = code;
    host.append(decl, el('p', 'ezq-pz-q', question));
    const choice = createChoice(host, { options, label: 'Варианты ответа', onChange: (p) => api.onAnswerChange(p !== null) });
    return { getAnswer: () => choice.values()[0], reset: choice.reset, showSolvedState: choice.lock, destroy: choice.destroy };
  };
}

// ------------------------------------------------------------------ 4а. Функция с двумя аргументами (проигрыватель)

const PLAY_TOKENS = [
  { id: 'play', label: 'play' },
  { id: 'lparen', label: '(' },
  { id: 'str_jazz', label: '"Jazz"' },
  { id: 'bare_jazz', label: 'Jazz' },
  { id: 'comma', label: ',' },
  { id: 'n3', label: '3' },
  { id: 'rparen', label: ')' },
];
const JAZZ = new Set(['str_jazz', 'bare_jazz']);

function checkPlay(answer: unknown): CheckResult {
  const t = Array.isArray(answer) ? answer.filter((x): x is string => typeof x === 'string') : [];
  if (t.length === 0) return INCOMPLETE('Собери вызов функции из кусочков.');
  if (t[0] !== 'play') return fail('WRONG_ORDER', 'Вызов начинается с имени функции play, потом скобки.');
  if (!t.includes('lparen') || !t.includes('rparen'))
    return fail('NO_PARENS', 'Без круглых скобок функция не запустится: play( … ).');
  if (t[1] !== 'lparen' || t[t.length - 1] !== 'rparen')
    return fail('WRONG_ORDER', 'Порядок такой: имя функции, открывающая скобка (, аргументы, закрывающая скобка ).');
  const inner = t.slice(2, -1);
  if (inner.length === 3 && inner[0] === 'n3' && inner[1] === 'comma' && JAZZ.has(inner[2]))
    return fail('ARG_ORDER', 'Порядок аргументов важен: в play(track, times) сначала идёт мелодия, потом число повторов.');
  if (inner.includes('bare_jazz'))
    return fail('NO_QUOTES', 'Jazz без кавычек компьютер примет за имя переменной. Строку пишем в кавычках: "Jazz".');
  if (inner.length === 3 && inner[0] === 'str_jazz' && inner[1] === 'comma' && inner[2] === 'n3') return ok;
  const args = inner.filter((x) => x !== 'comma');
  if (args.length === 2 && !inner.includes('comma'))
    return fail('NO_COMMA', 'Аргументы разделяют запятой: play("Jazz", 3).');
  if (args.length < 2) return fail('MISSING_ARG', 'Функции нужны два аргумента: мелодия и сколько раз её сыграть.');
  return fail('WRONG_ORDER', 'Внутри скобок: мелодия, запятая, число повторов.');
}

function renderPlay(host: HTMLElement, api: PuzzleRenderApi): PuzzleView {
  const decl = el('pre', 'ezq-pz-code ezq-pz-code--static');
  decl.textContent = 'function play(track, times) {\n  for (let i = 0; i < times; i++) player.spin(track)\n}';
  host.append(decl, el('p', 'ezq-pz-q', 'Собери вызов, чтобы «Jazz» сыграл 3 раза:'));
  const line = createTokenLine(host, {
    tokens: PLAY_TOKENS,
    placeholder: 'Нажимай на кусочки кода по порядку',
    onChange: (n) => api.onAnswerChange(n > 0),
  });
  return { getAnswer: () => line.values(), reset: line.reset, showSolvedState: line.lock, destroy: line.destroy };
}

// ------------------------------------------------------------------ реестр

export const PUZZLES: Record<PuzzleId, PuzzleDef> = {
  var_types: {
    id: 'var_types',
    title: 'Переменные и типы данных',
    intro: 'Мяу, я Изик! Мой компьютер не включится, пока в переменных беспорядок. Разложи значения по коробкам — каждой свой тип!',
    hints: [
      'Строки (string) всегда пишут в кавычках, числа (number) — без кавычек, а boolean — это true или false.',
      'Одно значение лишнее: "12" в кавычках — строка, она не подходит ни для моего имени, ни для возраста.',
    ],
    check: checkVariables,
    render: renderVariables,
  },
  var_assign: {
    id: 'var_assign',
    title: 'Переменные: новое значение',
    intro: 'В шкафу ящик с носками, и я записал в код, сколько их там. Посчитай, что лежит в переменной socks в конце!',
    hints: [
      'Знак = не сравнивает, а кладёт в переменную новое значение. Справа сначала считается socks + 3.',
      'Было 2, прибавили 3. Числа складываются как в математике.',
    ],
    check: checkAssign,
    render: choiceRenderer('let socks = 2;\nsocks = socks + 3;', 'Сколько носков в ящике socks?', ASSIGN_OPTIONS),
  },
  if_fridge: {
    id: 'if_fridge',
    title: 'Условные операторы IF / ELSE',
    intro: 'Умный холодильник читает цвет датчика и решает, что делать. Сейчас датчик светится жёлтым. Какую ветку он выберет?',
    hints: [
      'Проверь условия по очереди, сверху вниз: подходит ли жёлтый к каждому из них?',
      'Ни red, ни green не подошли. Куда попадает всё остальное?',
    ],
    check: checkConditions,
    render: renderConditions,
  },
  and_kettle: {
    id: 'and_kettle',
    title: 'Условие И (&&)',
    intro: 'Хочу чаю! Чайник на плите закипает по этому коду. Отметь все случаи, когда он закипит.',
    hints: [
      'Оператор && (И) даёт true, только если слева и справа true.',
      'Подходит всего одна строка — та, где есть и вода, и ток.',
    ],
    check: checkKettle,
    render: renderKettle,
  },
  for_shelf: {
    id: 'for_shelf',
    title: 'Алгоритмические циклы',
    intro: 'Помоги расставить стеллаж: собери цикл, который поставит на полку ровно 5 книг.',
    hints: [
      'Посчитай, сколько раз повторится каждый заголовок: выпиши все значения i, пока условие верно.',
      'От 0 до 4 — это пять чисел: 0, 1, 2, 3, 4. Значит, нужен i = 0 и i < 5.',
    ],
    check: checkLoops,
    render: renderLoops,
  },
  while_pc: {
    id: 'while_pc',
    title: 'Цикл WHILE',
    intro: 'Старый компьютер печатает, пока есть страницы. Сколько раз он напечатает, прежде чем остановится?',
    hints: [
      'Выпиши значение pages перед каждой проверкой: 10, потом 8, потом…',
      'Печать срабатывает, пока pages больше нуля. Посчитай, сколько таких значений.',
    ],
    check: checkWhile,
    render: choiceRenderer('let pages = 10;\nwhile (pages > 0) {\n  print();\n  pages = pages - 2;\n}', 'Сколько раз напечатает?', WHILE_OPTIONS),
  },
  fn_play: {
    id: 'fn_play',
    title: 'Функции с двумя аргументами',
    intro: 'Проигрыватель умеет играть любую мелодию сколько угодно раз. Включи мне «Jazz» три раза подряд!',
    hints: [
      'Аргументы передают в том же порядке, что и в объявлении: сначала track, потом times.',
      'Мелодия — это строка в кавычках, а число повторов — без кавычек, через запятую.',
    ],
    check: checkPlay,
    render: renderPlay,
  },
  fn_mission: {
    id: 'fn_mission',
    title: 'Функции и аргументы',
    intro: 'Последний шаг! Сундук откроется только по команде. Запусти миссию с кодом ARCADE — передай правильную команду.',
    hints: [
      'Вызов функции — это её точное имя и круглые скобки, а внутри скобок — аргумент.',
      'Строку пишем в кавычках: нужен "ARCADE", а не ARCADE.',
    ],
    check: checkFunctions,
    render: renderFunctions,
  },
};
