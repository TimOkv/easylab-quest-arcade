// Экран рейтинга аркады: призовая шапка, ТОП-10 сезона с бейджами, своя позиция и цель, дневной лимит,
// отсчёт до итогов, карточка последнего забега, скелетон/пусто/ошибка с кэшем, авто-обновление 20 с.
// Ники и имена — только через textContent.
import './leaderboard.css';
import type { Store } from '../core/state';
import type { LeaderboardService, PublicRow, RunResult, SeasonInfo, Standing, SubmitOutcome } from '../core/types';
import { PLAYER_NAME_MAX, validatePlayerName } from '../core/rules';
import type { Sfx } from '../services/sfx';
import type { Music } from '../services/music';
import { createMuteButton, createMusicButton } from '../app/shell';
import { button, el } from '../core/dom';

export interface LeaderboardScreenDeps {
  store: Store;
  sfx?: Sfx;
  /** Фоновая музыка: на рейтинге продолжается тема `arcade`, приглушённая. Нет — без музыки и кнопки 🎵. */
  music?: Music;
  service: LeaderboardService;
  lastRun: { result: RunResult; submit: Promise<SubmitOutcome> } | null;
  onPlayAgain(): void;
  onBack(): void;
}

export const REFRESH_MS = 20_000;
const PRIZES: Record<number, { badge: string; mod: string; tag: string }> = {
  1: { badge: '🥇', mod: 'gold', tag: 'Главный приз' },
  2: { badge: '🥈', mod: 'silver', tag: 'Призовой мерч' },
  3: { badge: '🥉', mod: 'bronze', tag: 'Призовой мерч' },
};

const nf = new Intl.NumberFormat('ru-RU');
const fmt = (n: number): string => nf.format(Math.round(n));
const pad = (n: number): string => String(n).padStart(2, '0');

