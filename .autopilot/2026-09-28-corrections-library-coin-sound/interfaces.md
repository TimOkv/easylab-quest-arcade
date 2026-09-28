# Интерфейсы

## Границы, решённые в спецификации

Модули и их публичные сигнатуры не меняются. Меняется только:

| Модуль | Что меняется | Шов для тестов |
|---|---|---|
| `quest/world/rooms` | данные `ROOMS_DEF[3]` (библиотека) | `tests/world-walk.test.ts` (`buildGrid`, `findPath` по `ROOMS_DEF`) |
| `quest/effects` | разметка внутри `coinIcon()` | вызов `coinIcon()` в DOM-тесте |
| `arcade/sprites` | `drawCoinIcon(canvas)` рисует новую монетку | сигнатура та же |
| `services/sfx`, `services/music`, `app` | по найденной причине | фейковый AudioContext (`tests/services/*`) |

## Правила проекта для исполнителя

- Стек: Vite + TypeScript, ванильный CSS с префиксом `ezq-`, Canvas; рантайм-зависимостей нет. **Ничего не устанавливать** — нужна зависимость → вернуть `BLOCKED`.
- Команды: `npm run build` (tsc включая tests/ + vite), `npm test` (vitest), `npm run check:css`, `npx playwright test <файл>` (Chrome, порты 5231/5232/5199 должны быть свободны), `npm run dev`.
- Всё в `CLAUDE.md` в корне — соглашения (CSS только через токены в `quest.css`, `textContent` для пользовательских строк, `el`/`button` из `src/core/dom.ts`).
- **Остальное не трогать** (R07): другие комнаты, загадки, правила монет, сервисы, тексты — только если это прямо нужно для таска.
- Коммитит оркестратор, не исполнитель.

## Что построили таски

(дописывается по мере сдачи тасков)

### Из таска 02 — монетка EasyCoin

- `export const EASYCOIN_SVG: string` в `src/quest/effects.ts` — единственная константа монетки; части помечены `data-ezq-coin="rim|body|ticks|letter|facets"`.
- `coinIcon(className?)` — сигнатура и форма та же; `drawCoinIcon(target)` в `src/arcade/sprites.ts` рисует тот же SVG через `Image` (асинхронно, по `load`), буфер canvas под devicePixelRatio (≤×3), исходный размер в `data-ezq-coin-px`.
- `image-rendering: pixelated` снят с `.ezq-coin` и `.ezq-arcade__coin` — монетка гладкая.

### Из таска 01 — звук

- Причина немоты: разблокировка звука висела только на `pointerdown`/`keydown` корня и снималась после первой попытки при любом исходе; на телефоне `pointerdown` от касания не даёт user activation, клавиша при фокусе на body до корня не доходит, `resume()` звался только из `suspended` (не из iOS `interrupted`).
- `mountApp` слушает `pointerdown`, `pointerup`, `touchend`, `mousedown`, `click`, `keydown` на `document` (capture, passive) и пробует на каждом жесте, пока контекст не `running`; снимает слушатели в `destroy`.
- `AudioContextProvider.unlock()` и `sfx.play()` будят контекст из любого состояния, кроме `running`/`closed`; первый unlock ставит `navigator.audioSession.type = 'playback'`, где API есть.
- Публичные сигнатуры не менялись. Тест: `tests/services/audio-unlock.test.ts`.

### Из таска 03 — библиотека

- `ROOMS_DEF[3]`: стол — два препятствия `r(130,380,470,622)` + `r(130,622,380,772)`; высокая стопка `r(425,760,505,895)`; `old_pc` rect `r(232,390,345,540)`, approach `(412,720)`, brandRect `r(292,452,332,484)`; выход — rect `r(38,475,152,900)`, approach `(608,897)`, radius 105, walkTo `(110,897)`, dir `left`; вход — from `(700,898)`, dir `up`; spawn `(700,780)`.
- `screen.ts` `startDoor`: при срабатывании зоны выхода Изик идёт по сетке (`findPath`) к `exit.approach`, потом к `walkTo`; внутри анимации двери — `route: Pt[]`. Общее для всех комнат (D02).
- `quest.css`: `.ezq-qstage[data-room="library"] .ezq-qbanner { left: 700px }`.

### Из таска 04 — выход библиотеки от стола

- `DoorExit.nudge?: Rect[]` (только библиотека: `r(395,625,540,770)`, `r(530,755,600,835)`); `export function exitZoneAt(exit, pos, input?) → 'door' | 'nudge' | null` в `rooms.ts` — одна проверка для экрана и тестов. «Дверь закрыта» — только у 'door'.
- `export function doorWalkSeconds(route) = max(0.4, длина/170)` в `screen.ts`.
