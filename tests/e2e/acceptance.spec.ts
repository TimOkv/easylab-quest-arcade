// Приёмка (таск 07, раздел 3 брифа): собранная сборка через `vite preview`, Supabase замокан перехватом /rest/v1/*.
// Ожидаемые монеты посчитаны вручную по таблице «Монеты»: у каждой из двух загадок комнаты пул комнаты
//   {1:[10,7,5], 2:[15,11,8], 3:[20,14,10], 4:[30,22,15]}, индекс = попытки−1 (макс. 3), вторая подсказка → 0.
//   Вторая загадка каждой комнаты в сценариях решается сразу: +10 / +15 / +20 / +30.
import { test, expect, type Page } from 'playwright/test';
import { installSupabaseMock, MOCK_URL, DEMO_URL, CURATOR_SECRET, PRIOR_SEASON, type MockDb } from './support/supabase-mock';
import { playQuest, playRun, saveOf, shot, expectNoHorizontalScroll, type QuestPlan } from './support/flow';

const CODE_RE = /^EZ-[2-9A-HJ-NP-Z]{4}$/;

const VIEWPORTS = [
  {
    name: 'desktop',
    use: { viewport: { width: 1440, height: 900 } },
    // 1: одна ошибка → 7+10; 2: две ошибки + подсказка 1 → 3-я попытка → 8+15; 3: сразу → 20+20; 4: сразу → 30+30. Итого 140.
    plan: { room1Wrong: 1, room2Wrong: 2, room2Hint1: true, room3Wrong: 0, room3Hints: 0 } as QuestPlan,
    rooms: [17, 23, 40, 60],
    total: 140,
  },
  {
    name: 'mobile',
    // Телефон в горизонтали: в вертикали квест просит повернуть телефон (проверка — ниже).
    use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    // 1: сразу → 10+10; 2: сразу → 15+15; 3: ошибка + обе подсказки → 0+20; 4: сразу → 30+30. Итого 130.
    plan: { room1Wrong: 0, room2Wrong: 0, room2Hint1: false, room3Wrong: 1, room3Hints: 2 } as QuestPlan,
    rooms: [20, 30, 20, 60],
    total: 130,
  },
] as const;

