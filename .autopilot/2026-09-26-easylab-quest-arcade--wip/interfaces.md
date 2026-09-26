# Интерфейсы

## Правила проекта (для каждого исполнителя)

- Корень проекта: `/Users/timofejokunev/Desktop/webquest`. Спецификация — `.autopilot/2026-09-26-easylab-quest-arcade--wip/spec.md` (истина по поведению). `CLAUDE.md` выше маркера `<!-- autopilot:start -->` — исходная спецификация заказчика: **не редактировать**.
- Стек: Vite + TypeScript `strict`, Vanilla CSS, Canvas. **Никаких рантайм-зависимостей.** Dev-зависимости ставит только таск 01: `vite`, `typescript`, `vitest`, `happy-dom`, `@electric-sql/pglite`, `playwright` (браузеры не качать: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; запускать через `channel: 'chrome'` — на машине есть Google Chrome). Нужна другая зависимость → вернуть `BLOCKED`, не ставить.
- Команды: `npm run dev`, `npm run build` (= `tsc --noEmit && vite build`), `npm run preview`, `npm test` (vitest run), `npm run test:e2e` (playwright), `npm run check:size`.
- CSS: только классы `.ezq-*`, `@keyframes ezq-*`; ни одного селектора по тегу, ни `html/body/*`; CSS-переменные объявлять на `.ezq-root` (или `.ezq-verify-root` для кураторской страницы). Тест-линтер из таска 01 падает на нарушении.
- Пользовательский текст (ники, имена) выводится только через `textContent`. `innerHTML` допустим лишь для статической разметки без данных пользователя.
- Изображения: единственный файл — `src/assets/room.jpg` (копия референса). Всё остальное — canvas / CSS / inline SVG.
- Тексты интерфейса — по-русски, на «ты», коротко и дружелюбно (ЦА 10–12 лет). Не придумывать имя маскоту («котик Easycode») и конкретные призы («фирменный мерч Easycode»).
- Время для людей — Москва (`Europe/Moscow`), формат `ДД.ММ.ГГГГ ЧЧ:ММ`.
- Коммиты делает оркестратор, не исполнитель.

