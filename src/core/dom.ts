// Общие DOM-помощники всех экранов и страниц (квест, аркада, рейтинг, куратор, стенд).
// Текст кладётся только через textContent — пользовательские строки не попадают в разметку.

export type Attrs = Record<string, string>;

/** Элемент с классом, (опционально) текстом и атрибутами. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string | number | null,
  attrs: Attrs = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** `<button type="button">` с классом ровно `className` и (опционально) обработчиком клика. */
export function button(className: string, text: string, onClick?: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
