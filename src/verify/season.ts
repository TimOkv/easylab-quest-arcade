// Вкладка «Рейтинг и сезон»: отсчёт до итогов, дневной лимит, полный рейтинг с кодами,
// скрытие ников, подведение итогов и прошлые победители. Имена — только через textContent.
import { button, formatNumber, h, setMessage } from './dom';
import { formatMsk, fromMskInput, toMskInput } from './format';

export interface SeasonInfo {
  title: string;
  ends_at: string | null;
  daily_limit: number;
  is_closed: boolean;
}

/** Строка ответа `curator_leaderboard`. */
export interface BoardEntry {
  rank: number | null;
  verification_code: string;
  player_name: string;
  score: number;
  runs_count: number;
  is_hidden: boolean;
  created_at: string;
}

/** Строка ответа `curator_winners`. */
export interface WinnerRow {
  season_id: number | string;
  season_title: string;
  finished_at: string | null;
  place: number;
  player_name: string;
  verification_code: string;
  score: number;
}

export interface SeasonDeps {
  /** RPC куратора — секрет подставляется сам. */
  call<T>(name: string, args?: Record<string, unknown>): Promise<T>;
  /** Публичный RPC без секрета (get_season_info). */
  publicCall<T>(name: string): Promise<T>;
  confirm(message: string): boolean;
  errorText(e: unknown): string;
  /** Жива ли ещё панель (страница не уничтожена и куратор не вышел). */
  isAlive(): boolean;
}

export interface SeasonPanel {
  el: HTMLElement;
  refresh(): Promise<void>;
}

export const MIN_DAILY_LIMIT = 100;
export const MAX_DAILY_LIMIT = 100_000;
const MEDALS = ['🥇', '🥈', '🥉'];