## Границы, решённые в спецификации

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| `core/state` | `EasyQuestGameState`, сохранение `ezq_save_v1` | `createInitialState(now, sessionId)`, `createStore({ storage, now }) → { get(), update(mutator), subscribe(fn) → unsubscribe, replace(state) }`, тип `EasyQuestGameState`, `loadState(storage)` | сериализацию, валидацию формы, резерв повреждённого сохранения, фолбэк в память, `storage`-события |
| `core/rules` | чистые правила | `REWARDS`, `rewardFor(room, attempts, hintsUsed)`, `generateVerificationCode(randomFn?)`, `isValidVerificationCode(s)`, `normalizeVerificationCode(input) → string \| null`, `validatePlayerName(raw) → { ok: true, value } \| { ok: false, error }`, `isRunPlausible({ score, timeSpentSeconds }) → { ok } \| { ok:false, reason }`, `MAX_POINTS_PER_SECOND = 120`, `MIN_RUN_SECONDS = 5`, `MAX_SCORE = 50000` | список мата, нормализацию |
| `quest/puzzles` | содержимое и проверка 4 загадок | `PUZZLES: Record<1\|2\|3\|4, PuzzleDef>`; `PuzzleDef = { id, title, intro, hints: [string, string], check(answer) → { correct: boolean; mistake?: string }, render(el, api: { onAnswerChange(ready: boolean), getAnswer }) → { getAnswer(), reset(), showSolvedState(), destroy() } }` | разметку и взаимодействие |
| `quest/controller` | ход квеста поверх store | `createQuestController(store, { onCompleted }) → { submit(room, answer) → { correct, reward?, mistake? }, useHint(room) → hintText, canUseHint(room, level), advance(), startQuest(playerName), currentReward(room) }` | учёт попыток/подсказок, атомарное завершение, генерацию кода |
| `arcade/engine` | симуляция и отрисовка | `createWorld(seed, opts?)`, `stepWorld(world, input: { left, right }, dt)`, `renderWorld(ctx, world, alpha, sprites)`, `createArcadeGame(canvas, { highScore, muted, onGameOver(result) }) → { start(), pause(), resume(), destroy() }`, `RunResult = { score, durationSeconds, jumpsCount, seed, heightPx }` | физику, генерацию, камеру, пулы |
| `arcade/sprites` | пиксельные матрицы | `buildSprites() → SpriteSet` (offscreen canvases), `drawCoinIcon(canvas)` | палитры и матрицы |
| `services/rest` | HTTP к Supabase | `createRestClient(cfg)`, ошибки `NotConfiguredError`, `NetworkError`, `RpcError` | заголовки, таймауты, разбор ошибок |
| `services/curator` | реестр прохождений | `createCuratorSync(rest, store) → { syncNow(), restoreByStudent(id), startRetryLoop() }` | повторы, backoff, регенерацию кода при `CODE_TAKEN` |
| `services/leaderboard` | рейтинг и очередь | `createLeaderboardService(rest, store, storage) → { fetchTop(), fetchStanding(), fetchSeason(), submitRun(RunResult), flushQueue(), pendingCount() }` | очередь `pending_scores`, кэш ТОП-10, клиентский античит |
| `services/bridge` | postMessage | `createBridge({ win, extraOrigins }) → { isEmbedded, onAuthInit(cb), sendQuestCompleted(p), sendGameFinished(p), announceReady() }`, `isAllowedOrigin(origin, extra)` | белый список, конверт `{ source:'ezq', version:1, type, payload }` |
| `services/sfx` | звук | `createSfx(isMuted: () => boolean) → { play(name), unlock() }` | WebAudio-синтез |
| `app` | оболочка и проводка | `mountApp(rootEl)`; утилиты оболочки для экранов: `fitStage(el, w, h) → { destroy }` (contain-масштаб), `copyText(text) → Promise<boolean>`, `createMuteButton(store, sfx) → HTMLButtonElement`, `showToast(text)` | роутер и охрану маршрутов, блокировку жестов, safe-area, проводку сервисов (G03, синхронизация, мост) |
| `quest/screen` | UI квеста | `mountQuestScreen(host, deps: { store, sfx, controller, isServerConfigured: boolean, onGoToArcade() }) → { destroy() }` | сцену, камеру, hotspots, HUD монет, intro, триумф |
| `arcade/screen` | UI аркады | `mountArcadeScreen(host, deps: { store, sfx, onGameOver(result: RunResult), onOpenLeaderboard() }) → { destroy() }` — внутри профиль (имя, код с копированием, «Заработано X из 75»), «Играть», холст; при game over сам обновляет `arcade.*` в store, затем зовёт `onGameOver` | игровой цикл, ввод, паузу |
| `leaderboard/screen` | UI рейтинга | `mountLeaderboardScreen(host, deps: { store, service: LeaderboardService, lastRun: { result: RunResult; submit: Promise<SubmitOutcome> } \| null, onPlayAgain(), onBack() }) → { destroy() }` | таблицу, бейджи, отсчёт, авто-обновление |
| `verify` | кураторская страница | страница `verify.html` | всё |
| `supabase/schema.sql` | база | RPC-контракт из Решений §5 | таблицы, RLS, триггеры |

**Швы для тестов** (поведение проверяется только через них): `core/rules` (чистые функции), `quest/controller` + `core/state` на фейковом `storage`, `quest/puzzles[n].check`, `arcade/engine` `createWorld/stepWorld` (детерминизм, коллизии, wrap, сложность, античит-бот), `services/leaderboard` и `services/curator` на фейковом `fetch`, `services/bridge` на фейковом `window`, `schema.sql` в PGlite (RPC-контракт), e2e Playwright — дымовой проход квеста и аркады на собранном `dist/`.

---

## Общие типы (фиксируются таском 01 в `src/core/types.ts`, дальше только расширяются)

