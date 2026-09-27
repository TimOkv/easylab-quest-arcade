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

### Из таска 02 — база и сервисы

- `src/services/rest.ts` — `createRestClient({ url, anonKey, fetchImpl?, timeoutMs = 8000 }) → RestClient { isConfigured, select<T>(pathWithQuery), rpc<T>(name, args) }`; `createRestClientFromEnv(fetchImpl?)`. Ошибки: `NotConfiguredError`; `NetworkError` (сеть, таймаут, 5xx/408/429); `RpcError(code, message, status)` — `code` = префикс сообщения или `HTTP_<status>`.
- `src/services/curator.ts` — `createCuratorSync(rest, store, opts?{ onCodeChanged?(code), win?, random? }) → CuratorSync`; `MAX_CODE_REISSUES = 5`. `startRetryLoop` срабатывает сразу, на `online` и когда `quest.isCompleted` становится true. `restoreByStudent` заполняет квест, открывает аркаду, ставит `currentScreen = 'arcade'`.
- `src/services/leaderboard.ts` — `createLeaderboardService(rest, store, storage, opts?{ win?, curator?: { syncNow }, now? }) → LeaderboardService & { startRetryLoop(): () => void }`; `PENDING_KEY = 'ezq_pending_scores_v1'`, `MAX_PENDING = 50`, `TOP_QUERY`. **Забег уходит только после регистрации квеста у куратора — таск 05 обязан передать `{ curator }` и запустить оба retry-цикла.**
- RPC (все возвращают jsonb):
  - `register_quest_completion(p_code, p_player_name, p_student_id, p_coins, p_completed_at)` → `{ verification_code, coins_earned, completed_at, player_name, restored }`
  - `restore_by_student(p_student_id)` → `{ verification_code, coins_earned, player_name, completed_at }` | null
  - `submit_arcade_score(p_run_id uuid, p_code, p_session_id, p_student_id, p_player_name, p_score, p_time_spent int, p_jumps)` → `{ counted, season_total, today_counted, daily_limit, rank, gap_to_top10, is_hidden, season_ends_at, season_closed }`
  - `get_my_standing(p_code)` → те же поля без `counted` | null; `get_season_info()` → `{ title, ends_at, daily_limit, is_closed }`
  - Куратор, первым аргументом `p_secret`: `curator_check`, `curator_find(p_code)` (карточка с `possible_duplicate`), `curator_recent(p_limit ≤ 50)`, `curator_set_awarded(p_code, p_awarded)`, `curator_leaderboard`, `curator_set_hidden(p_code, p_hidden)`, `curator_set_daily_limit(p_limit 100..100000)`, `curator_set_countdown(p_title, p_ends_at | null)`, `curator_finish_season(p_next_title)`, `curator_winners`. Точные имена параметров — в `supabase/schema.sql`.
  - Только админ (не выдан anon): `ezq_set_curator_secret(secret ≥ 8)`. Хэш — встроенный `sha256()`.
  - Коды ошибок: `NO_QUEST BAD_CODE BAD_NAME BAD_COINS CHEAT_SPEED TOO_SHORT SCORE_RANGE RATE_LIMIT CODE_TAKEN FORBIDDEN BAD_LIMIT`.
- Черновик Apps Script лежит в `supabase/google-apps-script.gs`; по спецификации его место — `integrations/google-apps-script/Code.gs`, владелец — **таск 06**: перенести туда (из `supabase/` удалить), не держать две копии.
- Для таска 05: `restoreByStudent` пишет `navigation.currentScreen = 'arcade'`, но роутер реагирует только на внешние (`external`) изменения store. После `true` проводка сама вызывает переход роутера в аркаду.
- `RunResult.runId` обязан быть UUID v4 (`crypto.randomUUID()` или общий генератор id из `core/state`) — сервис отправляет его как `p_run_id uuid`; не-UUID получает новый id и может засчитаться дважды.

### Из таска 03 — квест

- `src/quest/screen.ts` — `mountQuestScreen(host, { store, sfx, controller, isServerConfigured: boolean, onGoToArcade() }) → { destroy() }`; CSS подключается внутри модуля. При монтировании с `isCompleted` сразу показывает триумф.
- `src/quest/controller.ts` — `createQuestController(store, { onCompleted?(state), now?(), randomFn?() }) → { submit(room, answer) → { correct, reward?, mistake?, message?, rejected?: 'LOCKED'|'NOT_CURRENT'|'ALREADY_SOLVED'|'INCOMPLETE' }, useHint(room) → string | null, canUseHint(room, 1|2), advance() → boolean, startQuest(name) → PlayerNameResult | { ok:false, error:'LOCKED' }, currentReward(room) }`.
- `src/quest/puzzles.ts` — `PUZZLES: Record<RoomIndex, PuzzleDef>`; `check()` возвращает ещё `message` (дружелюбный текст ошибки).
- Запись в store: «Проверить» → `rooms[n].attempts++` до результата; верно → `isSolved`, `earnedCoins`, `totalCoinsEarned`; 4-я комната одним update → `isCompleted`, `completedAt`, `verificationCode`, `arcade.isUnlocked`. `startQuest` пишет `leaderboard.playerName` и `navigation.currentScreen = 'quest'`.
- **Для таска 05:** роутер не должен уводить с квеста в момент, когда `isCompleted` становится true (триумф появляется через ~2.6 с, уходит только по `onGoToArcade`); редирект в аркаду — только при старте/перезагрузке. `onCompleted` подключить к `curatorSync.syncNow()` и мосту; статус отправки на триумфе обновляется сам по `quest.isSyncedWithCurator`.
- Временные `src/quest/dev/` и `tests/quest-shots.mjs` (скриншоты) — удалить в таске 05 или 07, когда появится настоящая проводка.