export function buildSeasonPanel(deps: SeasonDeps): SeasonPanel {
  const { call, errorText } = deps;
  const el = h('div', 'ezq-verify-season');

  let season: SeasonInfo | null = null;
  let board: BoardEntry[] | null = null;
  let winners: WinnerRow[] | null = null;
  let loading = false;

  // ------------------------------------------------------------ сезон и отсчёт

  const seasonBox = h('section', 'ezq-verify-panel ezq-verify-season-info');
  const seasonNow = h('p', 'ezq-verify-season-now', 'Загружаем…', { role: 'status' });
  const cdForm = h('form', 'ezq-verify-form ezq-verify-grid');
  const titleInput = h('input', 'ezq-verify-input', null, {
    id: 'ezq-verify-season-title',
    type: 'text',
    maxlength: '64',
    autocomplete: 'off',
  });
  const endsInput = h('input', 'ezq-verify-input', null, { id: 'ezq-verify-season-ends', type: 'datetime-local' });
  const cdSave = h('button', 'ezq-verify-btn ezq-verify-btn--primary', 'Сохранить отсчёт', { type: 'submit' });
  const cdClear = button('Убрать дату', 'ghost');
  const cdMsg = h('p', 'ezq-verify-msg', null, { role: 'status' });
  cdMsg.hidden = true;
  const cdActions = h('div', 'ezq-verify-actions');
  cdActions.append(cdSave, cdClear);
  cdForm.append(
    field('Название сезона', titleInput),
    field('Итоги подводятся (время МСК)', endsInput),
    cdActions,
  );
  seasonBox.append(
    h('h2', 'ezq-verify-h2', 'Сезон и отсчёт до итогов'),
    seasonNow,
    h('p', 'ezq-verify-muted', 'Ученики видят в рейтинге таймер до этой даты. Когда время выйдет, очки перестают засчитываться — останется подвести итоги.'),
    cdForm,
    cdMsg,
  );

  async function saveCountdown(endsAt: string | null): Promise<void> {
    setMessage(cdMsg, '');
    cdSave.disabled = cdClear.disabled = true;
    try {
      const info = await call<SeasonInfo>('curator_set_countdown', { p_title: titleInput.value.trim(), p_ends_at: endsAt });
      if (!deps.isAlive()) return;
      season = info;
      paintSeason();
      setMessage(cdMsg, endsAt ? 'Сохранено. Ученики уже видят отсчёт.' : 'Дата убрана — отсчёт не показывается.', 'ok');
    } catch (e) {
      if (deps.isAlive()) setMessage(cdMsg, errorText(e), 'error');
    } finally {
      cdSave.disabled = cdClear.disabled = false;
    }
  }

  cdForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const raw = endsInput.value.trim();
    const endsAt = raw ? fromMskInput(raw) : null;
    if (raw && !endsAt) {
      setMessage(cdMsg, 'Не получилось прочитать дату. Выбери день и время в поле ещё раз.', 'error');
      return;
    }
    void saveCountdown(endsAt);
  });
  cdClear.addEventListener('click', () => {
    endsInput.value = '';
    void saveCountdown(null);
  });

  // ------------------------------------------------------------ дневной лимит

  const limitBox = h('section', 'ezq-verify-panel ezq-verify-limit');
  const limitForm = h('form', 'ezq-verify-form');
  const limitInput = h('input', 'ezq-verify-input ezq-verify-input--num', null, {
    id: 'ezq-verify-limit',
    type: 'number',
    inputmode: 'numeric',
    min: String(MIN_DAILY_LIMIT),
    max: String(MAX_DAILY_LIMIT),
    step: '1',
  });
  const limitSave = h('button', 'ezq-verify-btn ezq-verify-btn--primary', 'Сохранить лимит', { type: 'submit' });
  const limitRow = h('div', 'ezq-verify-row');
  limitRow.append(limitInput, limitSave);
  const limitMsg = h('p', 'ezq-verify-msg', null, { role: 'status' });
  limitMsg.hidden = true;
  limitForm.append(h('label', 'ezq-verify-label', 'Дневной лимит очков', { for: 'ezq-verify-limit' }), limitRow);
  limitBox.append(
    h('h2', 'ezq-verify-h2', 'Дневной лимит'),
    h('p', 'ezq-verify-muted', `Сколько очков ученик может заработать за день (от ${formatNumber(MIN_DAILY_LIMIT)} до ${formatNumber(MAX_DAILY_LIMIT)}). Лимит уравнивает шансы тех, кто играет меньше.`),
    limitForm,
    limitMsg,
  );

  limitForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const raw = limitInput.value.trim().replace(/\s/g, '');
    const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < MIN_DAILY_LIMIT || n > MAX_DAILY_LIMIT) {
      setMessage(limitMsg, `Лимит должен быть целым числом от ${formatNumber(MIN_DAILY_LIMIT)} до ${formatNumber(MAX_DAILY_LIMIT)}.`, 'error');
      return;
    }
    setMessage(limitMsg, '');
    limitSave.disabled = true;
    try {
      const saved = await call<number>('curator_set_daily_limit', { p_limit: n });
      if (!deps.isAlive()) return;
      const value = typeof saved === 'number' ? saved : n;
      if (season) season = { ...season, daily_limit: value };
      limitInput.value = String(value);
      setMessage(limitMsg, `Сохранено: ${formatNumber(value)} очков в день.`, 'ok');
    } catch (e) {
      if (deps.isAlive()) setMessage(limitMsg, errorText(e), 'error');
    } finally {
      limitSave.disabled = false;
    }
  });

  // ------------------------------------------------------------ рейтинг сезона

  const boardBox = h('section', 'ezq-verify-panel ezq-verify-board');
  const boardHead = h('div', 'ezq-verify-section-head');
  const reload = button('Обновить', 'ghost');
  reload.addEventListener('click', () => void refresh());
  boardHead.append(h('h2', 'ezq-verify-h2', 'Рейтинг текущего сезона'), reload);
  const boardMsg = h('p', 'ezq-verify-msg', null, { role: 'alert' });
  boardMsg.hidden = true;
  const boardBody = h('div', 'ezq-verify-board-body');
  boardBox.append(
    boardHead,
    h('p', 'ezq-verify-muted', 'Полный список с кодами. Неприличный ник можно скрыть — ученик пропадёт из общего рейтинга и увидит «Твоя запись скрыта куратором».'),
    boardMsg,
    boardBody,
  );

  function paintBoard(): void {
    if (board === null) {
      boardBody.replaceChildren(h('p', 'ezq-verify-muted', 'Загружаем…'));
      return;
    }
    if (!board.length) {
      boardBody.replaceChildren(h('p', 'ezq-verify-muted', 'В этом сезоне ещё никто не играл.'));
      return;
    }
    const wrap = h('div', 'ezq-verify-table-wrap');
    const table = h('table', 'ezq-verify-table');
    const thead = h('thead', 'ezq-verify-thead');
    const hr = h('tr', 'ezq-verify-tr');
    for (const [t, cls] of [
      ['Место', 'ezq-verify-num'],
      ['Имя', ''],
      ['Код', ''],
      ['Очки', 'ezq-verify-num'],
      ['Забегов', 'ezq-verify-num ezq-verify-col-id'],
      ['', ''],
    ]) hr.append(h('th', `ezq-verify-th ${cls}`.trim(), t, { scope: 'col' }));
    thead.append(hr);
    const tbody = h('tbody', 'ezq-verify-tbody');
    for (const e of board) tbody.append(boardRow(e));
    table.append(thead, tbody);
    wrap.append(table);
    boardBody.replaceChildren(wrap);
  }

  function boardRow(e: BoardEntry): HTMLElement {
    const tr = h('tr', `ezq-verify-tr${e.is_hidden ? ' ezq-verify-tr--hidden' : ''}`);
    const place = e.rank && !e.is_hidden ? `${e.rank <= 3 ? `${MEDALS[e.rank - 1]} ` : ''}${e.rank}` : '—';
    const name = h('td', 'ezq-verify-td');
    name.append(h('span', 'ezq-verify-name', e.player_name));
    if (e.is_hidden) name.append(h('span', 'ezq-verify-tag ezq-verify-tag--muted', 'скрыт'));
    const act = h('td', 'ezq-verify-td ezq-verify-td--act');
    const toggle = button(e.is_hidden ? 'Вернуть' : 'Скрыть из рейтинга', e.is_hidden ? 'ghost' : 'danger');
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      setMessage(boardMsg, '');
      try {
        await call<boolean>('curator_set_hidden', { p_code: e.verification_code, p_hidden: !e.is_hidden });
        if (!deps.isAlive()) return;
        await loadBoard();
      } catch (err) {
        if (!deps.isAlive()) return;
        toggle.disabled = false;
        setMessage(boardMsg, errorText(err), 'error');
      }
    });
    act.append(toggle);
    tr.append(
      h('td', 'ezq-verify-td ezq-verify-num ezq-verify-nowrap', place),
      name,
      h('td', 'ezq-verify-td ezq-verify-mono ezq-verify-nowrap', e.verification_code),
      h('td', 'ezq-verify-td ezq-verify-num', formatNumber(e.score)),
      h('td', 'ezq-verify-td ezq-verify-num ezq-verify-col-id', e.runs_count),
      act,
    );
    return tr;
  }

  async function loadBoard(): Promise<void> {
    try {
      const rows = await call<BoardEntry[] | null>('curator_leaderboard');
      if (!deps.isAlive()) return;
      board = Array.isArray(rows) ? rows : [];
      setMessage(boardMsg, '');
    } catch (e) {
      if (!deps.isAlive()) return;
      // Ошибка не стирает уже показанный рейтинг.
      setMessage(boardMsg, errorText(e), 'error');
    }
    paintBoard();
  }

  // ------------------------------------------------------------ подведение итогов

  const finishBox = h('section', 'ezq-verify-panel ezq-verify-finish');
  const finishForm = h('form', 'ezq-verify-form');
  const nextTitle = h('input', 'ezq-verify-input', null, {
    id: 'ezq-verify-next-title',
    type: 'text',
    maxlength: '64',
    autocomplete: 'off',
  });
  const finishBtn = h('button', 'ezq-verify-btn ezq-verify-btn--danger', 'Подвести итоги и начать новый сезон', { type: 'submit' });
  const finishMsg = h('p', 'ezq-verify-msg', null, { role: 'status' });
  finishMsg.hidden = true;
  finishForm.append(field('Название нового сезона', nextTitle), finishBtn);
  finishBox.append(
    h('h2', 'ezq-verify-h2', 'Подвести итоги'),
    h('p', 'ezq-verify-muted', 'ТОП-3 текущего сезона (без скрытых) попадёт в список победителей, а рейтинг начнётся с нуля. Отменить это нельзя.'),
    finishForm,
    finishMsg,
  );

  finishForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const current = season?.title ?? 'текущего сезона';
    const ok = deps.confirm(
      `Подвести итоги сезона «${current}»?\n\nТОП-3 попадёт в список победителей, рейтинг начнётся с нуля. Отменить это нельзя.`,
    );
    if (!ok) return;
    setMessage(finishMsg, '');
    finishBtn.disabled = true;
    try {
      const res = await call<{ finished_season: string; season: SeasonInfo | null; winners: WinnerRow[] | null }>(
        'curator_finish_season',
        { p_next_title: nextTitle.value.trim() },
      );
      if (!deps.isAlive()) return;
      nextTitle.value = '';
      if (res?.season) season = res.season;
      if (Array.isArray(res?.winners)) winners = res.winners;
      paintSeason();
      paintWinners();
      setMessage(
        finishMsg,
        `Итоги сезона «${res?.finished_season ?? current}» подведены. Начался «${res?.season?.title ?? 'новый сезон'}».`,
        'ok',
      );
      await loadBoard();
    } catch (e) {
      if (deps.isAlive()) setMessage(finishMsg, errorText(e), 'error');
    } finally {
      finishBtn.disabled = false;
    }
  });

  // ------------------------------------------------------------ прошлые победители

  const winnersBox = h('section', 'ezq-verify-panel ezq-verify-winners');
  const winnersMsg = h('p', 'ezq-verify-msg', null, { role: 'alert' });
  winnersMsg.hidden = true;
  const winnersBody = h('div', 'ezq-verify-winners-body');
  winnersBox.append(h('h2', 'ezq-verify-h2', 'Прошлые победители'), winnersMsg, winnersBody);

  function paintWinners(): void {
    if (winners === null) {
      winnersBody.replaceChildren(h('p', 'ezq-verify-muted', 'Загружаем…'));
      return;
    }
    if (!winners.length) {
      winnersBody.replaceChildren(h('p', 'ezq-verify-muted', 'Итоги ещё не подводились.'));
      return;
    }
    const groups = new Map<string, WinnerRow[]>();
    for (const w of winners) {
      const k = String(w.season_id);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(w);
    }
    const out: HTMLElement[] = [];
    for (const rows of groups.values()) {
      const g = h('div', 'ezq-verify-winners-group');
      g.append(
        h('h3', 'ezq-verify-h3', rows[0].season_title),
        h('p', 'ezq-verify-muted', `Итоги подведены ${formatMsk(rows[0].finished_at)} (МСК)`),
      );
      const ol = h('ol', 'ezq-verify-winners-list');
      for (const w of rows.sort((a, b) => a.place - b.place)) {
        const li = h('li', 'ezq-verify-winner');
        li.append(
          h('span', 'ezq-verify-winner-medal', MEDALS[w.place - 1] ?? String(w.place)),
          h('span', 'ezq-verify-name', w.player_name),
          h('span', 'ezq-verify-mono ezq-verify-muted', w.verification_code),
          h('span', 'ezq-verify-winner-score', `${formatNumber(w.score)} очк.`),
        );
        ol.append(li);
      }
      g.append(ol);
      out.push(g);
    }
    winnersBody.replaceChildren(...out);
  }

  async function loadWinners(): Promise<void> {
    try {
      const rows = await call<WinnerRow[] | null>('curator_winners');
      if (!deps.isAlive()) return;
      winners = Array.isArray(rows) ? rows : [];
      setMessage(winnersMsg, '');
    } catch (e) {
      if (!deps.isAlive()) return;
      setMessage(winnersMsg, errorText(e), 'error');
    }
    paintWinners();
  }

  // ------------------------------------------------------------ сезон: загрузка и отрисовка

  function paintSeason(): void {
    if (!season) return;
    const when = season.ends_at ? `итоги ${formatMsk(season.ends_at)} (МСК)` : 'дата итогов не назначена — отсчёт не показывается';
    seasonNow.replaceChildren('Сейчас идёт ', h('strong', '', `«${season.title}»`), `: ${when}.`);
    if (season.is_closed) {
      seasonNow.append(h('span', 'ezq-verify-tag ezq-verify-tag--warn', 'время вышло — подведи итоги'));
    }
    if (document.activeElement !== titleInput) titleInput.value = season.title;
    if (document.activeElement !== endsInput) endsInput.value = toMskInput(season.ends_at);
    if (document.activeElement !== limitInput) limitInput.value = String(season.daily_limit);
    nextTitle.placeholder = suggestNextTitle(season.title);
  }

  async function loadSeason(): Promise<void> {
    try {
      const info = await deps.publicCall<SeasonInfo | null>('get_season_info');
      if (!deps.isAlive()) return;
      if (info) {
        season = info;
        paintSeason();
      } else seasonNow.textContent = 'Активный сезон не найден — проверь, что supabase/schema.sql выполнен целиком.';
    } catch (e) {
      if (deps.isAlive() && !season) seasonNow.textContent = errorText(e);
    }
  }

  async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;
    reload.disabled = true;
    try {
      await Promise.all([loadSeason(), loadBoard(), loadWinners()]);
    } finally {
      loading = false;
      reload.disabled = false;
    }
  }

  paintBoard();
  paintWinners();
  el.append(seasonBox, limitBox, boardBox, finishBox, winnersBox);
  return { el, refresh };
}

function field(label: string, input: HTMLInputElement): HTMLElement {
  const wrap = h('div', 'ezq-verify-field');
  wrap.append(h('label', 'ezq-verify-label', label, { for: input.id }), input);
  return wrap;
}

/** «Сезон 3» → «Сезон 4»; иначе пусто (сервер назовёт сам). */
function suggestNextTitle(title: string): string {
  const m = /^(.*?)(\d+)\s*$/.exec(title);
  return m ? `${m[1]}${Number(m[2]) + 1}` : 'Например: Сезон 2';
}
