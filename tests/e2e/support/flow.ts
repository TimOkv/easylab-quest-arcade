// Прохождение квеста и забега через настоящий UI (страница или iframe стенда).
import { expect, type FrameLocator, type Locator, type Page } from 'playwright/test';

export type Scope = Page | FrameLocator;

/** Скриншоты ключевых экранов для приёмки (путь от корня репо; файлы хранятся в git). */
export const SHOTS_DIR = 'tests/e2e/__screenshots__';

/** Финальные скриншоты — только при EZQ_FINAL_SHOTS=1 (чтобы обычный прогон не перезаписывал снимки в репо). */
export async function shot(page: Page, name: string): Promise<void> {
  if (!process.env.EZQ_FINAL_SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS_DIR}/final-${name}.png` });
}

/** Как ученик решает каждую комнату (ожидаемые монеты тест считает сам, по таблице спецификации §3). */
export interface QuestPlan {
  room1Wrong: number; // неверных попыток до верной (0 или 1)
  room2Wrong: number; // 0..2 — неверные ветки
  room2Hint1: boolean;
  room3Wrong: number; // 0 или 1
  room3Hints: 0 | 1 | 2;
}

export async function saveOf(page: Page, frame?: FrameLocator): Promise<any> {
  const read = () => JSON.parse(localStorage.getItem('ezq_save_v1') ?? 'null');
  if (!frame) return page.evaluate(read);
  const f = page.frames().find((x) => x.url().includes('index.html'));
  return f!.evaluate(read);
}

const card = (s: Scope, text: string | RegExp): Locator =>
  s.locator('.ezq-pz-pool .ezq-pz-card:visible').filter({ hasText: text }).first();
const slot = (s: Scope, i: number): Locator => s.locator('.ezq-pz-slot').nth(i);

async function check(s: Scope, expectCorrect: boolean): Promise<void> {
  await s.locator('.ezq-qpanel__check').click();
  if (expectCorrect) {
    await expect(s.locator('.ezq-qpanel__check')).toBeHidden({ timeout: 10_000 });
  } else {
    await expect(s.locator('.ezq-qpanel__feedback')).not.toBeEmpty();
    await expect(s.locator('.ezq-qpanel__check')).toHaveText('Проверить');
  }
}

async function openPuzzle(s: Scope): Promise<void> {
  // Кнопка в панели подсказки комнаты: хотспот сцены в маленьком iframe стенда может быть под панелью.
  await s.locator('.ezq-qpanel').getByRole('button', { name: 'Открыть загадку' }).click();
  await expect(s.locator('.ezq-qpanel__check')).toBeVisible();
}

async function next(s: Scope): Promise<void> {
  await s.locator('.ezq-qpanel__next').click();
}

async function hint(s: Scope, level: 1 | 2): Promise<void> {
  await s.locator('.ezq-qpanel__hint').click();
  if (level === 2) {
    await expect(s.locator('.ezq-qpanel__confirm')).toBeVisible();
    await s.locator('.ezq-qpanel__confirm').getByRole('button', { name: 'Открыть' }).click();
  }
  await expect(s.locator('.ezq-qpanel__hint-text')).toHaveCount(level);
}

export interface QuestHooks {
  /** Снимок: вызывается в комнате 1 до открытия загадки и с открытой загадкой. */
  onRoom?(tag: 'room' | 'puzzle'): Promise<void>;
  /** Проверка экрана (например, отсутствие горизонтальной прокрутки) в каждой комнате. */
  eachRoom?(): Promise<void>;
}

export async function playQuest(s: Scope, name: string | null, plan: QuestPlan, hooks: QuestHooks = {}): Promise<void> {
  const input = s.locator('.ezq-intro__input');
  await expect(input).toBeVisible();
  if (name !== null) await input.fill(name);
  await s.locator('.ezq-intro__start').click();

  // Комната 1: имя ← "Мурзик", возраст ← 12, любитКодить ← true (ловушка — "12").
  await hooks.onRoom?.('room');
  await openPuzzle(s);
  await card(s, '"Мурзик"').click(); await slot(s, 0).click();
  if (plan.room1Wrong) {
    await card(s, '"12"').click(); await slot(s, 1).click();
    await card(s, /^true$/).click(); await slot(s, 2).click();
    await check(s, false);
    await slot(s, 1).click(); // вернуть "12" в пул
    await card(s, /^12$/).click(); await slot(s, 1).click();
  } else {
    await card(s, /^12$/).click(); await slot(s, 1).click();
    await card(s, /^true$/).click(); await slot(s, 2).click();
  }
  await hooks.onRoom?.('puzzle');
  await hooks.eachRoom?.();
  await check(s, true);
  await next(s);

  // Комната 2: датчик жёлтый → верная ветка — else (третья).
  await openPuzzle(s);
  for (let i = 0; i < plan.room2Wrong; i++) {
    await s.locator('.ezq-pz-branch').nth(i).click();
    await check(s, false);
  }
  if (plan.room2Hint1) await hint(s, 1);
  await s.locator('.ezq-pz-branch').nth(2).click();
  await hooks.eachRoom?.();
  await check(s, true);
  await next(s);

  // Комната 3: for (let i = 0; i < 5; i++) { shelf.putBook() }.
  await openPuzzle(s);
  if (plan.room3Wrong) {
    await card(s, 'i <= 5').click(); await slot(s, 0).click();
    await card(s, 'putBook').click(); await slot(s, 1).click();
    await card(s, /^\}$/).click(); await slot(s, 2).click();
    await check(s, false);
    if (plan.room3Hints >= 1) await hint(s, 1);
    if (plan.room3Hints >= 2) await hint(s, 2);
    await slot(s, 0).click();
    await card(s, 'i = 0; i < 5').click(); await slot(s, 0).click();
  } else {
    await card(s, 'i = 0; i < 5').click(); await slot(s, 0).click();
    await card(s, 'putBook').click(); await slot(s, 1).click();
    await card(s, /^\}$/).click(); await slot(s, 2).click();
  }
  await hooks.eachRoom?.();
  await check(s, true);
  await next(s);

  // Комната 4: runMission ( "ARCADE" ).
  await openPuzzle(s);
  for (const t of [/^runMission$/, /^\($/, /^"ARCADE"$/, /^\)$/]) await card(s, t).click();
  await hooks.eachRoom?.();
  await check(s, true);
  await expect(s.locator('.ezq-triumph')).toBeVisible({ timeout: 15_000 });
}

/** Один забег: ждём ≥ 6 с на полу (иначе забег короче MIN_RUN_SECONDS), потом держим «вправо» до падения. */
export async function playRun(page: Page, s: Scope, opts: { onPlaying?(): Promise<void> } = {}): Promise<void> {
  await s.getByRole('button', { name: /Играть/ }).click();
  await expect(s.locator('.ezq-arcade__card')).toBeHidden();
  await page.waitForTimeout(6_500);
  await opts.onPlaying?.();
  const canvas = s.locator('.ezq-arcade__canvas');
  await canvas.focus().catch(() => undefined);
  await page.keyboard.down('ArrowRight');
  try {
    await expect(s.locator('.ezq-lb')).toBeVisible({ timeout: 60_000 });
  } finally {
    await page.keyboard.up('ArrowRight');
  }
}

/** Нет горизонтальной прокрутки и страница не сдвинута. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth,
    x: window.scrollX,
  }));
  expect(m.sw, 'ширина документа').toBeLessThanOrEqual(m.cw);
  expect(m.bw, 'ширина body').toBeLessThanOrEqual(m.cw);
  expect(m.x).toBe(0);
}
