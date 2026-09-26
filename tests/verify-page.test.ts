// @vitest-environment happy-dom
// Страница куратора (verify.html) на фейковом PostgREST: вход по секрету, поиск, отметка, поток, сезон.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountVerifyPage } from '../src/verify/page';
import { fakeServer, rpcError, type Handler } from './services/helpers';

const SECRET = 'curator-secret-42';

const card = (over: Record<string, unknown> = {}) => ({
  verification_code: 'EZ-AB2C',
  player_name: 'Аня',
  student_id: 'st-7',
  coins_earned: 58,
  rooms_solved: 4,
  completed_at: '2026-09-26T09:05:00+00:00', // 12:05 МСК
  is_awarded: false,
  awarded_at: null,
  possible_duplicate: false,
  ...over,
});

/** Сервер, где верен только SECRET. */
function server(extra: Record<string, Handler> = {}) {
  const guard = (h: Handler): Handler => (args, path) =>
    args?.p_secret === SECRET ? h(args, path) : rpcError('FORBIDDEN: bad secret', 400);
  const base: Record<string, Handler> = {
    curator_check: () => ({ body: true }),
    curator_recent: () => ({ body: [card()] }),
    curator_find: () => ({ body: null }),
    curator_leaderboard: () => ({ body: [] }),
    curator_winners: () => ({ body: [] }),
    ...extra,
  };
  const routes: Record<string, Handler> = {};
  for (const [k, h] of Object.entries(base)) routes[k] = guard(h);
  routes.get_season_info = () => ({ body: { title: 'Сезон 1', ends_at: null, daily_limit: 3000, is_closed: false } });
  return fakeServer(routes);
}