const rpcCalls = (db: MockDb, name: string) => db.calls.filter((c) => c.name === name);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use(vp.use);
    // Квест проходится ходьбой через 4 комнаты и 3 двери — плюс забег в аркаде.
    test.describe.configure({ timeout: 240_000 });

    test('квест с ошибками → монеты по формуле, триумф с EZ-кодом, реестр куратора; перезагрузка → аркада; забег → рейтинг', async ({ page, context }) => {
      const db = await installSupabaseMock(context);
      const errors = collectErrors(page);
      await page.goto(MOCK_URL);

      await playQuest(page, 'Тимофей', vp.plan, {
        onRoom: async (tag) => shot(page, `quest-${tag}-${vp.name}`),
        eachRoom: async () => { if (vp.name === 'mobile') await expectNoHorizontalScroll(page); },
        onWalk: async (tag) => shot(page, `${tag}-${vp.name}`, 'walk', tag === 'door-wipe' ? 0 : 400),
      });

      // ---- триумф: фактические монеты и личный ID
      const triumph = page.locator('.ezq-triumph');
      await expect(triumph.locator('.ezq-triumph__lead')).toHaveText(`Ты заработал ${vp.total} EasyCoins из 150 возможных!`);
      await expect(triumph.locator('.ezq-triumph__room-coins')).toHaveText(vp.rooms.map((c, i) => `${c} / ${[20, 30, 40, 60][i]}`));
      const code = (await triumph.locator('.ezq-triumph__code').textContent())!.trim();
      expect(code).toMatch(CODE_RE);
      await expect(triumph.getByRole('button', { name: 'Скопировать личный ID для куратора' })).toBeVisible();
      await expect(triumph.getByRole('button', { name: 'Сыграть в Аркаду и войти в ТОП-3!' })).toBeVisible();
      // авто-учёт куратора: запись ушла в реестр с фактическими монетами
      await expect(triumph.locator('.ezq-triumph__sync--ok')).toBeVisible({ timeout: 10_000 });
      expect(rpcCalls(db, 'register_quest_completion')).toHaveLength(1);
      expect(db.completions.get(code)).toMatchObject({ coins_earned: vp.total, player_name: 'Тимофей', rooms_solved: 4 });
      if (vp.name === 'mobile') await expectNoHorizontalScroll(page);
      await shot(page, `triumph-${vp.name}`);

      let save = await saveOf(page);
      expect(save.quest).toMatchObject({ isCompleted: true, totalCoinsEarned: vp.total, verificationCode: code, isSyncedWithCurator: true });
      expect([1, 2, 3, 4].map((n) => save.quest.rooms[n].earnedCoins)).toEqual(vp.rooms);
      expect(save.arcade.isUnlocked).toBe(true);

      // ---- перезагрузка: сразу аркада, квест недоступен, код и монеты на месте
      await page.reload();
      const card = page.locator('.ezq-arcade__card');
      await expect(card).toBeVisible();
      await expect(card).toContainText(code);
      await expect(card).toContainText(`Заработано ${vp.total} из 150`);
      await expect(page.locator('.ezq-intro, .ezq-qpanel, .ezq-triumph, .ezq-qobj')).toHaveCount(0);
      await shot(page, `arcade-profile-${vp.name}`);
      // даже подмена сохранения на «экран квеста» не открывает квест
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('ezq_save_v1')!);
        s.navigation.currentScreen = 'quest';
        localStorage.setItem('ezq_save_v1', JSON.stringify(s));
      });
      await page.reload();
      await expect(card).toBeVisible();
      await expect(page.locator('.ezq-intro, .ezq-qpanel, .ezq-qobj')).toHaveCount(0);
      save = await saveOf(page);
      expect(save.quest.totalCoinsEarned).toBe(vp.total);
      expect(save.quest.verificationCode).toBe(code);
      expect(rpcCalls(db, 'register_quest_completion')).toHaveLength(1); // монеты в реестре не удвоились

      // ---- забег → рейтинг
      await playRun(page, page, { onPlaying: () => shot(page, `arcade-game-${vp.name}`) });
      save = await saveOf(page);
      const run = save.arcade.lastRun;
      expect(run.durationSeconds).toBeGreaterThanOrEqual(5);
      const submits = rpcCalls(db, 'submit_arcade_score');
      expect(submits).toHaveLength(1);
      expect(submits[0].args).toMatchObject({ p_code: code, p_score: run.score, p_time_spent: Math.floor(run.durationSeconds), p_player_name: 'Тимофей' });

      const lb = page.locator('.ezq-lb');
      await expect(lb.locator('.ezq-lb__prize-text')).toHaveText('Удерживай позиции в ТОП-3 школы и получи фирменный мерч от Easycode!');
      const rows = lb.locator('.ezq-lb__row');
      await expect(rows).toHaveCount(10);
      await expect(rows.nth(0)).toHaveClass(/ezq-lb__row--gold/);
      await expect(rows.nth(0)).toContainText('Главный приз');
      await expect(rows.nth(1)).toHaveClass(/ezq-lb__row--silver/);
      await expect(rows.nth(2)).toHaveClass(/ezq-lb__row--bronze/);
      await expect(rows.nth(1)).toContainText('Призовой мерч');
      await expect(rows.nth(3)).not.toHaveClass(/ezq-lb__row--(gold|silver|bronze)/);
      const me = lb.locator('.ezq-lb__row--me');
      await expect(me).toHaveCount(1);
      await expect(me).toContainText('Тимофей');
      await expect.poll(async () => (await me.textContent())!.replace(/\s/g, '')).toContain(String(PRIOR_SEASON + run.score));
      if (vp.name === 'mobile') await expectNoHorizontalScroll(page);
      await me.scrollIntoViewIfNeeded();
      await shot(page, `leaderboard-top10-${vp.name}`);

      // ---- рекорд переживает перезагрузку
      await page.reload();
      await expect(card).toBeVisible();
      save = await saveOf(page);
      expect(save.arcade.highScore).toBe(run.score);
      expect(save.arcade.totalRunsPlayed).toBe(1);

      // ---- кабинет куратора: поиск по коду показывает фактические монеты
      const verify = await context.newPage();
      await verify.goto(`${MOCK_URL}verify.html#k=${CURATOR_SECRET}`);
      await verify.locator('.ezq-verify-input--code').fill(code);
      await verify.getByRole('button', { name: 'Найти' }).click();
      const result = verify.locator('.ezq-verify-result');
      await expect(result).toContainText(code);
      await expect(result).toContainText(String(vp.total));
      await expect(result).toContainText('Тимофей');
      if (vp.name === 'desktop') await shot(verify, 'curator');

      expect(errors).toEqual([]);
    });

    test('стенд parent_test.html получает EASYLAB_QUEST_COMPLETED с точными монетами и EASYLAB_GAME_FINISHED', async ({ page, context }) => {
      const db = await installSupabaseMock(context);
      await page.goto(`${MOCK_URL}parent_test.html`);
      const frame = page.frameLocator('.ezq-pt-frame__iframe');
      const logItem = (type: string) =>
        page.locator('.ezq-pt-log__item--in').filter({ has: page.locator('.ezq-pt-log__type', { hasText: new RegExp(`^${type}$`) }) });
      const payloadOf = async (type: string) => JSON.parse((await logItem(type).first().locator('.ezq-pt-log__json').textContent())!);

      // READY → AUTH_INIT (стенд отвечает сам) → имя подставилось в квест
      await expect(logItem('EASYLAB_READY')).toHaveCount(1);
      await expect(page.locator('.ezq-pt-log__item--out .ezq-pt-log__type', { hasText: 'EASYLAB_AUTH_INIT' })).toHaveCount(1);
      await expect(frame.locator('.ezq-intro__input')).toHaveValue('Аня');

      // 1: ошибка → 7 + 10; 2–4 сразу → 30 + 40 + 60. Итого 147.
      await playQuest(frame, null, { room1Wrong: 1, room2Wrong: 0, room2Hint1: false, room3Wrong: 0, room3Hints: 0 });
      const code = (await frame.locator('.ezq-triumph__code').textContent())!.trim();
      expect(code).toMatch(CODE_RE);

      await expect(logItem('EASYLAB_QUEST_COMPLETED')).toHaveCount(1);
      const qc = await payloadOf('EASYLAB_QUEST_COMPLETED');
      expect(qc).toMatchObject({ source: 'ezq', version: 1, type: 'EASYLAB_QUEST_COMPLETED' });
      expect(qc.payload).toMatchObject({ coinsEarned: 147, maxCoins: 150, verificationCode: code, studentId: 'student-1024' });
      expect(qc.payload.rooms.map((r: { earnedCoins: number }) => r.earnedCoins)).toEqual([17, 30, 40, 60]);
      expect(qc.payload.puzzles).toHaveLength(8);
      expect(Number.isNaN(Date.parse(qc.payload.completedAt))).toBe(false);
      await expect(page.locator('.ezq-pt-tile__value').nth(0)).toHaveText('147 / 150');
      await expect(page.locator('.ezq-pt-tile__value').nth(1)).toHaveText(code);
      await expect.poll(() => db.completions.get(code)?.student_id).toBe('student-1024');

      // в аркаду → забег → EASYLAB_GAME_FINISHED с рекордом
      await frame.getByRole('button', { name: 'Сыграть в Аркаду и войти в ТОП-3!' }).click();
      await playRun(page, frame);
      await expect(logItem('EASYLAB_GAME_FINISHED')).toHaveCount(1, { timeout: 15_000 });
      const run = (await saveOf(page, frame)).arcade.lastRun;
      const gf = await payloadOf('EASYLAB_GAME_FINISHED');
      expect(gf.payload).toEqual({
        score: run.score,
        highScore: run.score,
        seasonTotal: PRIOR_SEASON + run.score,
        durationSeconds: run.durationSeconds,
        jumpsCount: run.jumpsCount,
        verificationCode: code,
      });
      await expect(page.locator('.ezq-pt-tile__value').nth(2)).toHaveText(String(run.score));
      await shot(page, `parent-test-${vp.name}`);
    });
  });
}

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

