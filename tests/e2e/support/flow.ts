// Прохождение квеста и забега через настоящий UI (страница или iframe стенда).
import { expect, type FrameLocator, type Locator, type Page } from 'playwright/test';
// Текст плашки — из модуля без CSS: сам screen.ts тянет quest.css и картинки, Node их не загрузит.
import { DOOR_OPEN_TEXT } from '../../../src/quest/texts';

export type Scope = Page | FrameLocator;

/** Скриншоты ключевых экранов для приёмки (путь от корня репо; файлы хранятся в git). */
export const SHOTS_DIR = 'tests/e2e/__screenshots__';

/** Финальные скриншоты — только при EZQ_FINAL_SHOTS=1 (чтобы обычный прогон не перезаписывал снимки в репо). */
export async function shot(page: Page, name: string, prefix = 'final', settleMs = 400): Promise<void> {
  if (!process.env.EZQ_FINAL_SHOTS) return;
  if (settleMs) await page.waitForTimeout(settleMs);
  await page.screenshot({ path: `${SHOTS_DIR}/${prefix}-${name}.png` });
}

/**
 * Как ученик решает первую (старую) загадку каждой комнаты; вторая загадка комнаты (шкаф, чайник,
 * старый компьютер, проигрыватель) всегда решается с первой попытки — ожидаемые монеты тест считает сам
 * по таблице «Монеты».
 */
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

/** Как ученик: клик по светящемуся предмету → Изик идёт к нему → «Пройти задачу» → панель загадки. */
export async function openPuzzle(s: Scope, pid: string): Promise<void> {
  await expect(s.locator('.ezq-qpanel')).toBeHidden({ timeout: 10_000 });
  const obj = s.locator(`.ezq-qobj[data-puzzle="${pid}"]`);
  const id = await obj.getAttribute('data-obj');
  await obj.click();
  // Кнопка именно этого предмета: по пути Изик может пройти мимо другого (к проигрывателю — мимо сундука).
  const go = s.locator(`.ezq-qact[data-obj="${id}:o"] .ezq-qact__go`);
  await expect(go).toBeVisible({ timeout: 10_000 });
  await go.click();
  await expect(s.locator('.ezq-qpanel__check')).toBeVisible();
}

const SECOND: Record<1 | 2 | 3 | 4, string> = { 1: 'var_assign', 2: 'and_kettle', 3: 'while_pc', 4: 'fn_play' };

const choice = (s: Scope, label: string): Locator =>
  s.locator('.ezq-pz-choice').filter({ hasText: new RegExp(`^${label}$`) }).first();

/** Вторая загадка комнаты — сразу верно (панель после первой загадки сама сворачивается). */
async function solveSecond(s: Scope, room: 1 | 2 | 3 | 4, hooks: QuestHooks): Promise<void> {
  await openPuzzle(s, SECOND[room]);
  if (room === 1) await choice(s, '5').click(); // socks = 2 + 3
  if (room === 2) await s.locator('.ezq-pz-row').nth(0).click(); // вода ✓, ток ✓
  if (room === 3) await choice(s, '5').click(); // pages: 10, 8, 6, 4, 2
  if (room === 4) for (const t of [/^play$/, /^\($/, /^"Jazz"$/, /^,$/, /^3$/, /^\)$/]) await card(s, t).click();
  await hooks.eachRoom?.();
  await check(s, true);
}

const ROOM_KEYS = { 1: 'bedroom', 2: 'kitchen', 3: 'library', 4: 'attic' } as const;

/** Плашка «Быстрее пройди в дверь» не закрывает ✓ решённых предметов, «Решено ✓ +N» и дверь со стрелкой. */
async function expectBannerClear(s: Scope): Promise<void> {
  const banner = s.locator('.ezq-qbanner');
  await banner.evaluate((b) => Promise.all(b.getAnimations().map((a) => a.finished)));
  const bb = (await banner.boundingBox())!;
  await expect(s.locator('.ezq-qobj__check')).toHaveCount(2);
  await expect(s.locator('.ezq-qact__done')).toBeVisible(); // Изик у только что решённого предмета
  const others = [
    ...(await s.locator('.ezq-qobj__check').all()),
    s.locator('.ezq-qact'),
    s.locator('.ezq-qdoor'),
    s.locator('.ezq-qdoor__arrow'),
  ];
  for (const o of others) {
    const ob = (await o.boundingBox())!;
    const overlap = bb.x < ob.x + ob.width && ob.x < bb.x + bb.width && bb.y < ob.y + ob.height && ob.y < bb.y + bb.height;
    expect(overlap, `плашка перекрывает ${await o.getAttribute('class')}`).toBe(false);
  }
}

