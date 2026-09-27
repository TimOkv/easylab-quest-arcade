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

### Из таска 02 — сервер и куратор под 150

- `quest_completions.coins_max integer NOT NULL DEFAULT 150`; строки, существовавшие до появления колонки, — 75. CHECK `quest_completions_coins_range`: `coins_earned` 0..150 (старые CHECK снимаются по любому имени).
- `register_quest_completion` — сигнатура прежняя; `p_coins` 0..150, иначе `BAD_COINS`; во всех ответах (новая, повтор, `restored: true`) есть `coins_max`.
- `restore_by_student(p_student_id)` → `{ verification_code, coins_earned, coins_max, player_name, completed_at }`.
- `curator_find` / `curator_recent` / `curator_set_awarded` — карточка с `coins_max`. `verify.html`: «Заработано: N из M EasyCoins» (без `coins_max` — просто N).
- Вебхук Google-таблицы: в `row` есть `coins_max`; `Code.gs` пишет «N из M».

### Из таска 01 — ядро: 8 загадок, 150 монет, миграция

- `core/types`: `PuzzleId` (8 литералов), `PUZZLES_BY_ROOM`, `PUZZLE_IDS: readonly PuzzleId[]`, `roomOfPuzzle(pid: unknown): RoomIndex | null`, `PuzzleState { earnedCoins; isSolved; attempts; hintsUsed: HintsUsed }`; `RoomState` — `id: string; title: string; maxReward: number; hintsUsed: number`.
- Состояние: `quest.puzzles: Record<PuzzleId, PuzzleState>`, `quest.format: 2`, `quest.maxPossibleCoins: 75 | 150`, `navigation.isMusicMuted: boolean`; названия комнат «Спальня/Кухня/Библиотека/Чердак», `rooms[n].maxReward` 20/30/40/60 (суммы). Миграция незавершённого старого квеста — внутри `createStore`.
- `core/rules`: `PUZZLE_REWARDS: Record<PuzzleId, [n,n,n]>`, `rewardFor(puzzleId, attempts, hintsUsed)`, `roomMaxReward(room)`, `MAX_TOTAL_COINS = 150` (старый `REWARDS` по комнатам удалён).
- Контроллер: `submit(pid, answer)` (отказы `LOCKED|NOT_CURRENT|ALREADY_SOLVED|INCOMPLETE`), `useHint(pid)`, `canUseHint(pid, lvl)`, `currentReward(pid)`, `isRoomCleared(room)`, `advance()`, `startQuest(name)`.
- Загадки: `PUZZLES: Record<PuzzleId, PuzzleDef>`; ответы: `var_assign`/`while_pc` — id варианта; `and_kettle` — `string[]` строк `'yy'|'yn'|'ny'|'nn'`; `fn_play` — токены `play,lparen,str_jazz,bare_jazz,comma,n3,rparen`.
- `puzzle-ui`: новые `createChoice(host, { options, label, onChange })`, `createCheckRows(host, { columns, rows, label, onChange })` → `SlotBoard`; CSS `.ezq-pz-choice*`, `.ezq-pz-row*`.
- Мост: `QuestCompletedPayload.maxCoins: number`, `puzzles: { id, room, earnedCoins, maxReward, attempts, hintsUsed }[]` (8; пусто у старых завершённых с максимумом 75).
- Куратор: `BAD_COINS` — без повторов, `quest.lastSyncError = 'BAD_COINS'` (текст на экране — таск 05); `coins_max` читается из ответов restore/register (нет поля → 75 при монетах ≤ 75, иначе 150).
- `src/quest/screen.ts` адаптирован минимально (старые тексты STORY) — переписывается в 05.
- e2e: общий помощник прохождения — `tests/e2e/support/flow.ts`.

### Из таска 03 — 8-бит музыка и кнопка 🎵

