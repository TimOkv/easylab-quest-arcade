// e2e аркады: собственный dev-сервер Vite со страницей-стендом tests/e2e/arcade-harness.html.
import { test, expect } from 'playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { SHOTS_DIR } from './support/flow';

const PORT = 5199;
let server: ViteDevServer;
const url = (q: string) => `http://127.0.0.1:${PORT}/tests/e2e/arcade-harness.html?${q}`;

test.beforeAll(async () => {
  server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
});
test.afterAll(async () => {
  await server?.close();
});

test('аркада держит ≥ 55 FPS и ≤ 4 мс на step+render в среднем за 5 с', async ({ page }) => {
  await page.setViewportSize({ width: 450, height: 800 });
  await page.goto(url('mode=perf'));
  await page.waitForFunction(() => !!window.__ezq?.perf);
  await page.waitForTimeout(1000); // прогрев JIT
  await page.evaluate(() => window.__ezq.resetPerf!());
  await page.waitForTimeout(5000);
  const r = await page.evaluate(() => ({ ...window.__ezq.perf!(), restarts: window.__ezq.restarts }));
  console.log(`[arcade perf] fps=${r.fps.toFixed(1)} avgWorkMs=${r.avgWorkMs.toFixed(3)} frames=${r.frames} restarts=${r.restarts}`);
  expect(r.fps).toBeGreaterThanOrEqual(55);
  expect(r.avgWorkMs).toBeLessThanOrEqual(4);
});

test('экран: профиль, «Играть», падение → store обновлён и onGameOver получил RunResult', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('mode=screen'));
  const card = page.locator('.ezq-arcade__card');
  await expect(card).toContainText('Тестер');
  await expect(card).toContainText('EZ-7K3M');
  await expect(card).toContainText('Заработано 60 из 150');
  await expect(page.locator('.ezq-arcade__canvas')).toHaveCSS('touch-action', 'none');
  await page.getByRole('button', { name: /Играть/ }).click();
  await expect(card).toBeHidden();
  // Держим «вправо» (event.code) — котик уходит с пола, рано или поздно промахивается и падает.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.waitForFunction(() => window.__ezq.gameOvers.length === 1, null, { timeout: 45_000 });
  await page.keyboard.up('ArrowRight');
  const res = await page.evaluate(() => ({
    run: window.__ezq.gameOvers[0],
    save: JSON.parse(localStorage.getItem('ezq_save_v1')!),
  }));
  expect(res.run.score).toBeGreaterThanOrEqual(0);
  expect(res.save.arcade.totalRunsPlayed).toBe(1);
  expect(res.save.arcade.highScore).toBe(res.run.score);
  expect(res.save.arcade.lastRun).toMatchObject({
    runId: res.run.runId,
    score: res.run.score,
    durationSeconds: res.run.durationSeconds,
    jumpsCount: res.run.jumpsCount,
    seed: res.run.seed,
  });
  expect(typeof res.save.arcade.lastRun.timestamp).toBe('number');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Последний забег');
});

// Скриншоты для приёмки (в tests/e2e/__screenshots__): EZQ_SHOTS=1 npx playwright test tests/e2e/arcade.spec.ts
for (const vp of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`скриншоты аркады: ${vp.name}`, async ({ page }) => {
    test.skip(!process.env.EZQ_SHOTS, 'только по EZQ_SHOTS');
    test.setTimeout(600_000);
    const dir = SHOTS_DIR;
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(url('mode=screen&bot=1&highScore=470'));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/arcade-profile-${vp.name}.png` });

    // Бот играет, пока в кадре не окажутся метка «500», линия рекорда, движущаяся платформа и пружина.
    let reached = false;
    for (let attempt = 0; attempt < 10 && !reached; attempt++) {
      const n = await page.evaluate(() => window.__ezq.gameOvers.length);
      await page.getByRole('button', { name: /Играть|Ещё раз/ }).click();
      const res = await page
        .waitForFunction(
          (n) => {
            const w = window.__ezq.world;
            if (window.__ezq.gameOvers.length > n) return 'over';
            if (!w || w.camY < 4350) return false;
            if (w.camY > 4900) return 'miss';
            const vis = w.platforms.filter((p) => p.active && !p.gone && p.y > w.camY + 60 && p.y < w.camY + 740);
            const spring = vis.some((p) => p.spring && p.y > w.camY + 200);
            return vis.some((p) => p.kind === 1) && spring ? 'ok' : false;
          },
          n,
          { timeout: 90_000, polling: 'raf' },
        )
        .then((h) => h.jsonValue());
      reached = res === 'ok';
      if (res === 'miss') {
        // проскочили окно — роняем котика и пробуем другой сид
        await page.evaluate(() => (window.__ezq.botOff = true));
        await page.waitForFunction((n) => window.__ezq.gameOvers.length > n, n);
        await page.evaluate(() => (window.__ezq.botOff = false));
      }
      if (!reached) await page.waitForTimeout(300);
    }
    expect(reached).toBe(true);
    await page.screenshot({ path: `${dir}/arcade-play-${vp.name}.png` });

    const overs = await page.evaluate(() => window.__ezq.gameOvers.length);
    await page.evaluate(() => (window.__ezq.botOff = true));
    await page.waitForFunction(() => window.__ezq.world?.over === true);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${dir}/arcade-fall-${vp.name}.png` });
    await page.waitForFunction((n) => window.__ezq.gameOvers.length > n, overs);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/arcade-over-${vp.name}.png` });
    await expect(page.locator('.ezq-arcade__card')).toContainText('Последний забег');
  });
}
