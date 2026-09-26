// Мелкие DOM-помощники страницы куратора. Текст всегда кладётся через textContent.

export type Attrs = Record<string, string>;

/** Элемент с классом и (опционально) текстом. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string | number | null,
  attrs: Attrs = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function button(text: string, mod = '', attrs: Attrs = {}): HTMLButtonElement {
  return h('button', `ezq-verify-btn${mod ? ` ezq-verify-btn--${mod}` : ''}`, text, { type: 'button', ...attrs });
}

/** Строка сообщения под формой: пустой текст прячет её. */
export function setMessage(el: HTMLElement, text: string, kind: 'ok' | 'error' | 'muted' = 'muted'): void {
  el.textContent = text;
  el.className = `ezq-verify-msg ezq-verify-msg--${kind}`;
  el.hidden = !text;
}

/** Число с пробелами-разделителями тысяч: 100000 → «100 000». */
export function formatNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