- `services/music`: `createMusic(isMuted: () => boolean, audio?: AudioContextProvider) → Music`; `Music = { play(theme: MusicTheme), stop(), duck(on: boolean), unlock(), destroy() }`; `MusicTheme = 'quest' | 'arcade'`; `themeLoopSeconds(theme)`; `MUSIC_LEVEL`, `DUCK_LEVEL`, `FADE_S`. Выключение подхватывается опросом `isMuted()` (≤ 25 мс).
- `services/sfx`: `AudioContextProvider = { get(), unlock() }`, `createAudioContextProvider(factory?)`, `createSfx(isMuted, audio?)` — один AudioContext на sfx и музыку.
- `app/shell`: `createMusicButton(store)` — `.ezq-music`, `aria-pressed`, «Выключить/Включить музыку»; ставится рядом с 🔊.
- `AppContext.music: Music`; первый жест в корне приложения разблокирует sfx и музыку.
- Аркада: `duck(false)` + `play('arcade')`; рейтинг: `duck(true)` + `play('arcade')`.
- **Для таска 05:** экран квеста зовёт `ctx.music.duck(false)` + `play('quest')`, при открытой панели загадки — `duck(true)`; кнопку 🎵 ставит в HUD квеста сам.

### Из таска 04 — мир: комнаты, ходьба, спрайт Изика, логотип

- Ассеты: `src/assets/rooms/{bedroom,kitchen,library,attic}.webp` (готовит `scripts/prep-rooms.py`; исходники JPG — `src/assets/rooms/src/`, в бандл не импортируются). `room.jpg` пока импортирует `quest/scene.ts` — убирает таск 05. Углы чердака (бывшие кнопки на картинке) — тёмная заливка, её закрывает HUD.
- `quest/world/rooms`: `ROOMS_DEF: Record<RoomIndex, RoomDef>`; типы `Pt {x,y}`, `Rect {x,y,w,h}`, `Dir 'down'|'up'|'left'|'right'`, `RoomKey`, `DecorSfx 'note'|'click'|'ding'|'noteUp'|'purr'`, `BrandKind`. `RoomObject` сверх исходного — `brandRect?: Rect` (куда рисовать логотип). `DoorDef { exit: { rect, approach, radius, walkTo, dir } | null; entry: { from, dir } | null }`. Координаты — пиксели сцены 1600×900.
- `quest/world/walk`: `CELL=20`, `WALK_SPEED=260`, `PAD_X=16`, `PAD_Y=6`; `buildGrid(def, cell?)`, `isWalkable(grid, pt)`, `nearestWalkable(grid, pt) → Pt|null`, `findPath(grid, from, to) → Pt[]`, `createWalker(grid, spawn, {speed?}) → { pos, dir, moving, path, setPath, setInput(vec), step(dt), place(p, dir?) }`; ручной вектор отменяет путь.
- `quest/world/cat-sprite`: `createCatSprite() → { draw(ctx, x, y, dir: Dir, state: 'idle'|'walk', t /*сек*/) }`, (x, y) — точка между лапами на полу; `CAT_W=78`, `CAT_H=84`, `CAT_SCALE=3`, тайминги `WALK_FRAME_S`, `BREATH_S`, `BLINK_EVERY_S`, `BLINK_S`.
- `quest/world/brand`: `easycodeLogoSvg(variant: BrandKind): string` (статичный SVG на 100% контейнера), `EASYCODE_BLUE`, `EASYCODE_LIGHT`.
- `core/clock`: `STEP_MS`, `MAX_STEPS_PER_FRAME`, `FixedClock`, `createFixedClock(stepMs?)`, `advanceClock(clock, frameMs)`, `clockAlpha(clock)`; `arcade/clock` реэкспортирует под старыми именами.
- Стенд (только dev, не в сборке): `tests/e2e/world-harness.html?view=sprite` — лист кадров и логотипы; `?view=room&n=1..4` — фон с наложенной разметкой.

### Из таска 05 — экран квеста: ходьба, предметы, «Пройти задачу», HUD, музыка

