// Страница куратора (verify.html): вход по секрету, проверка кодов, поток прохождений, рейтинг и сезон.
// Все данные учеников выводятся только через textContent.
import { NetworkError, NotConfiguredError, RpcError, type RestClient } from '../services/rest';
import { normalizeVerificationCode } from '../core/rules';
import { formatMsk, formatMskClock, formatMskShort } from './format';
import { button, h } from './dom';
import { buildSeasonPanel, type SeasonPanel } from './season';

export interface VerifyPageDeps {
  rest: RestClient;
  /** Окно страницы (адрес с #k=, confirm, visibilitychange). По умолчанию — глобальное. */
  win?: Window;
  /** Период авто-обновления списка, мс. */
  refreshMs?: number;
}

export interface VerifyPage {
  destroy(): void;
}

/** Карточка прохождения — ответ `curator_find` / `curator_recent` / `curator_set_awarded`. */
export interface CompletionCard {
  verification_code: string;
  player_name: string;
  student_id: string | null;
  coins_earned: number;
  /** Максимум, из которого считались монеты: 75 у прохождений до обновления, 150 после. Нет у сервера до обновления schema.sql. */
  coins_max?: number;
  rooms_solved: number;
  completed_at: string;
  is_awarded: boolean;
  awarded_at: string | null;
  possible_duplicate: boolean;
}

/** «58 из 150»; без `coins_max` (сервер не обновлён) — только число. */
function coinsText(c: CompletionCard): string {
  return typeof c.coins_max === 'number' ? `${c.coins_earned} из ${c.coins_max}` : String(c.coins_earned);
}

/** Понятный текст ошибки для куратора. */
export function errorText(e: unknown): string {
  if (e instanceof NotConfiguredError) {
    return 'Сервер не настроен: добавь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в файл .env и пересобери сайт (см. docs/SUPABASE_SETUP.md).';
  }
  if (e instanceof NetworkError) return 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.';
  if (e instanceof RpcError) {
    if (e.code === 'FORBIDDEN') return 'Секрет не подошёл. Проверь ссылку или спроси секрет у администратора.';
    if (e.code === 'BAD_LIMIT') return 'Лимит должен быть от 100 до 100 000 очков.';
    return `Сервер ответил ошибкой: ${e.code}.`;
  }
  return 'Что-то пошло не так. Обнови страницу и попробуй ещё раз.';
}