/** Обе загадки решены → дверь светится, плашка; тап по двери → Изик уходит в неё → следующая комната. */
async function throughDoor(s: Scope, from: 1 | 2 | 3, hooks: QuestHooks): Promise<void> {
  await expect(s.locator('.ezq-qpanel')).toBeHidden({ timeout: 10_000 });
  const door = s.locator('.ezq-qdoor');
  await expect(door).toHaveAttribute('data-state', 'open');
  await expect(s.locator('.ezq-qbanner')).toHaveText(DOOR_OPEN_TEXT);
  await expect(door.locator('.ezq-qdoor__arrow')).toBeVisible();
  await expectBannerClear(s);
  if (from === 1) await hooks.onWalk?.('door-open');
  await door.click();
  const quest = s.locator('.ezq-quest');
  await expect(quest).toHaveAttribute('data-mode', 'door', { timeout: 10_000 });
  await expect(s.locator('.ezq-qbanner')).toBeHidden();
  if (from === 1 && hooks.onWalk) {
    await expect(s.locator('.ezq-qwipe')).toBeVisible();
    await hooks.onWalk('door-wipe');
  }
  await expect(s.locator('.ezq-qstage')).toHaveAttribute('data-room', ROOM_KEYS[(from + 1) as 2 | 3 | 4]);
  await expect(s.locator('.ezq-qcard')).toHaveText(`Комната ${from + 1} из 4 · ${['Кухня', 'Библиотека', 'Чердак'][from - 1]}`);
  await expect(quest).toHaveAttribute('data-mode', 'walk', { timeout: 10_000 });
  await expect(s.locator('.ezq-qwipe')).toBeHidden();
  await expect(s.locator('.ezq-qhud__room')).toHaveText(new RegExp(`^Комната ${from + 1} из 4`));
  await hooks.onWalk?.(`room${from + 1}`);
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
  /** Снимки ходьбы: комната после входа, декор, экран компьютера, дверь, переход, постер. */
  onWalk?(tag: string): Promise<void>;
}

export async function playQuest(s: Scope, name: string | null, plan: QuestPlan, hooks: QuestHooks = {}): Promise<void> {
  const input = s.locator('.ezq-intro__input');
  await expect(input).toBeVisible();
  if (name !== null) await input.fill(name);
  await s.locator('.ezq-intro__start').click();
  await hooks.onWalk?.('room1');

  // Декор: Изик подходит к гитаре — облачко с репликой.
  await s.locator('.ezq-qobj[data-obj="guitar"]').click();
  await expect(s.locator('.ezq-qsay--decor')).toHaveText('Брень! Когда-нибудь напишу песню на JavaScript 🎸', { timeout: 10_000 });
  await hooks.onWalk?.('decor');
  // Дверь закрыта, пока не решены обе загадки.
  await s.locator('.ezq-qdoor').click();
  await expect(s.locator('.ezq-qsay--door')).toHaveText('Дверь закрыта — реши обе загадки (0/2)', { timeout: 10_000 });
  await hooks.onWalk?.('door-closed');
  await expect(s.locator('.ezq-quest')).toHaveAttribute('data-mode', 'walk');

  // Комната 1: имя ← "Изик", возраст ← 12, любитКодить ← true (ловушка — "12").
  await hooks.onRoom?.('room');
  const screen = s.locator('.ezq-qbrand--screen[data-obj="computer"]');
  await expect(screen).not.toHaveClass(/ezq-qbrand--on/);
  await s.locator('.ezq-qobj[data-puzzle="var_types"]').click();
  await expect(s.locator('.ezq-qact__go')).toBeVisible({ timeout: 10_000 });
  await expect(screen).toHaveClass(/ezq-qbrand--on/); // экран включился с логотипом при подходе
  await hooks.onWalk?.('screen');
  await openPuzzle(s, 'var_types');
  await card(s, '"Изик"').click(); await slot(s, 0).click();
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
  await solveSecond(s, 1, hooks);
  await throughDoor(s, 1, hooks);

  // Комната 2: датчик жёлтый → верная ветка — else (третья).
  await openPuzzle(s, 'if_fridge');
  for (let i = 0; i < plan.room2Wrong; i++) {
    await s.locator('.ezq-pz-branch').nth(i).click();
    await check(s, false);
  }
  if (plan.room2Hint1) await hint(s, 1);
  await s.locator('.ezq-pz-branch').nth(2).click();
  await hooks.eachRoom?.();
  await check(s, true);
  await solveSecond(s, 2, hooks);
  await throughDoor(s, 2, hooks);

  // Комната 3: for (let i = 0; i < 5; i++) { shelf.putBook() }.
  await openPuzzle(s, 'for_shelf');
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
  await solveSecond(s, 3, hooks);
  await throughDoor(s, 3, hooks);

  // Комната 4: сначала проигрыватель play("Jazz", 3), затем финальная — runMission ( "ARCADE" ).
  await solveSecond(s, 4, hooks);
  await openPuzzle(s, 'fn_mission');
  for (const t of [/^runMission$/, /^\($/, /^"ARCADE"$/, /^\)$/]) await card(s, t).click();
  await hooks.eachRoom?.();
  await check(s, true);
  // Финал: постер Easycode на чердаке загорается, затем триумф.
  await expect(s.locator('.ezq-qbrand--poster')).toHaveClass(/ezq-qbrand--on/, { timeout: 10_000 });
  await expect(s.locator('.ezq-triumph')).toHaveCount(0);
  await hooks.onWalk?.('poster');
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
