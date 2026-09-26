// Скриншоты экрана квеста (ручная проверка зон камеры). Запуск: node tests/quest-shots.mjs
// Поднимает vite dev, открывает временный стенд src/quest/dev/ в Google Chrome (channel: 'chrome').
import { createServer } from 'vite';
import { chromium } from 'playwright';

const OUT = '.autopilot/2026-09-26-easylab-quest-arcade--wip/shots';
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const url = 'http://localhost:5199/src/quest/dev/index.html';
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];

async function run(name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.goto(`${url}?reset`);
  await page.waitForSelector('.ezq-intro');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-0-intro.png` });
  await page.fill('.ezq-intro__input', 'Тимофей');
  await page.click('.ezq-intro__start');
  const shot = async (tag) => { await page.waitForTimeout(1300); await page.screenshot({ path: `${OUT}/${name}-${tag}.png` }); };
  const card = (text) => page.locator('.ezq-pz-pool .ezq-pz-card:visible', { hasText: text }).first().click();
  const slot = (i) => page.locator('.ezq-pz-slot').nth(i).click();
  const check = async () => { await page.click('.ezq-qpanel__check'); await page.waitForTimeout(700); };
  const next = async () => { await page.click('.ezq-qpanel__next'); };

  // Комната 1
  await shot('1-room');
  await page.click('.ezq-hotspot:not([hidden])');
  await card('"Мурзик"'); await slot(0);
  await card('"12"'); await slot(1);
  await card('true'); await slot(2);
  await check();
  await shot('1-wrong');
  await page.locator('.ezq-pz-slot').nth(1).click(); // вернуть "12"
  await card('12'); await slot(1);
  await check();
  await shot('1-solved');
  await next();
  // Комната 2
  await shot('2-room');
  await page.click('.ezq-hotspot:not([hidden])');
  await page.locator('.ezq-pz-branch').nth(0).click();
  await check();
  await page.click('.ezq-qpanel__hint');
  await shot('2-hint');
  const btns = await page.evaluate(() => {
    const p = document.querySelector('.ezq-qpanel').getBoundingClientRect();
    const vis = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top >= p.top && r.bottom <= p.bottom && r.bottom <= innerHeight; };
    return { check: vis('.ezq-qpanel__check'), hint: vis('.ezq-qpanel__hint') };
  });
  console.log(name, 'actions visible after hint', JSON.stringify(btns));
  await page.locator('.ezq-pz-branch').nth(2).click();
  await check();
  await shot('2-solved');
  await next();
  // Комната 3
  await shot('3-room');
  await page.click('.ezq-hotspot:not([hidden])');
  await card('i = 0; i < 5'); await slot(0);
  await card('putBook'); await slot(1);
  await card('}'); await slot(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-3-puzzle.png` });
  await check();
  await shot('3-solved');
  await next();
  // Комната 4
  await shot('4-room');
  await page.click('.ezq-hotspot:not([hidden])');
  for (const t of ['runMission', '(', '"ARCADE"', ')']) await page.locator('.ezq-pz-pool .ezq-pz-card:visible', { hasText: t }).filter({ hasText: new RegExp(`^${t.replace(/[()]/g, '\\$&')}$`) }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${name}-4-puzzle.png` });
  await check();
  await shot('4-solved');
  await page.waitForSelector('.ezq-triumph');
  await shot('5-triumph');
  const fit = await page.evaluate(() => {
    const c = document.querySelector('.ezq-triumph__card');
    const pr = document.querySelector('.ezq-triumph__prize').getBoundingClientRect();
    return { overflow: c.scrollHeight - c.clientHeight, prizeBottom: Math.round(pr.bottom), cardBottom: Math.round(c.getBoundingClientRect().bottom) };
  });
  console.log(name, 'triumph fit', JSON.stringify(fit));
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('ezq_save_v1')).quest);
  console.log(name, 'coins', state.totalCoinsEarned, 'code', state.verificationCode, 'completed', state.isCompleted);
  await page.goto(url);
  await page.waitForSelector('.ezq-triumph');
  await page.close();
}

try {
  await run('land', { width: 1280, height: 720 });
  await run('port', { width: 390, height: 844 });
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