- `QuestScreenDeps.music?: Music`; `mountQuestScreen(host, deps)` — сигнатура прежняя. Экран зовёт `play('quest')`, при открытой загадке `duck(true)`; кнопки 🔊 и 🎵 в HUD квеста.
- `quest/scene`: `createRoomStage() → { stage, bg, objects, canvas, ctx, ui, toStage(clientX, clientY): Pt }`, `STAGE_W`, `STAGE_H`. `room.jpg` больше не импортируется (в бандле нет).
- `quest/world/walk` (изменено): `nearestWalkable(grid, pt, from?)` — с `from` ищет только в связной области героя, `findPath` делает это сам; `Grid.blocked: Rect[]`; `isWalkable` точный; `PAD_X = 30`. Разметка чердака и библиотеки подогнана под новый отступ (вход библиотеки (120,670), спавн (330,670), подход к двери (392,670)).
- DOM экрана (для таска 06): предметы — `button.ezq-qobj[data-obj][data-puzzle]` с модификаторами `--puzzle`, `--decor`, `--solved`; действие — `.ezq-qact` (`.ezq-qact__go` / `.ezq-qact__done`); подсказка — `.ezq-qtip`; **временная** кнопка перехода `.ezq-qnext` — её заменяет дверь (переход внутри `goNext()` → `enterRoom(n)`); режим — `root.dataset.mode = intro | walk | puzzle | triumph`.
- Декор пока только ведёт Изика к себе (облачко и звук — таск 06). Мобильный e2e пока в портрете 390×844 — таск 06 переводит его в горизонталь вместе с «Поверни телефон».

### Из таска 06 — дверь, переход, декор, бренд, поворот телефона

- `mountQuestScreen` — сигнатура прежняя; экспорт `DOOR_OPEN_TEXT` (живёт в `src/quest/texts.ts` — без CSS, его импортирует e2e; `screen.ts` реэкспортирует). Режимы `root.dataset.mode`: `intro | walk | puzzle | door | triumph`; rAF считает ходьбу только в `walk`.
- DOM: дверь `button.ezq-qdoor[data-state=open|closed]` (`--open`, стрелка `.ezq-qdoor__arrow`); плашка `.ezq-qbanner`; облачко `.ezq-qsay--decor|--door`; затемнение `.ezq-qwipe` (`--fade` при reduced-motion); карточка комнаты `.ezq-qcard`; логотипы `.ezq-qbrand--screen|magnet|poster[data-obj]` (`--on`); ожившый декор `.ezq-qobj--alive`; оверлей поворота `.ezq-qrotate` (не на триумфе). `.ezq-qnext` удалена.
- Звуки декора пока сопоставлены существующим sfx (note→jump, ding→coin, noteUp→spring, purr→click) — своих патчей в `services/sfx` нет.
- e2e: `QuestHooks.onWalk(tag)`, `shot(page, name, prefix?, settleMs?)`; мобильный e2e — в горизонтали; скриншоты `walk-*.png` и `final-*.png`.
- Хореография финала (панель → постер → триумф) идёт по часам сцены `simT` и стоит на паузе «Поверни телефон»; плашка двери — в нижней полосе у двери. Чердак: заплатки углов `'streak'` в `scripts/prep-rooms.py`.

### Из таска 07 — доводка по приёмке

- `core/rules`: `LEGACY_MAX_COINS = 75`, `isLegacyFormat(q)` (максимум 75), `hasLocalBreakdown(q)` (не восстановлено с сервера), `hasPuzzleRecords(q)`, `maxCoinsFromServer(coinsMax, coins)`. `core/types`: `quest.isRestored: boolean`.
- Мост: у восстановленного прохождения `rooms: []` и `puzzles: []`; непустой `rooms` в сумме равен `coinsEarned`.
- CSS-токены: цвета квеста — `--ezq-*` на `.ezq-root` (тройки `--ezq-*-rgb` для прозрачности); `tests/css-tokens.test.ts` запрещает hex/rgba в `quest.css`. Кнопка 🎵 — `.ezq-music__slash`.
- Магнит на холодильнике — плашка «знак + easycode» 110×40.

