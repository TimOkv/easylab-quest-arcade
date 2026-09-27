# 01 — Каркас: сборка, состояние, правила, оболочка

**Требования:** R01, R02, R03, R04, R05, R07, R08, R09, R10, R11, R12, R13, R16, R17, R26, R30, R47, R60, R66, G04, G07, G08
**Blocked by:** —
**Зона:** корень проекта (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `verify.html`/`parent_test.html` — только заглушки-входы), `src/core/`, `src/app/`, `src/services/sfx*`, `src/assets/`, `tests/` (инфраструктура), `.env.example`
**Волна:** 1
**Status:** ready

## Что должно заработать

`npm run dev` открывает модуль: пустой корень `.ezq-root` во весь экран с safe-area, без зума и pull-to-refresh, роутер показывает заглушку экрана квеста (или аркады, если в сохранении `quest.isCompleted`) — заглушки — это место, куда таски 03/04/05 смонтируют свои экраны через `mountQuestScreen`/`mountArcadeScreen`/`mountLeaderboardScreen`. Состояние `EasyQuestGameState` живёт в store и переживает перезагрузку. Все чистые правила (монеты, код, ник, античит) реализованы и покрыты тестами. Звуки синтезируются. Сборка и проверки размера/CSS работают.

## Из брифа, дословно

> «Vite, TypeScript / Modern ES6+, Vanilla CSS (изоляция стилей через БЭМ-префикс `ezq-`), HTML5 Canvas API. Никаких тяжелых фреймворков и библиотек.»
> «Сборка в `vite.config.ts` с параметром `base: './'`»
> «сохранение в `localStorage` по ключу `ezq_save_v1`»
> «Комната 1 (макс. 10): 1-я попытка = 10, 2-я = 7, 3+ попытка = 5.» … «Баланс не может упасть ниже нуля.»
> «если после 1 подсказки ребенок нажал еще раз на подсказку - монеты не даются»
> «Цифры+буквы» (код EZ-XXXX без 0/O/1/I)

## Разделы спецификации

Истории 1–17, 25, 31, 44 (охрана маршрутов), 71–73 (клиентская часть правил), 81–82; Решения §1, §2, §3, §8, §10; «Границы и швы» — строки `core/state`, `core/rules`, `services/sfx`, `app`; общие типы в `interfaces.md`.

## Критерии приёмки

- [ ] Установлены ровно dev-зависимости из `interfaces.md`; рантайм-зависимостей нет; скрипты `dev/build/preview/test/test:e2e/check:size` есть; `npm run build` и `npm test` зелёные
- [ ] Vite multi-page: `index.html`, `verify.html`, `parent_test.html` (последние две — минимальные заглушки с своим entry, их наполнят таски 05/06); `base: './'`; в `dist/*.html` нет путей, начинающихся с `/`
- [ ] `src/core/types.ts` с общими типами из `interfaces.md`; `EasyQuestGameState` = §4.1 CLAUDE.md + поля Решений §2
- [ ] `createStore` сохраняет в `ezq_save_v1` на каждый `update`; фолбэк в память при исключении хранилища; резерв `ezq_save_v1_corrupt`; `storage`-событие перечитывает; тесты на фейковом storage
- [ ] `core/rules`: `rewardFor` по таблице (все 12 значений + подсказка 2 → 0 + никогда < 0), `generateVerificationCode` (алфавит `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, crypto), `isValidVerificationCode`, `normalizeVerificationCode` (`ez8492`, ` ez-8492 ` → `EZ-8492`), `validatePlayerName` (2–16, разрешённые символы, фильтр мата с нормализацией ё/латиница/разделители — список корней рус+англ), `isRunPlausible` (≤120 очков/с, ≥5 с, ≤50000) — тесты
- [ ] Оболочка: `.ezq-root` `position:fixed`, safe-area отступы, `touchmove` гасится, meta viewport `viewport-fit=cover, maximum-scale=1, user-scalable=no`; `fitStage(el, w, h)` масштабирует contain и центрирует; декоративная бесшовная пиксельная текстура полей (CSS); утилиты `copyText` (Clipboard API → execCommand → false), `createMuteButton`, `showToast`
- [ ] Роутер: `quest` / `arcade` / `leaderboard`; при `!quest.isCompleted` аркада и рейтинг недоступны; при `isCompleted` старт — аркада; `navigation.currentScreen` синхронизируется
- [ ] `createSfx`: WebAudio-синтез звуков `click, correct, wrong, coin, door, fanfare, jump, spring, rocket, gameover`; AudioContext по первому жесту; уважает mute
- [ ] Тест-линтер CSS: все `.css` в `src/` — только селекторы `.ezq-*`/`@keyframes ezq-*`/`@media`; `check:size` падает, если `dist/` > 1.8 МБ
- [ ] `src/assets/room.jpg` — копия `IMAGE 2026-09-26 16:21:47.jpg` из корня; `.env.example` с `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`, `VITE_BRIDGE_EXTRA_ORIGINS=`; бренд-токены цветов из Решений §1 как переменные на `.ezq-root`