test.describe('mobile, демо-режим без Supabase', () => {
  test.use({ ...VIEWPORTS[1].use, viewport: PORTRAIT });
  test.describe.configure({ timeout: 240_000 });

  test('телефон в вертикали: квест просит повернуть телефон и стоит на паузе; в горизонтали — играется', async ({ page }) => {
    await page.goto(DEMO_URL);
    const rotate = page.locator('.ezq-qrotate');
    await expect(rotate).toBeVisible();
    await expect(rotate).toContainText('Поверни телефон');
    await shot(page, 'rotate-portrait', 'walk');
    await page.setViewportSize(LANDSCAPE);
    await expect(rotate).toBeHidden();
    await expect(page.locator('.ezq-intro__input')).toBeVisible();
    await page.locator('.ezq-intro__input').fill('Маша');
    await page.locator('.ezq-intro__start').click();
    // пауза: в вертикали Изик не идёт, после поворота — доходит
    const room = page.locator('.ezq-qhud__room');
    await page.setViewportSize(PORTRAIT);
    await expect(rotate).toBeVisible();
    await page.setViewportSize(LANDSCAPE);
    await expect(room).toHaveText('Комната 1 из 4 · Спальня');
    await page.locator('.ezq-qobj[data-puzzle="var_assign"]').click(); // шкаф далеко: идти ≈ 3 с
    await page.setViewportSize(PORTRAIT);
    await page.waitForTimeout(1500);
    await expect(page.locator('.ezq-qact__go')).toHaveCount(0);
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('.ezq-qact__go')).toBeVisible({ timeout: 10_000 });
  });

  test('двойной тап и свайпы не зумят и не прокручивают; демо-рейтинг без сервера', async ({ page, context }) => {
    const errors = collectErrors(page);
    const hits: string[] = [];
    await context.route('**/rest/v1/**', (r) => { hits.push(r.request().url()); return r.abort(); });
    await page.goto(DEMO_URL);
    await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /user-scalable=no/);
    await page.evaluate(() => { (window as any).__ezqMarker = 1; });
    const cdp = await context.newCDPSession(page);

    const gestures = async (where: string) => {
      const box = await page.locator(where).first().boundingBox();
      const x = Math.round(box!.x + box!.width / 2);
      const y = Math.round(box!.y + Math.min(box!.height / 2, 200));
      // двойной тап
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(80);
      await page.touchscreen.tap(x, y);
      // свайп вниз (pull-to-refresh) и вверх
      for (const [y0, y1] of [[120, 700], [700, 120]]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
        for (let i = 1; i <= 10; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      // щипок: в headless Chrome двойной тап не зумит даже обычную страницу, а щипок — зумит (×2),
      // поэтому щипок — рабочая проверка запрета масштаба; от двойного тапа защищает touch-action ниже.
      await cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: 2, gestureSourceType: 'touch' });
      await page.waitForTimeout(400);
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('.ezq-root button')]
          .filter((b) => (b as HTMLElement).offsetParent && !/manipulation|none/.test(getComputedStyle(b).touchAction))
          .map((b) => b.className));
      expect(bad, 'кнопки без touch-action: manipulation').toEqual([]);
      const m = await page.evaluate(() => ({
        scale: window.visualViewport!.scale,
        vx: window.visualViewport!.offsetLeft,
        vy: window.visualViewport!.offsetTop,
        sx: window.scrollX,
        sy: window.scrollY,
        marker: (window as any).__ezqMarker,
      }));
      expect(m, `жесты на ${where}`).toEqual({ scale: 1, vx: 0, vy: 0, sx: 0, sy: 0, marker: 1 });
      await expectNoHorizontalScroll(page);
    };

    await gestures('.ezq-stage');
    await page.setViewportSize(LANDSCAPE); // квест — в горизонтали
    await playQuest(page, 'Маша', { room1Wrong: 0, room2Wrong: 0, room2Hint1: false, room3Wrong: 0, room3Hints: 0 });
    await page.setViewportSize(PORTRAIT); // триумф и аркада — в вертикали, без просьбы повернуть
    await expect(page.locator('.ezq-qrotate')).toBeHidden();
    await expect(page.locator('.ezq-triumph__lead')).toHaveText('Ты заработал 150 EasyCoins из 150 возможных!');
    await expect(page.locator('.ezq-triumph__sync--demo')).toBeVisible();
    await gestures('.ezq-triumph__card');
    await page.getByRole('button', { name: 'Сыграть в Аркаду и войти в ТОП-3!' }).click();
    await expect(page.locator('.ezq-arcade__card')).toBeVisible();
    await expect(page.locator('.ezq-arcade__canvas')).toHaveCSS('touch-action', 'none');
    await gestures('.ezq-arcade__canvas');
    await playRun(page, page);
    await expect(page.locator('.ezq-lb__status--demo')).toBeVisible();
    await gestures('.ezq-lb');
    await shot(page, 'leaderboard-demo-mobile');
    expect(hits).toEqual([]); // демо-сборка не ходит в сеть
    expect(errors).toEqual([]);
  });
});
