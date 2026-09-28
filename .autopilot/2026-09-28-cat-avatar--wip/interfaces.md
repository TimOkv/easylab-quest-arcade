# Что уже построено

Читается каждым исполнителем до начала работы. Не изобретай заново то, что здесь есть.

## Границы, решённые в спецификации

- Один модуль: экран квеста. `catBubble(lines)` в `src/quest/screen.ts` — единственное место реплики Изика с кружком `.ezq-cat__face` (вступление + 8 загадок). Публичных сигнатур не добавляется.
- Швы для тестов: DOM-тест `tests/quest-screen.test.ts`; e2e — через `tests/e2e/support/flow.ts` (прохождение квеста через UI).

## Общие правила проекта

- Стек: Vite + TypeScript, Vanilla CSS, без рантайм-зависимостей. Правила — `CLAUDE.md` в корне (читай раздел «Соглашения кода»).
- Тесты: `npm test` (vitest), один файл — `npx vitest run tests/quest-screen.test.ts`; сборка `npm run build`; размер `npm run check:size` (после build); CSS-линт `npm run check:css`.
- e2e: `npx playwright test <файл>` (Google Chrome, порты 5231/5232/5199 должны быть свободны). Сборка демо — порт 5231.
- CSS: только селекторы `.ezq-*`, цвета в `quest.css` — только токенами `--ezq-*`.
- Растр в бандле — webp в `src/assets/`; исходники в `corrections/` из кода не импортируются.
- Запрещено трогать: всё, кроме реплики Изика (`catBubble`, `.ezq-cat__face`), нового ассета и тестов к ним. Спрайт Изика на сцене, триумф, аркада, профиль — не менять.
- Если не хватает зависимости — не добавляй сам, верни `BLOCKED` с названием.

## Из таска 01 — аватарка Изика

- `src/assets/cat-avatar.webp` — 192×192 RGBA, круглая маска, 12 КБ; импортируется в `src/quest/screen.ts` как URL.
- `catBubble` рисует `img.ezq-cat__face` (64×64, border-box, рамка `--ezq-wood`); предзагрузка `new Image()` в `mountQuestScreen`.
- e2e `tests/e2e/avatar.spec.ts` — 6 устройств; скриншоты `avatar-<устройство>.png` только при `EZQ_FINAL_SHOTS=1`.
