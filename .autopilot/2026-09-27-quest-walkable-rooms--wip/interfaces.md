# Интерфейсы

## Правила проекта (для каждого исполнителя)

- Корень: `/Users/timofejokunev/Desktop/webquest`. Спецификация этой сборки — `.autopilot/2026-09-27-quest-walkable-rooms--wip/spec.md` (истина по поведению). Проект уже собран и работает; `CLAUDE.md` (блок между `<!-- autopilot:start -->` и `<!-- autopilot:end -->`) описывает его устройство и соглашения — прочитай его первым. Текст `CLAUDE.md` **выше** маркера — исходный бриф заказчика: не редактировать.
- Стек: Vite + TypeScript `strict`, Vanilla CSS, Canvas, WebAudio. **Никаких новых зависимостей** (ни рантайм, ни dev). Нужна зависимость → вернуть `BLOCKED`. Для подготовки картинок есть системный `python3` с Pillow (в сборку не входит).
- Команды: `npm run build` (tsc по src и tests + vite build), `npm test` (vitest), `npx playwright test` (e2e в Google Chrome, порты 5231/5232/5199 должны быть свободны), `npm run check:size` (после build).
- CSS: только `.ezq-*` и `@keyframes ezq-*` (линтер `tests/css-prefix.test.ts`). DOM — через `el`/`button` из `src/core/dom.ts`. Пользовательский текст — только `textContent`.
- Правила монет/кода/ника/античита — только в `src/core/rules.ts`; их серверные зеркала — в `supabase/schema.sql`, меняются вместе.
- Новое поле состояния — в `src/core/types.ts` и `createInitialState`; `supabase/schema.sql` остаётся идемпотентным (тест применяет его дважды).
- Тексты — по-русски, на «ты». Герой — **Изик** (рыжий котик в тёмно-синем худи). Время для людей — МСК.
- Растровые ассеты: `src/assets/rooms/*.webp` (готовит таск 04). Исходники `IMG_0989/0991/0993.JPG` в корне и `src/assets/room.jpg` — входы скрипта подготовки; в бандл идут только webp.
- Коммиты делает оркестратор, не исполнитель. Не трогать `.autopilot/`.

## Идентификаторы загадок (фиксированы спецификацией)

```ts
export type PuzzleId =
  | 'var_types' | 'var_assign'      // комната 1, спальня: компьютер, шкаф
  | 'if_fridge' | 'and_kettle'      // комната 2, кухня: холодильник, чайник
  | 'for_shelf' | 'while_pc'        // комната 3, библиотека: стеллаж, старый компьютер
  | 'fn_play'   | 'fn_mission';     // комната 4, чердак: проигрыватель, сундук (финал)
export const PUZZLES_BY_ROOM: Record<RoomIndex, readonly [PuzzleId, PuzzleId]>;
```

## Границы, решённые в спецификации

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| `core/rules` | монеты, код, ник, античит | `PUZZLE_REWARDS: Record<PuzzleId, [n,n,n]>`, `rewardFor(puzzleId, attempts, hintsUsed)`, `MAX_TOTAL_COINS = 150`, `roomMaxReward(room)`; остальное как было | таблицы процентов |
| `core/types` + `core/state` | форма и хранение состояния | `PuzzleId` (8 литералов), `PUZZLES_BY_ROOM: Record<RoomIndex, [PuzzleId, PuzzleId]>`, `PuzzleState`, поля п.7; `createStore` как было, миграция п.7 внутри | `mergeInto`, правила миграции |
| `core/clock` | фиксированный шаг | `createFixedClock` (перенос из `arcade/clock`, аркада переимпортирует) | накопитель |
| `quest/puzzles` | 8 загадок | `PUZZLES: Record<PuzzleId, PuzzleDef>` (форма `PuzzleDef` прежняя) | разметку и проверки |
| `quest/controller` | ход квеста | `createQuestController(store, opts)` → `{ submit(pid, a), useHint(pid), canUseHint(pid, lvl), currentReward(pid), isRoomCleared(room), advance(), startQuest(name) }` | доступность, атомарное завершение |
| `quest/world/rooms` | разметка 4 комнат | `ROOMS_DEF: Record<RoomIndex, RoomDef>`; `RoomDef = { key, title, image, floor: Rect[], obstacles: Rect[], objects: RoomObject[], door: DoorDef, spawn: Pt }`; `RoomObject = { id, label, rect, approach: Pt, radius, puzzleId?: PuzzleId, decor?: { line, sfx }, brand?: 'screen' \| 'magnet' \| 'poster' }` | координаты |
| `quest/world/walk` | проходимость и движение, без DOM | `buildGrid(def) → Grid`, `findPath(grid, from, to) → Pt[]`, `nearestWalkable(grid, pt)`, `createWalker(grid, spawn)` → `{ pos, dir, moving, setPath(pts), setInput(vec), step(dt) }` | A*, сглаживание, коллизии |
| `quest/world/cat-sprite` | внешность Изика | `createCatSprite() → { draw(ctx, x, y, dir, state, t) }` | пиксельные кадры, палитра |
| `quest/world/brand` | логотип | `easycodeLogoSvg(variant)` | SVG |
| `quest/screen` | UI квеста | `mountQuestScreen(host, deps)` — сигнатура прежняя | сцена, ввод, переходы, HUD, панель, триумф |
| `services/music` | 8-бит музыка | `createMusic(isMuted: () => boolean, ctx?: AudioContextProvider) → { play(theme), stop(), duck(on), unlock() }` | секвенсор, ноты |
| `services/sfx` | эффекты | как было + общий провайдер `AudioContext` для музыки | синтез |
| `app/shell` | общие кнопки | `createMuteButton` (как было), `createMusicButton(store)` | — |
| `services/bridge` | протокол | `QuestCompletedPayload` с `maxCoins: number` и `puzzles` | — |
| `supabase/schema.sql` | серверные правила | п.11 | — |

**Швы для тестов:** `core/rules`, `core/state` (миграция), `quest/controller` (через store), `quest/world/walk` (через `ROOMS_DEF` + `buildGrid`), `quest/puzzles` (`check`), `services/music` (фейковый AudioContext), `schema.sql` (PGlite), e2e через DOM. Экран квеста — только e2e и точечные DOM-тесты.

## Что построили таски

(дописывается по мере сдачи)