/** «5 д 03 ч» / «4 ч 07 мин» / «12 мин 05 с». */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d} д ${pad(h)} ч`;
  if (h > 0) return `${h} ч ${pad(m)} мин`;
  return `${m} мин ${pad(s)} с`;
}

function formatAgo(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'обновлено только что';
  if (min < 60) return `обновлено ${min} мин назад`;
  return `обновлено ${Math.floor(min / 60)} ч назад`;
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Текст итога отправки забега для карточки. */
export function outcomeText(o: SubmitOutcome, run: RunResult): string {
  switch (o.kind) {
    case 'demo':
      return 'Демо-режим: рейтинг школы не подключён, очки остались только у тебя';
    case 'queued':
      return 'Забег ждёт интернета — отправим сами, как только появится связь';
    case 'error':
      return 'Упс, что-то пошло не так — забег не отправился в рейтинг. Попробуй сыграть ещё раз!';
    case 'rejected':
      switch (o.reason) {
        case 'TOO_SHORT': return 'Забег не засчитан — слишком короткий (меньше 5 секунд)';
        case 'CHEAT_SPEED': return 'Забег не засчитан — очки набраны нереально быстро';
        case 'SCORE_RANGE': return 'Забег не засчитан — такой счёт невозможен';
        case 'RATE_LIMIT': return 'Слишком много забегов подряд — передохни минутку';
        case 'BAD_NAME': return 'Этот ник нельзя показать в рейтинге — придумай другой';
        default: return 'Забег не засчитан — куратор пока не видит твой код. Напиши куратору';
      }
    case 'counted': {
      if (o.seasonClosed) return 'Сезон завершён — этот забег уже не идёт в рейтинг. Жди новый сезон!';
      if (o.counted <= 0) return '+0 — дневной лимит набран, возвращайся завтра!';
      const today = `(сегодня ${fmt(o.todayCounted)} / ${fmt(o.dailyLimit)})`;
      if (o.counted < run.score) return `+${fmt(o.counted)} в рейтинг сезона — дневной лимит набран ${today}`;
      return `+${fmt(o.counted)} в рейтинг сезона ${today}`;
    }
  }
}

export function mountLeaderboardScreen(host: HTMLElement, deps: LeaderboardScreenDeps): { destroy(): void } {
  const { store, service, sfx } = deps;
  let destroyed = false;
  const click = (): void => sfx?.play('click');

  const root = el('div', 'ezq-lb');
  const scroll = el('div', 'ezq-lb__scroll ezq-scroll');
  const panel = el('div', 'ezq-lb__panel');

  // ---- шапка
  const head = el('div', 'ezq-lb__head');
  const back = button('ezq-btn ezq-lb__back', '← Профиль', () => { click(); deps.onBack(); });
  const titles = el('div', 'ezq-lb__titles');
  const title = el('h1', 'ezq-lb__title', 'Рейтинг сезона');
  const seasonName = el('div', 'ezq-lb__season-name');
  titles.append(title, seasonName);
  head.append(back, titles);
  if (sfx) head.appendChild(createMuteButton(store, sfx));
  if (deps.music) {
    head.appendChild(createMusicButton(store));
    deps.music.duck(true);
    deps.music.play('arcade');
  }

  const prize = el('div', 'ezq-lb__prize');
  prize.append(
    el('span', 'ezq-lb__prize-icon', '🏆'),
    el('div', 'ezq-lb__prize-text', 'Удерживай позиции в ТОП-3 школы и получи фирменный мерч от Easycode!'),
  );
  const prizeNote = el('div', 'ezq-lb__prize-note', 'Очки всех засчитанных забегов складываются за сезон. Итоги подводит куратор.');
  prize.appendChild(prizeNote);

  const info = el('div', 'ezq-lb__info');
  const countdown = el('div', 'ezq-lb__countdown');
  const daily = el('div', 'ezq-lb__daily');
  info.appendChild(countdown);
  if (service.isConfigured) info.appendChild(daily); // лимит — серверный, в демо его нет

  // ---- карточка последнего забега
  let outcomeLine: HTMLElement | null = null;
  let runCard: HTMLElement | null = null;
  if (deps.lastRun) {
    const r = deps.lastRun.result;
    runCard = el('section', 'ezq-lb__run');
    const top = el('div', 'ezq-lb__run-head');
    top.appendChild(el('h2', 'ezq-lb__run-title', 'Последний забег'));
    if (r.isNewRecord) top.appendChild(el('span', 'ezq-lb__record', 'Новый рекорд!'));
    const stats = el('div', 'ezq-lb__stats');
    const stat = (label: string, value: string): HTMLElement => {
      const s = el('div', 'ezq-lb__stat');
      s.append(el('div', 'ezq-lb__stat-value', value), el('div', 'ezq-lb__stat-label', label));
      return s;
    };
    stats.append(stat('очков', fmt(r.score)), stat('время', formatDuration(r.durationSeconds)), stat('прыжков', fmt(r.jumpsCount)));
    outcomeLine = el('div', 'ezq-lb__outcome ezq-lb__outcome--wait', 'Отправляем в рейтинг…');
    const actions = el('div', 'ezq-lb__actions');
    actions.append(
      button('ezq-btn ezq-lb__again', '▶ Ещё раз', () => { click(); deps.onPlayAgain(); }),
      button('ezq-btn ezq-lb__profile', 'В квест-профиль', () => { click(); deps.onBack(); }),
    );
    runCard.append(top, stats, outcomeLine, actions);
  }

  // ---- таблица
  const board = el('section', 'ezq-lb__board');
  const status = el('div', 'ezq-lb__status');
  const list = el('ol', 'ezq-lb__list');
  const empty = el('div', 'ezq-lb__empty', 'Стань первым в рейтинге сезона!');
  board.append(status, list);
  if (service.isConfigured) board.appendChild(empty); // в демо «Стань первым» противоречит «рейтинг не подключён»

  const me = el('div', 'ezq-lb__me');

  panel.append(head, prize, info);
  if (runCard) panel.appendChild(runCard);
  panel.append(board);
  scroll.append(panel, me);
  root.appendChild(scroll);
  host.appendChild(root);

  // ---- состояние экрана
  let rows: PublicRow[] | null = store.get().leaderboard.cachedTop?.rows ?? null;
  let fetchedAt: number | null = store.get().leaderboard.cachedTop?.fetchedAt ?? null;
  let topError = false;
  let loading = service.isConfigured;
  let standing: Standing | null = null;
  let season: SeasonInfo | null = null;

  const myRank = (): number | null => standing?.rank ?? store.get().leaderboard.currentRank;

  /** Своя строка в ТОП-10: ник и сумма очков совпадают с позицией; при ничьей уточняем рангом, при сомнении — никакой. */
  function myRowIndex(data: PublicRow[]): number {
    const lb = store.get().leaderboard;
    const total = standing?.seasonTotal ?? lb.seasonTotal;
    const rank = myRank();
    if (!lb.playerName || total <= 0) return -1;
    const same = data.map((r, i) => (r.playerName === lb.playerName && r.score === total ? i : -1)).filter((i) => i >= 0);
    if (same.length === 1) return same[0];
    const byRank = same.filter((i) => i + 1 === rank);
    return byRank.length === 1 && same.length === 1 ? byRank[0] : -1;
  }

  function renderList(): void {
    list.textContent = '';
    const showSkeleton = loading && !rows;
    if (showSkeleton) {
      for (let i = 0; i < 10; i++) list.appendChild(el('li', 'ezq-lb__skel'));
    }
    const data = rows ?? [];
    const mine = myRowIndex(data.slice(0, 10));
    data.slice(0, 10).forEach((row, i) => {
      const place = i + 1;
      const prizeInfo = PRIZES[place];
      const li = el('li', `ezq-lb__row${prizeInfo ? ` ezq-lb__row--${prizeInfo.mod}` : ''}${mine === i ? ' ezq-lb__row--me' : ''}`);
      const placeEl = el('span', 'ezq-lb__place', prizeInfo ? prizeInfo.badge : String(place));
      if (prizeInfo) placeEl.setAttribute('aria-label', `${place} место`);
      const who = el('span', 'ezq-lb__who');
      const name = el('span', 'ezq-lb__name');
      name.textContent = row.playerName;
      who.appendChild(name);
      if (prizeInfo) who.appendChild(el('span', 'ezq-lb__tag', prizeInfo.tag));
      if (mine === i) who.appendChild(el('span', 'ezq-lb__you', 'это ты'));
      li.append(placeEl, who, el('span', 'ezq-lb__score', fmt(row.score)));
      list.appendChild(li);
    });
    empty.hidden = !service.isConfigured || showSkeleton || data.length > 0 || (topError && !rows);
  }

  function renderStatus(): void {
    status.textContent = '';
    status.className = 'ezq-lb__status';
    if (!service.isConfigured) {
      status.classList.add('ezq-lb__status--demo');
      status.textContent = 'Рейтинг школы появится после подключения сервера. Пока здесь только твоя статистика.';
      return;
    }
    if (!topError) return;
    status.classList.add('ezq-lb__status--error');
    const msg = rows
      ? `Нет связи — показан сохранённый рейтинг, ${fetchedAt ? formatAgo(Date.now() - fetchedAt) : 'обновлено давно'}`
      : 'Не удалось загрузить рейтинг — проверь интернет';
    status.append(el('span', 'ezq-lb__status-text', msg), button('ezq-btn ezq-lb__retry', 'Повторить', () => { click(); void refresh(); }));
  }

  function renderMe(): void {
    const s = store.get().leaderboard;
    me.className = 'ezq-lb__me';
    if (!service.isConfigured) {
      const a = store.get().arcade;
      me.textContent = a.highScore > 0 ? `Твой рекорд: ${fmt(a.highScore)} очков · забегов: ${fmt(a.totalRunsPlayed)}` : 'Сыграй первый забег — рекорд сохранится здесь!';
      return;
    }
    const rank = myRank();
    const total = standing?.seasonTotal ?? s.seasonTotal;
    const hidden = standing?.isHidden ?? s.isHidden;
    if (hidden) {
      me.textContent = 'Твоя запись скрыта куратором';
    } else if (rank === null || total <= 0) {
      me.textContent = 'Сыграй забег — и ты появишься в рейтинге!';
    } else if (rank <= 10) {
      me.classList.add('ezq-lb__me--top');
      me.textContent = `Ты — ${rank}-й, ${fmt(total)} очков. ${rank <= 3 ? 'Ты на призовом месте — удержи его!' : 'Ты в ТОП-10 — до призов рукой подать!'}`;
    } else {
      const gap = standing?.gapToTop10;
      me.textContent = `Ты — ${rank}-й, ${fmt(total)} очков.${gap != null ? ` До ТОП-10 — ${fmt(gap)}` : ''}`;
    }
  }

  function renderInfo(): void {
    const s = store.get().leaderboard;
    seasonName.textContent = season?.title ?? '';
    seasonName.hidden = !season?.title;
    daily.hidden = !service.isConfigured;
    const today = standing?.todayCounted ?? s.todayCounted;
    const limit = standing?.dailyLimit ?? season?.dailyLimit ?? s.dailyLimit;
    daily.textContent = `Сегодня в рейтинг: ${fmt(today)} / ${fmt(limit)}`;
    renderCountdown();
  }

  function renderCountdown(): void {
    countdown.className = 'ezq-lb__countdown';
    const endsAt = season?.endsAt ? Date.parse(season.endsAt) : NaN;
    const left = Number.isFinite(endsAt) ? endsAt - Date.now() : NaN;
    if (season?.isClosed || left <= 0) {
      countdown.hidden = false;
      countdown.classList.add('ezq-lb__countdown--closed');
      countdown.textContent = 'Сезон завершён, итоги подводятся. Новые забеги пока не идут в рейтинг — жди следующий сезон!';
    } else if (Number.isFinite(left)) {
      countdown.hidden = false;
      countdown.textContent = `⏳ Итоги сезона через ${formatCountdown(left)}`;
    } else {
      countdown.hidden = true;
    }
  }

  function renderAll(): void {
    renderList();
    renderStatus();
    renderMe();
    renderInfo();
  }

  let refreshing: Promise<void> | null = null;
  function refresh(): Promise<void> {
    if (!service.isConfigured) return Promise.resolve();
    if (refreshing) return refreshing;
    loading = true;
    renderList();
    refreshing = (async () => {
      const [t, st, se] = await Promise.allSettled([service.fetchTop(), service.fetchStanding(), service.fetchSeason()]);
      if (destroyed) return;
      loading = false;
      if (t.status === 'fulfilled') {
        rows = t.value;
        fetchedAt = Date.now();
        topError = false;
      } else {
        const cache = store.get().leaderboard.cachedTop;
        if (cache) {
          rows = cache.rows;
          fetchedAt = cache.fetchedAt;
        }
        topError = true;
      }
      if (st.status === 'fulfilled') standing = st.value;
      if (se.status === 'fulfilled' && se.value) season = se.value;
      renderAll();
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  // ---- смена ника при BAD_NAME
  let dialog: HTMLElement | null = null;
  function openRenameDialog(): void {
    if (dialog || destroyed) return;
    dialog = el('div', 'ezq-lb__dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const form = el('form', 'ezq-lb__dialog-box');
    form.noValidate = true;
    const input = el('input', 'ezq-lb__input');
    input.type = 'text';
    input.maxLength = PLAYER_NAME_MAX;
    input.value = store.get().leaderboard.playerName;
    input.setAttribute('aria-label', 'Новый ник');
    const err = el('p', 'ezq-lb__error');
    err.setAttribute('role', 'alert');
    const save = el('button', 'ezq-btn ezq-lb__save', 'Сохранить');
    save.type = 'submit';
    const cancel = button('ezq-btn ezq-lb__cancel', 'Потом', () => closeDialog());
    const row = el('div', 'ezq-lb__actions');
    row.append(save, cancel);
    form.append(
      el('h2', 'ezq-lb__dialog-title', 'Придумай другой ник'),
      el('p', 'ezq-lb__dialog-text', `Этот ник нельзя показать в рейтинге. Нужно 2–${PLAYER_NAME_MAX} символов, без грубых слов.`),
      input, err, row,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = validatePlayerName(input.value);
      if (!v.ok) {
        err.textContent = v.message;
        return;
      }
      click();
      store.update((d) => { d.leaderboard.playerName = v.value; });
      closeDialog();
      resend();
    });
    dialog.appendChild(form);
    root.appendChild(dialog);
    input.focus();
  }
  /** Отправить очередь заново (после смены ника); сбой — видимое ожидание с «Повторить», а не вечное «Отправляем…». */
  let resending = false;
  function resend(): void {
    if (resending) return; // «Повторить» во время отправки ничего не запускает
    resending = true;
    setOutcome('Отправляем забег с новым ником…', 'wait');
    void service.flushQueue().finally(() => { resending = false; }).then(() => {
      if (destroyed || !deps.lastRun) return;
      const lr = store.get().arcade.lastRun;
      const counted = lr && lr.runId === deps.lastRun.result.runId ? lr.countedScore : null;
      if (counted !== null) setOutcome(`+${fmt(counted)} в рейтинг сезона`, 'ok');
      else setOutcome('Забег ждёт отправки — попробуем ещё раз чуть позже', 'wait', resend);
      void refresh();
    }, (e: unknown) => {
      if (destroyed) return;
      console.error('[ezq] flushQueue', e);
      setOutcome('Не получилось отправить забег — он сохранён, попробуй ещё раз', 'wait', resend);
    });
  }
  function closeDialog(): void {
    dialog?.remove();
    dialog = null;
  }

  function setOutcome(text: string, mod: 'ok' | 'warn' | 'wait', retry?: () => void): void {
    if (!outcomeLine) return;
    outcomeLine.className = `ezq-lb__outcome ezq-lb__outcome--${mod}`;
    outcomeLine.textContent = text;
    if (retry) outcomeLine.append(' ', button('ezq-btn ezq-lb__retry', 'Повторить', () => { click(); retry(); }));
  }

  if (deps.lastRun) {
    const run = deps.lastRun.result;
    deps.lastRun.submit.then(
      (o) => {
        if (destroyed) return;
        const ok = o.kind === 'counted' && o.counted > 0 && !o.seasonClosed;
        setOutcome(outcomeText(o, run), ok ? 'ok' : o.kind === 'queued' ? 'wait' : 'warn');
        if (o.kind === 'rejected' && o.reason === 'BAD_NAME') openRenameDialog();
        if (o.kind === 'counted') void refresh();
      },
      () => setOutcome(outcomeText({ kind: 'queued' }, run), 'wait'),
    );
  }

  renderAll();
  void refresh();
  const refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
  const clockTimer = setInterval(() => {
    renderCountdown();
    if (topError) renderStatus();
  }, 1000);

  return {
    destroy() {
      destroyed = true;
      clearInterval(refreshTimer);
      clearInterval(clockTimer);
      closeDialog();
      root.remove();
    },
  };
}
