# 02 — База Supabase и сетевые сервисы клиента

**Требования:** R41, R42, R43, R44, R45, R46, R47, R48, R49, R50, R58, R64i, R65i, R67, G01, G02, G03, G04, G05, G09, G11, R26
**Blocked by:** 01
**Зона:** `supabase/`, `src/services/` (кроме `sfx*` и `bridge*`), `tests/sql/`
**Волна:** 2
**Status:** ready

## Что должно заработать

`supabase/schema.sql` разворачивает всю базу одним прогоном (и повторным — без ошибок): таблицы, представление `leaderboard`, RLS, RPC-контракт, триггер вебхука Google-таблицы, сид сезона и настроек. Клиентские сервисы разговаривают с ней через REST-клиент на нативном fetch: регистрируют прохождение (с восстановлением по student_id и перевыпуском кода при конфликте), отправляют забеги с офлайн-очередью, читают ТОП-10, свою позицию и сезон. Без переменных окружения всё честно работает в демо-режиме.

## Из брифа, дословно

> «Сервис на нативном `fetch` без сторонних библиотек (< 3 КБ кода).»
> «Загрузка ТОП-10 рекордов: `GET /rest/v1/leaderboard?order=score.desc,created_at.asc&limit=10`.»
> «Безопасная отправка рекорда через RPC-процедуру `submit_arcade_score`.»
> «очки каждый раз суммируются и эта сумма очков идет в рейтинг»
> «Лимит очков в день» / «3000 очков»
> «сброс кнопкой куратора, но куратор в админ - панеле может выставлять и анонсировать обратный отсчет, оибо подводить итоги»
> «Восстанавливаем по ID»
> «Оффлайн-очередь (`pending_scores`) при нестабильном интернет-соединении»

## Разделы спецификации

Истории 35–39, 43 (данные для флага дубля), 59–61, 63–67 (серверная часть), 69–75; Решения §5, §6; «Границы и швы» — `services/rest`, `services/curator`, `services/leaderboard`, `supabase/schema.sql`; типы `LeaderboardService`, `CuratorSync`, `SubmitOutcome` из `interfaces.md`.

## Критерии приёмки

- [ ] `schema.sql` применяется в PGlite (с `pgcrypto`, если доступно в PGlite; иначе хэш секрета — через встроенный `sha256()` Postgres 11+) дважды подряд без ошибок; создание триггера pg_net обёрнуто проверкой наличия расширения
- [ ] SQL-тесты в PGlite через RPC: регистрация, повтор по `student_id` → `restored=true` и та же запись, `CODE_TAKEN`; `completed_at` из клиента в окне принимается, вне окна — `now()`; `submit_arcade_score`: сумма копится, дневной лимит (МСК) обрезает `counted`, повтор `run_id` не удваивает, `CHEAT_SPEED`/`TOO_SHORT`/`SCORE_RANGE`/`NO_QUEST`/`BAD_CODE`/`BAD_NAME`/`RATE_LIMIT`, сезон с прошедшим `ends_at` → `counted=0, season_closed`; ранги и `gap_to_top10`; скрытые не видны в `leaderboard`, но `get_my_standing` сообщает `is_hidden`; все `curator_*` с неверным секретом → `FORBIDDEN`; `curator_finish_season` архивирует ТОП-3 и открывает новый сезон с нуля; `curator_find` отдаёт флаг «возможный дубль»
- [ ] Анонимная роль не может напрямую `SELECT/INSERT/UPDATE` таблицы (проверено в тесте через `SET ROLE anon`, если роль создаётся в тестовом окружении схемы); представление `leaderboard` не содержит `verification_code`/`student_id`
- [ ] `services/rest` ≤ 3 КБ минифицированного кода (тест собирает модуль через `vite build`/esbuild и меряет); таймаут 8 с; ошибки `NotConfiguredError`/`NetworkError`/`RpcError(code)` разбираются из ответа PostgREST
- [ ] `createCuratorSync`: `syncNow` отправляет точные `coins_earned` и `completedAt`, выставляет `isSyncedWithCurator`, на `CODE_TAKEN` перевыпускает код (≤5 раз, обновляет store), на `restored` принимает серверные код/монеты; `startRetryLoop` — `online`, 30 с, backoff до 5 мин; демо → `'demo'`
- [ ] `createLeaderboardService`: клиентский античит до отправки (`isRunPlausible`, код, квест пройден), `run_id` уникален, очередь `ezq_pending_scores_v1` (≤ 50, backoff, окончательные отказы удаляются, `BAD_NAME` сохраняется до смены ника), кэш ТОП-10 в `store.leaderboard.cachedTop`, обновление `currentRank/isTop3Winner/seasonTotal/todayCounted/dailyLimit/isHidden`; тесты на фейковом fetch
