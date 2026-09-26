// Тестовый стенд EasyLab Bridge (история 80): модуль в iframe, форма EASYLAB_AUTH_INIT,
// журнал сообщений с временем и JSON, сброс сохранения модуля. Работает в `npm run dev` и `vite preview`.
import './parent-test.css';

const MODULE_URL = './index.html';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label', 'ezq-pt-field');
  l.append(el('span', 'ezq-pt-field__label', label), control);
  return l;
}

function time(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function mountParentTest(root: HTMLElement): void {
  root.classList.add('ezq-pt-root');
  root.textContent = '';

  const header = el('header', 'ezq-pt-header');
  header.append(
    el('h1', 'ezq-pt-title', 'EasyLab Bridge — тестовый стенд'),
    el('p', 'ezq-pt-sub', 'Модуль открыт во фрейме как на платформе easycode-lab.ru. Отправь AUTH_INIT и следи за событиями в журнале.'),
  );

  // ---- фрейм модуля
  const frameBox = el('section', 'ezq-pt-frame');
  const iframe = el('iframe', 'ezq-pt-frame__iframe');
  iframe.title = 'Модуль EasyLab Quest';
  iframe.src = MODULE_URL;
  iframe.allow = 'clipboard-write; autoplay';
  frameBox.appendChild(iframe);
  const moduleOrigin = new URL(MODULE_URL, location.href).origin;

  // ---- форма AUTH_INIT
  const side = el('section', 'ezq-pt-side');
  const form = el('form', 'ezq-pt-card');
  const sid = el('input', 'ezq-pt-input');
  sid.value = 'student-1024';
  sid.placeholder = 'studentId';
  const name = el('input', 'ezq-pt-input');
  name.value = 'Аня';
  name.placeholder = 'Имя';
  const theme = el('select', 'ezq-pt-input');
  for (const [v, t] of [['dark', 'тёмная'], ['light', 'светлая']]) {
    const o = el('option', '', t);
    o.value = v;
    theme.appendChild(o);
  }
  const auto = el('input', 'ezq-pt-check');
  auto.type = 'checkbox';
  auto.checked = true;
  const autoLabel = el('label', 'ezq-pt-auto');
  autoLabel.append(auto, document.createTextNode(' Отвечать на EASYLAB_READY автоматически'));
  const send = el('button', 'ezq-pt-btn ezq-pt-btn--main', 'Отправить AUTH_INIT');
  send.type = 'submit';
  const row = el('div', 'ezq-pt-fields');
  row.append(field('studentId', sid), field('Имя', name), field('Тема', theme));
  form.append(el('h2', 'ezq-pt-h2', 'EASYLAB_AUTH_INIT'), row, autoLabel, send);

  // ---- управление
  const tools = el('div', 'ezq-pt-tools');
  const reload = el('button', 'ezq-pt-btn', 'Перезагрузить модуль');
  const reset = el('button', 'ezq-pt-btn ezq-pt-btn--danger', 'Сбросить сохранение модуля');
  const clear = el('button', 'ezq-pt-btn', 'Очистить журнал');
  for (const b of [reload, reset, clear]) b.type = 'button';
  tools.append(reload, reset, clear);

  // ---- сводка последних событий
  const summary = el('div', 'ezq-pt-summary');
  const tile = (label: string): HTMLElement => {
    const t = el('div', 'ezq-pt-tile');
    const v = el('div', 'ezq-pt-tile__value', '—');
    t.append(v, el('div', 'ezq-pt-tile__label', label));
    summary.appendChild(t);
    return v;
  };
  const coinsV = tile('EasyCoins');
  const codeV = tile('Код EZ-XXXX');
  const scoreV = tile('Последний забег');
  const bestV = tile('Рекорд');

  // ---- журнал
  const logCard = el('div', 'ezq-pt-card ezq-pt-logcard');
  const logHead = el('div', 'ezq-pt-loghead');
  const counter = el('span', 'ezq-pt-counter', '0');
  logHead.append(el('h2', 'ezq-pt-h2', 'Журнал сообщений'), counter);
  const log = el('ol', 'ezq-pt-log');
  const emptyLog = el('li', 'ezq-pt-log__empty', 'Пока тихо — модуль пришлёт EASYLAB_READY после загрузки.');
  log.appendChild(emptyLog);
  logCard.append(logHead, log);

  side.append(form, tools, summary, logCard);
  const main = el('main', 'ezq-pt-main');
  main.append(frameBox, side);
  root.append(header, main);

  let count = 0;
  const addLog = (dir: 'in' | 'out', type: string, origin: string, data: unknown): void => {
    emptyLog.remove();
    count++;
    counter.textContent = String(count);
    const li = el('li', `ezq-pt-log__item ezq-pt-log__item--${dir}`);
    const meta = el('div', 'ezq-pt-log__meta');
    meta.append(
      el('span', 'ezq-pt-log__time', time()),
      el('span', 'ezq-pt-log__dir', dir === 'in' ? '← от модуля' : '→ в модуль'),
      el('span', 'ezq-pt-log__type', type),
      el('span', 'ezq-pt-log__origin', origin),
    );
    const pre = el('pre', 'ezq-pt-log__json');
    pre.textContent = JSON.stringify(data, null, 2);
    li.append(meta, pre);
    log.prepend(li);
  };

  const sendAuth = (): void => {
    const msg = { type: 'EASYLAB_AUTH_INIT', payload: { studentId: sid.value.trim(), name: name.value.trim(), theme: theme.value } };
    iframe.contentWindow?.postMessage(msg, moduleOrigin);
    addLog('out', msg.type, moduleOrigin, msg);
  };

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return;
    const data = e.data as { type?: unknown; payload?: Record<string, unknown> } | null;
    const type = typeof data?.type === 'string' ? data.type : '(без type)';
    addLog('in', type, e.origin, data);
    const p = data?.payload ?? {};
    if (type === 'EASYLAB_READY' && auto.checked) sendAuth();
    if (type === 'EASYLAB_QUEST_COMPLETED') {
      coinsV.textContent = `${String(p.coinsEarned)} / ${String(p.maxCoins)}`;
      codeV.textContent = String(p.verificationCode ?? '—');
    }
    if (type === 'EASYLAB_GAME_FINISHED') {
      scoreV.textContent = String(p.score ?? '—');
      bestV.textContent = String(p.highScore ?? '—');
      if (typeof p.verificationCode === 'string') codeV.textContent = p.verificationCode;
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendAuth();
  });
  reload.addEventListener('click', () => {
    iframe.src = MODULE_URL + '?t=' + Date.now();
  });
  reset.addEventListener('click', () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ezq_')) localStorage.removeItem(k);
      }
    } catch {
      /* storage недоступен */
    }
    for (const v of [coinsV, codeV, scoreV, bestV]) v.textContent = '—';
    addLog('out', 'Сохранение модуля сброшено', location.origin, { removed: 'localStorage ezq_*' });
    iframe.src = MODULE_URL + '?t=' + Date.now();
  });
  clear.addEventListener('click', () => {
    log.textContent = '';
    count = 0;
    counter.textContent = '0';
  });
}

const root = document.getElementById('ezq-parent-test');
if (root) mountParentTest(root);