function mount(hash: string, srv = server()) {
  window.location.hash = hash;
  const root = document.createElement('div');
  root.className = 'ezq-verify-root';
  document.body.appendChild(root);
  const page = mountVerifyPage(root, { rest: srv.rest });
  cleanups.push(() => { page.destroy(); root.remove(); });
  return { root, srv };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
  window.location.hash = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const $ = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement | null;
const text = (root: HTMLElement) => root.textContent ?? '';

describe('verify.html — вход по секрету', () => {
  it('неверный секрет в ссылке → экран входа с понятной ошибкой; верный из формы → рабочий экран', async () => {
    const { root, srv } = mount('#k=wrong-secret');
    await vi.waitFor(() => expect(text(root)).toContain('Секрет не подошёл'));
    expect($(root, '.ezq-verify-login')).not.toBeNull();
    expect($(root, '.ezq-verify-search')).toBeNull();

    const input = $(root, '.ezq-verify-login input') as HTMLInputElement;
    input.value = SECRET;
    ($(root, '.ezq-verify-login form') as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect($(root, '.ezq-verify-search')).not.toBeNull());
    expect(srv.rpcCalls('curator_check').at(-1)?.args).toEqual({ p_secret: SECRET });
  });
});

async function search(root: HTMLElement, value: string) {
  await vi.waitFor(() => expect($(root, '.ezq-verify-search input')).not.toBeNull());
  ($(root, '.ezq-verify-search input') as HTMLInputElement).value = value;
  ($(root, '.ezq-verify-search form') as HTMLFormElement).requestSubmit();
}

describe('verify.html — поиск и отметка начисления', () => {
  it('код нормализуется, карточка показывает монеты, отметка уходит в RPC с верными аргументами', async () => {
    let awarded = false;
    const srv = server({
      curator_find: (a) => ({ body: a.p_code === 'EZ-AB2C' ? card({ possible_duplicate: true, is_awarded: awarded }) : null }),
      curator_set_awarded: (a) => {
        awarded = a.p_awarded;
        return { body: card({ is_awarded: awarded, awarded_at: awarded ? '2026-09-26T10:30:00Z' : null }) };
      },
    });
    const { root } = mount(`#k=${SECRET}`, srv);

    await search(root, ' ez-ab2c ');
    await vi.waitFor(() => expect($(root, '.ezq-verify-card')).not.toBeNull());
    expect(srv.rpcCalls('curator_find').at(-1)?.args).toEqual({ p_secret: SECRET, p_code: 'EZ-AB2C' });
    const c = $(root, '.ezq-verify-card')!;
    expect(text(c)).toContain('Квест пройден. Заработано: 58 EasyCoins');
    expect(text(c)).toContain('Аня');
    expect(text(c)).toContain('st-7');
    expect(text(c)).toContain('26.09.2026 12:05');
    expect(text(c)).toContain('Возможный дубль');
    expect(text(c)).toContain('Ожидает начисления');

    const mark = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Отметить коины как начисленные')!;
    mark.click();
    await vi.waitFor(() => expect(text($(root, '.ezq-verify-card')!)).toContain('Начислено 26.09 13:30'));
    expect(srv.rpcCalls('curator_set_awarded').at(-1)?.args).toEqual({ p_secret: SECRET, p_code: 'EZ-AB2C', p_awarded: true });

    const undo = [...$(root, '.ezq-verify-card')!.querySelectorAll('button')].find((b) => b.textContent === 'Отменить отметку')!;
    undo.click();
    await vi.waitFor(() => expect(srv.rpcCalls('curator_set_awarded').at(-1)?.args.p_awarded).toBe(false));

    // Секрет уходит только в теле RPC — ни в одном адресе запроса его нет.
    expect(srv.calls.every((c2) => !c2.path.includes(SECRET))).toBe(true);
  });

  it('неизвестный код → «не найден», мусор → подсказка о формате без запроса', async () => {
    const { root, srv } = mount(`#k=${SECRET}`);
    await search(root, 'EZ-ZZZZ');
    await vi.waitFor(() => expect(text($(root, '.ezq-verify-result')!)).toContain('EZ-ZZZZ не найден'));
    const before = srv.rpcCalls('curator_find').length;
    await search(root, 'hello');
    await vi.waitFor(() => expect(text($(root, '.ezq-verify-result')!)).toContain('EZ-8492'));
    expect(srv.rpcCalls('curator_find').length).toBe(before);
  });
});

describe('verify.html — поток последних прохождений', () => {
  it('обновляется по таймеру, стоит на скрытой вкладке, при сбое сети не стирает список; клик открывает карточку', async () => {
    let down = false;
    const srv = server({
      curator_recent: (a) => {
        if (down) return { networkDown: true };
        expect(a.p_limit).toBe(50);
        return { body: [card(), card({ verification_code: 'EZ-CD3F', player_name: 'Боря', coins_earned: 41, possible_duplicate: true })] };
      },
    });
    window.location.hash = `#k=${SECRET}`;
    const root = document.createElement('div');
    document.body.appendChild(root);
    const page = mountVerifyPage(root, { rest: srv.rest, refreshMs: 30 });
    cleanups.push(() => { page.destroy(); root.remove(); });

    const rows = () => root.querySelectorAll('.ezq-verify-recent tbody tr');
    await vi.waitFor(() => expect(rows().length).toBe(2));
    expect(text($(root, '.ezq-verify-recent')!)).toContain('Обновлено');
    expect(text(rows()[1] as HTMLElement)).toContain('возможный дубль');
    await vi.waitFor(() => expect(srv.rpcCalls('curator_recent').length).toBeGreaterThanOrEqual(3));

    // Скрытая вкладка — пауза.
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 40));
    const paused = srv.rpcCalls('curator_recent').length;
    await new Promise((r) => setTimeout(r, 150));
    expect(srv.rpcCalls('curator_recent').length).toBe(paused);

    // Сеть пропала — список остаётся, видна ошибка.
    down = true;
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(text($(root, '.ezq-verify-recent')!)).toContain('Нет связи'));
    expect(rows().length).toBe(2);

    (rows()[1] as HTMLElement).click();
    await vi.waitFor(() => expect(text($(root, '.ezq-verify-card')!)).toContain('EZ-CD3F'));
    expect(text($(root, '.ezq-verify-card')!)).toContain('Заработано: 41 EasyCoins');
  });
});

const entry = (over: Record<string, unknown> = {}) => ({
  rank: 1,
  verification_code: 'EZ-AB2C',
  player_name: 'Аня',
  score: 2400,
  runs_count: 3,
  is_hidden: false,
  created_at: '2026-09-26T09:00:00Z',
  ...over,
});

async function openSeasonTab(root: HTMLElement) {
  await vi.waitFor(() => expect($(root, '.ezq-verify-search')).not.toBeNull());
  const tab = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Рейтинг и сезон')!;
  tab.click();
  await vi.waitFor(() => expect($(root, '.ezq-verify-season')).not.toBeNull());
}

const btn = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;

