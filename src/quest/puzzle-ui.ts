// Общие кирпичики панелей загадок: «тап по карточке → тап по месту» и строка из токенов.
// Всё — нативные <button>: мышь, тач и клавиатура (Enter/Space) работают одинаково.
import { button, el } from '../core/dom';

export interface Card {
  id: string;
  label: string;
}

export interface SlotBoardOptions {
  cards: Card[];
  slots: { id: string; caption: string; className: string }[];
  slotsLabel: string;
  cardsLabel: string;
  layout: 'boxes' | 'lines';
  onChange(filled: number, values: (string | null)[]): void;
}

export interface SlotBoard {
  values(): (string | null)[];
  reset(): void;
  lock(): void;
  destroy(): void;
}

/**
 * Места (слоты) + колода карточек. Тап по карточке выделяет её; тап по месту кладёт выделенную
 * (занятое место меняется местами с колодой). Тап по занятому месту без выделения — вернуть в колоду.
 * Если сначала выбрано место, следующая карточка ляжет в него.
 */
export function createSlotBoard(host: HTMLElement, o: SlotBoardOptions): SlotBoard {
  const values: (string | null)[] = o.slots.map(() => null);
  let selCard: string | null = null;
  let selSlot: number | null = null;
  let locked = false;

  const slotsWrap = el('div', `ezq-pz-slots ezq-pz-slots--${o.layout}`);
  slotsWrap.setAttribute('role', 'group');
  slotsWrap.setAttribute('aria-label', o.slotsLabel);
  const pool = el('div', 'ezq-pz-pool');
  pool.setAttribute('role', 'group');
  pool.setAttribute('aria-label', o.cardsLabel);
  const hint = el('p', 'ezq-pz-howto', 'Нажми на карточку, а потом на место, куда её положить.');

  const label = (id: string): string => o.cards.find((c) => c.id === id)?.label ?? id;

  const slotBtns = o.slots.map((s, i) => {
    const b = button(`ezq-pz-slot ${s.className}`, '');
    b.addEventListener('click', () => onSlot(i));
    slotsWrap.appendChild(b);
    return { b, s };
  });
  const cardBtns = new Map<string, HTMLButtonElement>();
  for (const c of o.cards) {
    const b = button('ezq-pz-card', c.label);
    b.addEventListener('click', () => onCard(c.id));
    cardBtns.set(c.id, b);
    pool.appendChild(b);
  }

  function place(slot: number, card: string): void {
    const prevIdx = values.indexOf(card);
    if (prevIdx >= 0) values[prevIdx] = null;
    values[slot] = card;
    selCard = null;
    selSlot = null;
  }

  function onCard(id: string): void {
    if (locked) return;
    if (selSlot !== null) place(selSlot, id);
    else selCard = selCard === id ? null : id;
    sync(true);
  }

  function onSlot(i: number): void {
    if (locked) return;
    if (selCard !== null) place(i, selCard);
    else if (values[i] !== null) {
      values[i] = null;
      selSlot = null;
    } else selSlot = selSlot === i ? null : i;
    sync(true);
  }

  function sync(notify: boolean): void {
    slotBtns.forEach(({ b, s }, i) => {
      const v = values[i];
      b.replaceChildren(el('span', 'ezq-pz-slot__cap', s.caption), el('span', 'ezq-pz-slot__val', v ? label(v) : '…'));
      b.classList.toggle('ezq-pz-slot--filled', v !== null);
      b.classList.toggle('ezq-pz-slot--target', selCard !== null || selSlot === i);
      b.setAttribute('aria-label', `${s.caption}: ${v ? label(v) : 'пусто'}`);
      b.setAttribute('aria-pressed', String(selSlot === i));
      b.disabled = locked;
    });
    for (const [id, b] of cardBtns) {
      const used = values.includes(id);
      b.classList.toggle('ezq-pz-card--used', used);
      b.classList.toggle('ezq-pz-card--picked', selCard === id);
      b.setAttribute('aria-pressed', String(selCard === id));
      b.hidden = used;
      b.disabled = locked;
    }
    if (notify) o.onChange(values.filter((v) => v !== null).length, [...values]);
  }

  host.append(hint, slotsWrap, pool);
  sync(false);
  return {
    values: () => [...values],
    reset() {
      values.fill(null);
      selCard = null;
      selSlot = null;
      sync(true);
    },
    lock() {
      locked = true;
      selCard = null;
      selSlot = null;
      host.classList.add('ezq-pz--solved');
      sync(false);
    },
    destroy: () => host.replaceChildren(),
  };
}

export interface TokenLineOptions {
  tokens: Card[];
  placeholder: string;
  onChange(count: number): void;
}

/** Строка кода из токенов: тап по токену в колоде — дописать в конец, тап в строке — вернуть. */
export function createTokenLine(host: HTMLElement, o: TokenLineOptions): SlotBoard {
  const line: string[] = [];
  let locked = false;
  const lineEl = el('div', 'ezq-pz-tokenline');
  lineEl.setAttribute('role', 'group');
  lineEl.setAttribute('aria-label', 'Твой вызов функции');
  const pool = el('div', 'ezq-pz-pool');
  pool.setAttribute('role', 'group');
  pool.setAttribute('aria-label', 'Кусочки кода');
  const clear = button('ezq-btn ezq-pz-clear', 'Стереть');
  const label = (id: string): string => o.tokens.find((t) => t.id === id)?.label ?? id;
  const poolBtns = new Map<string, HTMLButtonElement>();
  for (const t of o.tokens) {
    const b = button('ezq-pz-card ezq-pz-card--token', t.label);
    b.addEventListener('click', () => {
      if (locked || line.includes(t.id)) return;
      line.push(t.id);
      sync(true);
    });
    poolBtns.set(t.id, b);
    pool.appendChild(b);
  }
  clear.addEventListener('click', () => {
    if (locked) return;
    line.length = 0;
    sync(true);
  });

  function sync(notify: boolean): void {
    lineEl.replaceChildren();
    if (line.length === 0) lineEl.appendChild(el('span', 'ezq-pz-tokenline__ph', o.placeholder));
    line.forEach((id, i) => {
      const b = button('ezq-pz-card ezq-pz-card--token ezq-pz-card--inline', label(id));
      b.setAttribute('aria-label', `${label(id)} — убрать`);
      b.disabled = locked;
      b.addEventListener('click', () => {
        if (locked) return;
        line.splice(i, 1);
        sync(true);
      });
      lineEl.appendChild(b);
    });
    for (const [id, b] of poolBtns) {
      b.hidden = line.includes(id);
      b.disabled = locked;
    }
    clear.disabled = locked || line.length === 0;
    if (notify) o.onChange(line.length);
  }

  host.append(lineEl, pool, clear);
  sync(false);
  return {
    values: () => [...line],
    reset() {
      line.length = 0;
      sync(true);
    },
    lock() {
      locked = true;
      host.classList.add('ezq-pz--solved');
      sync(false);
    },
    destroy: () => host.replaceChildren(),
  };
}