```ts
export type RoomIndex = 1 | 2 | 3 | 4;
export interface RunResult { runId: string; score: number; durationSeconds: number; jumpsCount: number; seed: number; heightPx: number; isNewRecord: boolean; }
export type SubmitOutcome =
  | { kind: 'counted'; counted: number; seasonTotal: number; todayCounted: number; dailyLimit: number; rank: number | null; gapToTop10: number | null; seasonClosed: boolean; isHidden: boolean }
  | { kind: 'queued' }                                  // сеть — лежит в pending_scores
  | { kind: 'rejected'; reason: 'CHEAT_SPEED' | 'TOO_SHORT' | 'NO_QUEST' | 'BAD_CODE' | 'BAD_NAME' | 'SCORE_RANGE' | 'RATE_LIMIT' }
  | { kind: 'demo' };                                   // сервер не настроен
export interface PublicRow { playerName: string; score: number; createdAt: string; runsCount: number; }
export interface Standing { rank: number | null; seasonTotal: number; gapToTop10: number | null; todayCounted: number; dailyLimit: number; isHidden: boolean; }
export interface SeasonInfo { title: string; endsAt: string | null; dailyLimit: number; isClosed: boolean; }
export interface LeaderboardService {
  isConfigured: boolean;
  fetchTop(): Promise<PublicRow[]>;          // бросает NetworkError; кэш — в store.leaderboard.cachedTop
  fetchStanding(): Promise<Standing | null>;
  fetchSeason(): Promise<SeasonInfo | null>;
  submitRun(r: RunResult): Promise<SubmitOutcome>;
  flushQueue(): Promise<void>;
  pendingCount(): number;
}
export interface CuratorSync { isConfigured: boolean; syncNow(): Promise<'synced' | 'pending' | 'demo'>; restoreByStudent(studentId: string): Promise<boolean>; startRetryLoop(): () => void; }
```

## Что построено (дополняется после каждого таска)

### Из таска 01 — каркас

- `src/core/types.ts` — все общие типы (раздел выше) + `EasyQuestGameState`, `KeyValueStorage`, `ScreenName`, `RejectReason`. Расширять можно, менять — нет.
- `src/core/state.ts` — `createInitialState(now, sessionId)`, `loadState(storage)`, `createStore({ storage, now?, win?, newSessionId? }) → Store { get() (заморожено), update(draft => void), subscribe((s, prev, source: 'local'|'external') => void) → off, replace(s), isMemoryOnly(), destroy() }`; `SAVE_KEY`, `CORRUPT_KEY`.
- `src/core/rules.ts` — `REWARDS`, `rewardFor`, `generateVerificationCode(randomFn?)`, `isValidVerificationCode`, `normalizeVerificationCode`, `validatePlayerName → {ok,value} | {ok:false, error:'TOO_SHORT'|'TOO_LONG'|'BAD_CHARS'|'PROFANITY', message}`, `isRunPlausible`, `MAX_POINTS_PER_SECOND`, `MIN_RUN_SECONDS`, `MAX_SCORE`, `CODE_ALPHABET`, `MAX_TOTAL_COINS`. Не пиши свои версии этих правил.
- `src/services/sfx.ts` — `createSfx(isMuted) → { play(SfxName), unlock() }`.
- `src/app/shell.ts` — `fitStage(el, w, h, { align?: 'center'|'top', onScale? }) → { destroy, scale(), refresh() }` (el уже вставлен в контейнер; родитель получает `.ezq-stage-host` с текстурой полей), `copyText`, `createMuteButton(store, sfx)`, `showToast(text, ms?)`, `blockGestures(root)`.
- `src/app/app.ts` — `mountApp(rootEl) → { store, sfx, router, destroy }`; `src/app/router.ts` — `createRouter`, `resolveScreen`, `startScreen`, `ScreenFactory<Ctx> = (host, ctx) => { destroy }`.
- Монтирование экранов: заглушки в `SCREENS` в `src/app/screens.ts` заменяет **таск 05** (проводка). Таски 03/04 экспортируют `mountQuestScreen`/`mountArcadeScreen` из своих папок и в `src/app/` не пишут. `AppContext = { root, store, sfx, navigate(screen) }` — расширяет таск 05.
- CSS-токены на `.ezq-root`: `--ezq-blue, -blue-light, -white, -gray, -black, -lilac, -pale-blue, -cyan, -sky, -magenta, -red, -success, -navy, -navy-deep, -wood, -wood-dark, -wood-light, -gold, -silver, -bronze, -font, -font-mono, -safe-top/right/bottom/left, -bg, -panel-bg, -panel-fg, -panel-muted, -panel-border, -radius, -shadow`. Светлая тема — атрибут `[data-ezq-theme="light"]`. Готовые классы: `.ezq-btn`, `.ezq-btn--icon`, `.ezq-scroll` (единственное место, где работает прокрутка), `.ezq-screen`, `.ezq-stage`.
- Тесты: `npm test`; один файл — `npx vitest run <path>`; CSS-линтер — `tests/css-prefix.test.ts` (сканирует все `.css` в `src/`).
- Версии: TypeScript 7, Vite 8, Vitest 5.