### Из таска 06 — куратор

- `src/verify/page.ts` — `mountVerifyPage(root, { rest, win?, refreshMs? }) → { destroy() }`; `src/verify/season.ts` — `buildSeasonPanel(...)`; `src/verify/format.ts` — `formatMsk / formatMskShort / formatMskClock / toMskInput / fromMskInput` (время МСК — переиспользовать, не писать свои).
- `integrations/google-apps-script/Code.gs` — `doPost` принимает `{ secret, event: 'insert'|'awarded', row: { time, verification_code, player_name, student_id, coins_earned, status } }` (тот же формат шлёт pg_net-триггер), плюс `doGet`, `ezqSelfTest`. Копия в `supabase/` удалена.
- Документы: `docs/SUPABASE_SETUP.md`, `docs/GOOGLE_SHEETS.md`. README и `docs/INTEGRATION.md` — таск 07.

### Из таска 04 — аркада

- `src/arcade/screen.ts` (реэкспорт из `src/arcade/index.ts`) — `mountArcadeScreen(host, { store, sfx, onGameOver(RunResult), onOpenLeaderboard(), autoStart?, readInput?(world, out) }) → { destroy() }`. `autoStart: true` — для кнопки «Ещё раз» (сразу начинает забег). `recordRun(store, result, now)`.
- Движок: `createWorld(seed, { recordScore? })`, `stepWorld(world, { left, right }, dt)`, `botInput(world, out)`, `renderWorld(ctx, world, alpha, sprites, extras?)`, `createArcadeGame(canvas, {...}) → { start, pause, resume, destroy, isRunning, isPaused, world, stats, resetStats, setPixelRatio }`, `newRunSeed()`, `newRunId(crypto?)` → UUID v4.
- `buildSprites() → SpriteSet`; `drawCoinIcon(canvas)`.
- Game over одним update: `arcade.highScore = max`, `bestHeightPx = max`, `totalRunsPlayed += 1`, `lastRun = { runId, score, durationSeconds, jumpsCount, timestamp, seed, countedScore: null }`; затем через ~0.9 с `onGameOver(RunResult)`. Переход на рейтинг и отправку делает проводка (таск 05).
- e2e аркады: `tests/e2e/arcade.spec.ts` поднимает свой Vite dev на порту **5199** со страницей `tests/e2e/arcade-harness.html` (не в сборке). Другим e2e этот порт не занимать. Скриншоты — при `EZQ_SHOTS=1`.

### Из таска 05 — проводка, рейтинг, мост

- `src/leaderboard/` — `mountLeaderboardScreen(host, { store, sfx?, service, lastRun, onPlayAgain, onBack }) → { destroy }`; `REFRESH_MS = 20000`, `formatCountdown(ms)`, `outcomeText(outcome, run)`.
- `src/services/bridge.ts` — `createBridge({ win?, extraOrigins? }) → { isEmbedded, onAuthInit(cb) → off, announceReady, sendQuestCompleted, sendGameFinished, destroy }`; `isAllowedOrigin(origin, extra[])` (https easycode-lab.ru и *.easycode-lab.ru на порту по умолчанию + extra, точные или `*.`); `parseExtraOrigins(env)`; собственный origin — автоматически.
- Протокол: исходящий конверт `{ source: 'ezq', version: 1, type, payload }`. `EASYLAB_READY {}`; `EASYLAB_QUEST_COMPLETED { coinsEarned, maxCoins: 75, verificationCode, completedAt: ISO, studentId, rooms: [{ room, id, earnedCoins, maxReward, attempts, hintsUsed }] }` (повторно — если куратор перевыпустил код); `EASYLAB_GAME_FINISHED { score, highScore, seasonTotal, durationSeconds, jumpsCount, verificationCode }` после `submitRun`. Входящее: `{ type: 'EASYLAB_AUTH_INIT', payload: { studentId, name, theme } }` (конверт не обязателен), только от `window.parent` с разрешённого origin. Отправленное до того, как стал известен origin родителя, копится.
- `src/app/app.ts` — `mountApp(root, { storage?, win?, rest?, bridge?, screens?, authWaitMs? }) → { store, sfx, bridge, controller, curator, leaderboard, router (null пока загрузка), ready, destroy }`; `questCompletedPayload(state)`, `AUTH_WAIT_MS`, `RESTORED_TOAST`. `AppContext = { root, store, sfx, navigate, controller, curator, leaderboard, bridge, isServerConfigured, lastRun, autoStart, onGameOver(r) }`.
- Порты: скриншоты таска 05 — 5212 (фейковый Supabase через page.route) и 5213 (демо). 5199 — e2e аркады.
- Не удалены (нет разрешения у исполнителя): `src/quest/dev/`, `tests/quest-shots.mjs` — таск 07.
