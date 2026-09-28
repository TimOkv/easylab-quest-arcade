// Аватарка Изика у реплики (прогон cat-avatar, R03): на 6 устройствах картинка загружена, квадратная,
// целиком в панели и в экране и не наезжает на облачко с текстом — во вступлении и в загадке комнаты 1.
// Скриншоты avatar-<устройство>.png — только при EZQ_FINAL_SHOTS=1 (как final-*.png).
import { test, expect, type Page } from 'playwright/test';
import { DEMO_URL } from './support/supabase-mock';
import { openPuzzle, shot } from './support/flow';

const DEVICES = [
  { name: 'pc', use: { viewport: { width: 1920, height: 1080 } } },
  { name: 'laptop', use: { viewport: { width: 1366, height: 768 } } },
  { name: 'iphone', use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'android', use: { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } },
  { name: 'iphone-se', use: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'ipad', use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
] as const;

type Box = { x: number; y: number; width: number; height: number };
const inside = (a: Box, b: Box): boolean =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function expectAvatar(page: Page, where: string): Promise<void> {
  const face = page.locator('.ezq-qpanel .ezq-cat img.ezq-cat__face');
  await expect(face, where).toBeVisible();
  await expect(page.locator('.ezq-qpanel .ezq-cat'), where).not.toContainText('🐱');
  // Загружена (не битая картинка) и видна сразу.
  await expect.poll(() => face.evaluate((n: HTMLImageElement) => n.complete && n.naturalWidth), { message: where }).toBeGreaterThan(0);
  const vp = page.viewportSize()!;
  const f = (await face.boundingBox())!;
  const panel = (await page.locator('.ezq-qpanel').boundingBox())!;
  const bubble = (await page.locator('.ezq-qpanel .ezq-cat__bubble').boundingBox())!;
  expect(Math.abs(f.width - f.height), `${where}: квадратная ${f.width}×${f.height}`).toBeLessThanOrEqual(1);
  expect(f.width, `${where}: не схлопнулась`).toBeGreaterThanOrEqual(40);
  expect(inside(f, panel), `${where}: целиком в панели`).toBe(true);
  expect(inside(f, { x: 0, y: 0, width: vp.width, height: vp.height }), `${where}: целиком в экране`).toBe(true);
  expect(overlaps(f, bubble), `${where}: не наезжает на облачко`).toBe(false);
}

for (const d of DEVICES) {
  test.describe(d.name, () => {
    test.use(d.use);

    test('аватарка Изика: вступление и загадка комнаты 1', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(DEMO_URL);
      await expect(page.locator('.ezq-intro__input')).toBeVisible();
      await expectAvatar(page, `${d.name}, вступление`);

      await page.locator('.ezq-intro__input').fill('Аня');
      await page.locator('.ezq-intro__start').click();
      await openPuzzle(page, 'var_types');
      await expectAvatar(page, `${d.name}, загадка var_types`);
      await shot(page, d.name, 'avatar');
      expect(errors).toEqual([]);
    });
  });
}