function readSecretFromHash(win: Window): string | null {
  const m = /(?:^#|&)k=([^&]*)/.exec(win.location.hash);
  if (!m) return null;
  let s = m[1];
  try {
    s = decodeURIComponent(s);
  } catch {
    /* оставляем как есть */
  }
  s = s.trim();
  return s || null;
}

export function mountVerifyPage(root: HTMLElement, deps: VerifyPageDeps): VerifyPage {
  const { rest } = deps;
  const win = deps.win ?? window;
  const refreshMs = deps.refreshMs ?? 15_000;

  let secret: string | null = null;
  let loginToken = 0;
  let destroyed = false;
  const offs: Array<() => void> = [];

  const app = h('div', 'ezq-verify-app');
  const header = h('header', 'ezq-verify-header');
  const brand = h('div', 'ezq-verify-brand');
  brand.append(h('span', 'ezq-verify-logo', 'EasyLab Quest'), h('h1', 'ezq-verify-title', 'Кабинет куратора'));
  const logoutBtn = button('Выйти', 'ghost');
  logoutBtn.hidden = true;
  header.append(brand, logoutBtn);
  const main = h('main', 'ezq-verify-main');
  app.append(header, main);
  root.replaceChildren(app);

  // ---------------------------------------------------------------- RPC куратора

  async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const s = secret;
    try {
      return await rest.rpc<T>(name, { p_secret: s, ...args });
    } catch (e) {
      if (e instanceof RpcError && e.code === 'FORBIDDEN' && secret === s && secret !== null) {
        logout('Секрет больше не подходит — войди заново.');
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------- вход / выход

  function setHashSecret(s: string | null): void {
    const base = win.location.pathname + win.location.search;
    try {
      win.history.replaceState(null, '', s ? `${base}#k=${encodeURIComponent(s)}` : base);
    } catch {
      /* file:// или песочница — не критично */
    }
  }

  function renderLogin(error = '', prefill = ''): void {
    stopWork();
    logoutBtn.hidden = true;
    const box = h('section', 'ezq-verify-login ezq-verify-panel');
    box.append(
      h('h2', 'ezq-verify-h2', 'Вход для куратора'),
      h('p', 'ezq-verify-muted', 'Открой секретную ссылку вида verify.html#k=… или вставь секрет сюда.'),
    );
    const form = h('form', 'ezq-verify-form');
    const label = h('label', 'ezq-verify-label', 'Секрет куратора', { for: 'ezq-verify-secret' });
    const input = h('input', 'ezq-verify-input', null, {
      id: 'ezq-verify-secret',
      type: 'password',
      autocomplete: 'off',
      spellcheck: 'false',
      required: '',
    });
    input.value = prefill;
    const submit = h('button', 'ezq-verify-btn ezq-verify-btn--primary', 'Войти', { type: 'submit' });
    const row = h('div', 'ezq-verify-row');
    row.append(input, submit);
    form.append(label, row);
    const err = h('p', 'ezq-verify-error', error || null, { role: 'alert' });
    err.hidden = !error;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const s = input.value.trim();
      if (!s) return;
      void tryLogin(s);
    });
    box.append(form, err);
    main.replaceChildren(box);
    if (!prefill) input.focus();
  }

  function renderChecking(): void {
    main.replaceChildren(h('p', 'ezq-verify-loading ezq-verify-muted', 'Проверяем секрет…', { role: 'status' }));
  }

  async function tryLogin(s: string): Promise<void> {
    const token = ++loginToken;
    renderChecking();
    try {
      await rest.rpc<boolean>('curator_check', { p_secret: s });
      if (destroyed || token !== loginToken) return;
      secret = s;
      setHashSecret(s);
      renderWork();
    } catch (e) {
      if (destroyed || token !== loginToken) return;
      secret = null;
      const forbidden = e instanceof RpcError && e.code === 'FORBIDDEN';
      if (forbidden) setHashSecret(null);
      renderLogin(errorText(e), forbidden ? '' : s);
    }
  }

  function logout(message = ''): void {
    secret = null;
    loginToken++;
    setHashSecret(null);
    renderLogin(message);
  }

  logoutBtn.addEventListener('click', () => logout());

  // ---------------------------------------------------------------- рабочий экран

  let stopWorkFns: Array<() => void> = [];
  function stopWork(): void {
    stopWorkFns.splice(0).forEach((f) => f());
  }

  let season: SeasonPanel | null = null;

  function renderWork(): void {
    stopWork();
    logoutBtn.hidden = false;

    const codesPanel = h('div', 'ezq-verify-tabpanel', null, { role: 'tabpanel', id: 'ezq-verify-panel-codes' });
    codesPanel.append(buildSearch(), buildRecent());
    season = buildSeasonPanel({
      call,
      publicCall: (name) => rest.rpc(name, {}),
      confirm: (m) => win.confirm(m),
      errorText,
      isAlive: () => !destroyed && secret !== null,
    });
    const seasonPanel = h('div', 'ezq-verify-tabpanel', null, { role: 'tabpanel', id: 'ezq-verify-panel-season' });
    seasonPanel.append(season.el);
    seasonPanel.hidden = true;

    const tabs = h('div', 'ezq-verify-tabs', null, { role: 'tablist', 'aria-label': 'Разделы кабинета' });
    const tabCodes = button('Проверка кодов', 'tab', { role: 'tab', 'aria-controls': codesPanel.id });
    const tabSeason = button('Рейтинг и сезон', 'tab', { role: 'tab', 'aria-controls': seasonPanel.id });
    tabs.append(tabCodes, tabSeason);
    const select = (which: 'codes' | 'season') => {
      const isSeason = which === 'season';
      tabCodes.setAttribute('aria-selected', String(!isSeason));
      tabSeason.setAttribute('aria-selected', String(isSeason));
      codesPanel.hidden = isSeason;
      seasonPanel.hidden = !isSeason;
      if (isSeason && season) {
        // Первый заход грузит всё; дальше — свежий рейтинг при каждом открытии вкладки.
        void season.refresh();
      }
    };
    tabCodes.addEventListener('click', () => select('codes'));
    tabSeason.addEventListener('click', () => select('season'));
    select('codes');

    main.replaceChildren(tabs, codesPanel, seasonPanel);
    startRecent();
  }

  // ---------------------------------------------------------------- последние 50 прохождений

  let recent: CompletionCard[] = [];
  let recentUpdatedAt: number | null = null;
  let recentError = '';
  let recentInFlight = false;
  let recentBody: HTMLElement | null = null;
  let recentStatus: HTMLElement | null = null;
  let recentErr: HTMLElement | null = null;

  function buildRecent(): HTMLElement {
    const section = h('section', 'ezq-verify-recent ezq-verify-panel');
    const head = h('div', 'ezq-verify-section-head');
    const refresh = button('Обновить', 'ghost');
    refresh.addEventListener('click', () => void refreshRecent());
    head.append(h('h2', 'ezq-verify-h2', 'Последние прохождения'), refresh);
    recentStatus = h('p', 'ezq-verify-muted ezq-verify-updated', null, { role: 'status' });
    recentErr = h('p', 'ezq-verify-error', null, { role: 'alert' });
    recentBody = h('div', 'ezq-verify-recent-body');
    section.append(head, recentStatus, recentErr, recentBody);
    paintRecent();
    return section;
  }

  function paintRecent(): void {
    if (!recentBody || !recentStatus || !recentErr) return;
    recentStatus.textContent = recentUpdatedAt
      ? `Обновлено в ${formatMskClock(recentUpdatedAt)} (МСК) · список обновляется сам каждые ${Math.round(refreshMs / 1000)} с`
      : 'Загружаем…';
    recentErr.textContent = recentError;
    recentErr.hidden = !recentError;
    if (recentUpdatedAt === null) return;
    if (!recent.length) {
      recentBody.replaceChildren(h('p', 'ezq-verify-muted', 'Пока никто не прошёл квест.'));
      return;
    }
    const wrap = h('div', 'ezq-verify-table-wrap');
    const table = h('table', 'ezq-verify-table');
    const thead = h('thead', 'ezq-verify-thead');
    const hr = h('tr', 'ezq-verify-tr');
    for (const [t, cls] of [
      ['Время (МСК)', ''],
      ['Код', ''],
      ['Имя ученика', ''],
      ['ID', 'ezq-verify-col-id'],
      ['Коины', 'ezq-verify-num'],
      ['Статус', ''],
    ]) hr.append(h('th', `ezq-verify-th ${cls}`.trim(), t, { scope: 'col' }));
    thead.append(hr);
    const tbody = h('tbody', 'ezq-verify-tbody');
    for (const c of recent) {
      const tr = h('tr', `ezq-verify-tr ezq-verify-tr--click${c.is_awarded ? ' ezq-verify-tr--awarded' : ''}`, null, {
        tabindex: '0',
        title: 'Открыть карточку',
      });
      const name = h('td', 'ezq-verify-td');
      name.append(h('span', '', c.player_name));
      if (c.possible_duplicate) name.append(h('span', 'ezq-verify-tag ezq-verify-tag--warn', 'возможный дубль'));
      tr.append(
        h('td', 'ezq-verify-td ezq-verify-nowrap', formatMsk(c.completed_at)),
        h('td', 'ezq-verify-td ezq-verify-mono ezq-verify-nowrap', c.verification_code),
        name,
        h('td', 'ezq-verify-td ezq-verify-col-id ezq-verify-mono', c.student_id ?? '—'),
        h('td', 'ezq-verify-td ezq-verify-num ezq-verify-nowrap', coinsText(c)),
        h(
          'td',
          `ezq-verify-td ezq-verify-nowrap ${c.is_awarded ? 'ezq-verify-ok' : 'ezq-verify-pending'}`,
          c.is_awarded ? `Начислено ${formatMskShort(c.awarded_at)}` : 'Ожидает',
        ),
      );
      const open = () => {
        if (searchInput) searchInput.value = c.verification_code;
        showCard(c);
        resultBox?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    recentBody.replaceChildren(wrap);
  }

  async function refreshRecent(): Promise<void> {
    if (recentInFlight || secret === null) return;
    recentInFlight = true;
    try {
      const rows = await call<CompletionCard[] | null>('curator_recent', { p_limit: 50 });
      if (destroyed || secret === null) return;
      recent = Array.isArray(rows) ? rows : [];
      recentUpdatedAt = Date.now();
      recentError = '';
    } catch (e) {
      if (destroyed || secret === null) return;
      // Ошибка не стирает уже показанный список.
      recentError = `${errorText(e)} Показан список на момент последнего обновления.`;
    } finally {
      recentInFlight = false;
    }
    paintRecent();
  }

  function startRecent(): void {
    const doc = win.document;
    const tick = () => {
      if (doc.visibilityState === 'hidden') return;
      void refreshRecent();
    };
    const timer = setInterval(tick, refreshMs);
    const onVis = () => {
      if (doc.visibilityState !== 'hidden') void refreshRecent();
    };
    doc.addEventListener('visibilitychange', onVis);
    stopWorkFns.push(() => {
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVis);
    });
    void refreshRecent();
  }

  // ---------------------------------------------------------------- поиск и карточка

  let searchInput: HTMLInputElement | null = null;
  let resultBox: HTMLElement | null = null;
  let searchToken = 0;

  function buildSearch(): HTMLElement {
    const section = h('section', 'ezq-verify-search ezq-verify-panel');
    section.append(
      h('h2', 'ezq-verify-h2', 'Проверка кода ученика'),
      h('p', 'ezq-verify-muted', 'Вставь код, который прислал ученик, например EZ-8492.'),
    );
    const form = h('form', 'ezq-verify-form');
    const row = h('div', 'ezq-verify-row');
    const input = h('input', 'ezq-verify-input ezq-verify-input--code', null, {
      type: 'text',
      placeholder: 'EZ-8492',
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      'aria-label': 'Код ученика',
      maxlength: '16',
    });
    row.append(input, h('button', 'ezq-verify-btn ezq-verify-btn--primary', 'Найти', { type: 'submit' }));
    form.append(row);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      void findCode(input.value);
    });
    const result = h('div', 'ezq-verify-result', null, { 'aria-live': 'polite' });
    section.append(form, result);
    searchInput = input;
    resultBox = result;
    return section;
  }

  function showResultMessage(message: string, kind: 'muted' | 'error' | 'warn' = 'muted'): void {
    resultBox?.replaceChildren(h('p', `ezq-verify-${kind === 'muted' ? 'muted' : kind}`, message));
  }

  async function findCode(raw: string): Promise<void> {
    const token = ++searchToken;
    const code = normalizeVerificationCode(raw);
    if (!code) {
      showResultMessage('Это не похоже на код ученика. Код выглядит так: EZ-8492 — буквы EZ и ещё 4 символа.', 'warn');
      return;
    }
    if (searchInput) searchInput.value = code;
    showResultMessage('Ищем…');
    try {
      const found = await call<CompletionCard | null>('curator_find', { p_code: code });
      if (destroyed || token !== searchToken) return;
      if (!found) {
        showResultMessage(`Код ${code} не найден. Проверь, правильно ли ученик его прислал, или попроси прислать скриншот экрана с кодом.`, 'warn');
        return;
      }
      showCard(found);
    } catch (e) {
      if (destroyed || token !== searchToken || secret === null) return;
      showResultMessage(errorText(e), 'error');
    }
  }

  function showCard(c: CompletionCard): void {
    resultBox?.replaceChildren(buildCard(c));
  }

  function buildCard(c: CompletionCard): HTMLElement {
    const el = h('article', `ezq-verify-card${c.is_awarded ? ' ezq-verify-card--awarded' : ''}`);
    const status = h('p', 'ezq-verify-card-status');
    status.append('🟢 Квест пройден. Заработано: ', h('strong', 'ezq-verify-coins', coinsText(c)), ' EasyCoins');
    el.append(status);

    const dl = h('dl', 'ezq-verify-facts');
    const fact = (term: string, value: string, mono = false) => {
      dl.append(h('dt', 'ezq-verify-fact-term', term), h('dd', `ezq-verify-fact-value${mono ? ' ezq-verify-mono' : ''}`, value));
    };
    fact('Код', c.verification_code, true);
    fact('Имя ученика', c.player_name);
    fact('ID ученика', c.student_id ? c.student_id : '— (играл как гость)', !!c.student_id);
    fact('Пройден (МСК)', formatMsk(c.completed_at));
    fact('Начисление', c.is_awarded ? `Начислено ${formatMskShort(c.awarded_at)}` : 'Ожидает начисления');
    el.append(dl);

    if (c.possible_duplicate) {
      el.append(
        h(
          'p',
          'ezq-verify-warn ezq-verify-dup',
          '⚠️ Возможный дубль: есть другие прохождения с тем же именем или ID ученика. Проверь по списку ниже, не проходил ли ученик квест дважды.',
        ),
      );
    }

    const actions = h('div', 'ezq-verify-actions');
    const err = h('p', 'ezq-verify-error', null, { role: 'alert' });
    err.hidden = true;
    const act = (btn: HTMLButtonElement, awarded: boolean) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        err.hidden = true;
        try {
          const updated = await call<CompletionCard | null>('curator_set_awarded', {
            p_code: c.verification_code,
            p_awarded: awarded,
          });
          if (destroyed) return;
          if (!updated) {
            showResultMessage(`Код ${c.verification_code} не найден — возможно, запись удалили.`, 'warn');
            return;
          }
          if (el.isConnected) el.replaceWith(buildCard(updated));
          onCardChanged(updated);
        } catch (e) {
          if (destroyed || secret === null) return;
          btn.disabled = false;
          err.textContent = errorText(e);
          err.hidden = false;
        }
      });
    };
    if (c.is_awarded) {
      actions.append(h('span', 'ezq-verify-awarded', `✅ Начислено ${formatMskShort(c.awarded_at)}`));
      const undo = button('Отменить отметку', 'ghost');
      act(undo, false);
      actions.append(undo);
    } else {
      const mark = button('Отметить коины как начисленные', 'primary');
      act(mark, true);
      actions.append(mark);
    }
    el.append(actions, err);
    return el;
  }

  /** Карточка изменилась (отметка) — наследники обновляют связанные представления. */
  function onCardChanged(c: CompletionCard): void {
    const i = recent.findIndex((r) => r.verification_code === c.verification_code);
    if (i >= 0) {
      recent[i] = c;
      paintRecent();
    }
  }

  // ---------------------------------------------------------------- старт

  const onHash = () => {
    const s = readSecretFromHash(win);
    if (s && s !== secret) void tryLogin(s);
  };
  win.addEventListener('hashchange', onHash);
  offs.push(() => win.removeEventListener('hashchange', onHash));

  const initial = readSecretFromHash(win);
  if (!rest.isConfigured) renderLogin(errorText(new NotConfiguredError('Supabase is not configured')), initial ?? '');
  else if (initial) void tryLogin(initial);
  else renderLogin();

  return {
    destroy() {
      destroyed = true;
      stopWork();
      offs.splice(0).forEach((f) => f());
      root.replaceChildren();
    },
  };
}