describe('verify.html — вкладка «Рейтинг и сезон»', () => {
  it('полный рейтинг с кодами, имена только текстом, «Скрыть из рейтинга» / «Вернуть» уходят в RPC', async () => {
    let hidden = false;
    const srv = server({
      curator_leaderboard: () => ({
        body: [
          entry({ is_hidden: hidden, rank: hidden ? null : 1 }),
          entry({ rank: hidden ? 1 : 2, verification_code: 'EZ-CD3F', player_name: '<img src=x onerror=alert(1)>', score: 1200 }),
        ],
      }),
      curator_set_hidden: (a) => {
        hidden = a.p_hidden;
        return { body: true };
      },
    });
    const { root } = mount(`#k=${SECRET}`, srv);
    await openSeasonTab(root);

    const rows = () => [...root.querySelectorAll('.ezq-verify-season tbody tr')] as HTMLElement[];
    await vi.waitFor(() => expect(rows().length).toBe(2));
    expect(text(rows()[0])).toContain('EZ-AB2C');
    expect(text(rows()[0])).toContain('2\u00a0400');
    expect(text(rows()[1])).toContain('<img src=x onerror=alert(1)>');
    expect(root.querySelector('.ezq-verify-season img')).toBeNull();

    btn(rows()[0], 'Скрыть из рейтинга')!.click();
    await vi.waitFor(() => expect(btn(rows()[0] ?? root, 'Вернуть')).toBeDefined());
    expect(srv.rpcCalls('curator_set_hidden').at(-1)?.args).toEqual({ p_secret: SECRET, p_code: 'EZ-AB2C', p_hidden: true });
    expect(text(rows()[0])).toContain('скрыт');

    btn(rows()[0], 'Вернуть')!.click();
    await vi.waitFor(() => expect(srv.rpcCalls('curator_set_hidden').at(-1)?.args.p_hidden).toBe(false));
  });
});

describe('verify.html — настройки сезона и выход', () => {
  it('лимит проверяется на клиенте, отсчёт уходит в МСК, итоги — только после подтверждения', async () => {
    const winners = [
      { season_id: 1, season_title: 'Сезон 1', finished_at: '2026-09-26T15:00:00Z', place: 1, player_name: 'Аня', verification_code: 'EZ-AB2C', score: 2400 },
    ];
    const srv = server({
      curator_set_daily_limit: (a) => ({ body: a.p_limit }),
      curator_set_countdown: (a) => ({ body: { title: a.p_title, ends_at: a.p_ends_at, daily_limit: 3000, is_closed: false } }),
      curator_finish_season: () => ({
        body: { finished_season: 'Сезон 1', season: { title: 'Сезон 2', ends_at: null, daily_limit: 3000, is_closed: false }, winners },
      }),
    });
    const { root } = mount(`#k=${SECRET}`, srv);
    await openSeasonTab(root);
    const season = $(root, '.ezq-verify-season')!;
    const input = (id: string) => season.querySelector(`#${id}`) as HTMLInputElement;
    const submit = (id: string) => (input(id).closest('form') as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => expect(input('ezq-verify-limit').value).toBe('3000'));

    // Лимит вне 100..100 000 — ошибка без запроса.
    input('ezq-verify-limit').value = '50';
    submit('ezq-verify-limit');
    await vi.waitFor(() => expect(text(season)).toContain('от 100 до 100'));
    expect(srv.rpcCalls('curator_set_daily_limit').length).toBe(0);
    input('ezq-verify-limit').value = '5000';
    submit('ezq-verify-limit');
    await vi.waitFor(() => expect(srv.rpcCalls('curator_set_daily_limit').length).toBe(1));
    expect(srv.rpcCalls('curator_set_daily_limit')[0].args).toEqual({ p_secret: SECRET, p_limit: 5000 });

    // Отсчёт: время из поля — московское.
    input('ezq-verify-season-title').value = 'Осенний сезон';
    input('ezq-verify-season-ends').value = '2026-10-01T18:00';
    submit('ezq-verify-season-ends');
    await vi.waitFor(() => expect(srv.rpcCalls('curator_set_countdown').length).toBe(1));
    expect(srv.rpcCalls('curator_set_countdown')[0].args).toEqual({
      p_secret: SECRET,
      p_title: 'Осенний сезон',
      p_ends_at: '2026-10-01T18:00:00+03:00',
    });
    await vi.waitFor(() => expect(text(season)).toContain('01.10.2026 18:00'));

    // Итоги: отказ в подтверждении — ничего не уходит; согласие — RPC и победители на экране.
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    input('ezq-verify-next-title').value = 'Сезон 2';
    submit('ezq-verify-next-title');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(srv.rpcCalls('curator_finish_season').length).toBe(0);
    confirm.mockReturnValue(true);
    submit('ezq-verify-next-title');
    await vi.waitFor(() => expect(srv.rpcCalls('curator_finish_season').length).toBe(1));
    expect(srv.rpcCalls('curator_finish_season')[0].args).toEqual({ p_secret: SECRET, p_next_title: 'Сезон 2' });
    await vi.waitFor(() => expect(text($(root, '.ezq-verify-winners')!)).toContain('EZ-AB2C'));
    expect(text(season)).toContain('Начался «Сезон 2»');

    // «Выйти» — экран входа, секрет убран из адреса.
    btn(root, 'Выйти')!.click();
    await vi.waitFor(() => expect($(root, '.ezq-verify-login')).not.toBeNull());
    expect(window.location.hash).not.toContain(SECRET);
  });
});
