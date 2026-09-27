# CLAUDE.md — Руководство по разработке проекта «EasyLab Quest & Endless Arcade»

> **Назначение документа:** Единый источник правды (Single Source of Truth) для AI-агентов и разработчиков. Содержит исчерпывающую информацию о проекте: контекст, архитектурные требования, функциональный объем («что нужно сделать»), технические ограничения и критерии приемки («к какому результату прийти»). Пошаговый план реализации составляется руководителем отдельно.

---

## 1. ОБЗОР ПРОЕКТА (PROJECT OVERVIEW)

* **Название проекта:** Интерактивный веб-модуль «EasyLab Quest & Endless Arcade».
* **Заказчик:** Онлайн-школа программирования для детей и подростков **Easycode** (`easycode-lab.ru`).
* **Целевая аудитория:** Ученики школы в возрасте от 6 до 17 лет (ядро — 12 лет). Высокие требования к геймификации, мгновенному визуальному отклику, дружелюбным игровым механикам и мобильной адаптивности.
* **Форм-фактор:** Высокопроизводительное веб-приложение (SPA), функционирующее автономно и внутри образовательной платформы EasyLab через изолированный `iframe` (или Web Component).

### Ключевой пользовательский сценарий (End-to-End User Flow)
1. **Экран 1: Сюжетный квест по комнатам (Строго 1 загадка на 1 комнату):**
   * Ученик начинает квест в стартовой локации. В каждой комнате находится **ровно одна интерактивная логическая загадка**.
   * Решение загадки открывает дверь/проход на следующий этап и перемещает игрока в следующую комнату дальше по сюжету.
   * Всего в сюжете 4 последовательные комнаты. Максимально возможный баланс — **до 75 EasyCoins** (макс. 10 + 15 + 20 + 30).
   * **Динамическое начисление монет:** Количество начисленных коинов **не фиксировано строго**, а зависит от прохождения квеста учеником (число попыток, использование подсказок или точность ответа). Ученик может набрать любую сумму в пределах максимума (например, 45, 60 или 75 EasyCoins).
2. **Экран триумфа квеста и авто-фиксация для куратора:**
   * Как только квест полностью пройден, игроку высвечивается праздничное меню о прохождении.
   * Меню отображает **Личный ID игрока (проверочный код формата `EZ-XXXX`)**, **фактически заработанные EasyCoins** и **приглашение сыграть в Endless Arcade**.
   * **Автоматическая синхронизация с реестром куратора:** В момент финиша квеста (до перехода в аркаду) данные автоматически отправляются в облачную базу и таблицу куратора, где куратор мгновенно видит: кто прошел, когда, **сколько именно монет заработал ученик** и проверочный код.
3. **Блокировка повторного прохождения квеста (One-Time Quest):**
   * Квест **нельзя пройти повторно**. После завершения он перманентно блокируется для игрока.
   * При перезагрузке страницы или повторном визите игрок сразу перенаправляется на экран Аркады и Лидерборда со своим сохраненным личным ID. Возможность повторного фарма монет исключена.
4. **Экран 2: Endless Arcade & Экран 3: Лидерборд:**
   * **Рейтинг существует ТОЛЬКО в аркаде!** Доступ к аркаде и рейтинговой таблице открывается **исключительно после завершения квеста**.
   * Игрок соревнуется в бесконечном вертикальном 2D-джампере (60 FPS) за максимальную высоту/очки.
   * **Призы за ТОП-3:** Ученики, удерживающие **1, 2 и 3 призовые места** в рейтинге школы на момент подведения итогов, получают реальные призы и мерч от Easycode.
5. **Связь с платформой (EasyLab Bridge):**
   * При работе внутри платформы EasyLab (`easycode-lab.ru`) фактически заработанные EasyCoins, код `EZ-XXXX` и игровой рекорд передаются родительскому окну через `window.postMessage`.

---

## 2. ЧТО НУЖНО СДЕЛАТЬ (SCOPE OF WORK)

### 2.1. Архитектурный каркас и виртуальный Viewport
* **Стек технологий:** Vite, TypeScript / Modern ES6+, Vanilla CSS (изоляция стилей через БЭМ-префикс `ezq-`), HTML5 Canvas API. Никаких тяжелых фреймворков и библиотек.
* **Относительные пути сборщика:** Сборка в `vite.config.ts` с параметром `base: './'` для гарантии работы из любых подпапок или CDN.
* **Адаптивный Viewport:**
  * Квест: базовая виртуальная сцена **1600 × 900 (16:9)** с масштабированием `contain` (Letterbox/Pillarbox) и бесшовными декоративными текстурами по краям.
  * Аркада: вертикальный формат **450 × 800** (адаптивная центрированная сцена для мобильных и ПК).
  * Поддержка Safe-Area для безрамочных смартфонов (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
* **Блокировка паразитных жестов:** CSS-правила `touch-action: none` на холсте, `touch-action: manipulation` на кнопках; отключение системного зума по двойному тапу и pull-to-refresh свайпов в Safari/Chrome.
* **Стейт-менеджер (Store):**
  * Строго типизированная модель состояния `EasyQuestGameState`.
  * Персистентность: сохранение в `localStorage` по ключу `ezq_save_v1` при переходе между комнатами, начислении монет и фиксации рекорда.
  * Флаг блокировки квеста (`quest.isCompleted = true`): если квест пройден, стартовым экраном автоматически становится Аркада.

---

### 2.2. Экран 1: Сюжетный квест по комнатам (Правило: 1 комната = 1 загадка, динамические коины)
Квест построен как линейное сюжетное приключение по 4 комнатам. В каждой комнате расположен **ровно 1 активный интерактивный объект (загадка)**. Пока загадка не решена, переход в следующую комнату заблокирован.

* **Динамическая система наград (Смотря сколько наберет ученик):**
  * За каждую комнату установлен **максимальный пул монет**:
    * Комната 1: максимум **до 10 EasyCoins**
    * Комната 2: максимум **до 15 EasyCoins**
    * Комната 3: максимум **до 20 EasyCoins**
    * Комната 4: максимум **до 30 EasyCoins**
    * Максимальный суммарный итог: **до 75 EasyCoins**.
  * Точное количество монет рассчитывается исходя из качества решения: решение с первой попытки дает 100% награды, каждая неверная попытка или подсказка может незначительно уменьшать балл (но сохраняя минимум за успешное прохождение).
  * Текущий заработанный баланс отражается в HUD (анимированный счетчик монет).

* **Сюжетные комнаты:**
  * **Комната 1 (Рабочее место разработчика):**
    * *Визуализация:* Стартовая зона комнаты по референсу `IMAGE 2026-09-26 16:21:47.jpg` (ноутбук, рабочий стол, окно).
    * *Загадка 1:* «Переменные и типы данных» (сопоставление контейнеров и значений данных).
    * *Сюжетный переход:* После верного ответа загорается индикатор терминала, начисляются коины и открывается проход во 2-ю комнату.
  * **Комната 2 (Лаборатория робототехники / Умный шкаф):**
    * *Визуализация:* Зона шкафа, робота и электронных устройств.
    * *Загадка 2:* «Условные операторы (IF / ELSE)» (выбор ветки алгоритма робота по цвету сигнала датчика).
    * *Сюжетный переход:* Робот активируется, начисляются коины и разблокируется дверь в библиотеку знаний.
  * **Комната 3 (Библиотека знаний / Книжный шкаф):**
    * *Визуализация:* Зона книжных стеллажей и архивных полок.
    * *Загадка 3:* «Алгоритмические циклы (FOR / WHILE)» (сборка последовательности шагов повторения).
    * *Сюжетный переход:* Раскрывается потайная дверь в комнату маскота-котика.
  * **Комната 4 (Командный центр маскота Easycode):**
    * *Визуализация:* Зона отдыха с маскотом-котиком в худи, аудиосистемой и главным экраном.
    * *Загадка 4:* «Функции и передача аргументов» (передача правильной команды маскоту `runMission(code)`).
    * *Финал квеста:* Фиксируется итоговый заработанный баланс монет ученика (от 0 до 75), запускается завершающий экран триумфа.

---

### 2.3. Меню завершения квеста и перманентная блокировка
Как только решена 4-я загадка:
1. **Всплывает праздничное меню прохождения:**
   * Сообщение об успешном завершении обучения с выводом **фактически набранных EasyCoins** (например: *«Поздравляем! Ты заработал 65 EasyCoins из 75 возможных!»*).
   * **Личный ID ученика (Верификационный проверочный код):** генерируется уникальный код вида `EZ-XXXX` (например, `EZ-8492`).
   * Кнопка «Скопировать личный ID для куратора» (с анимацией успешного копирования в буфер обмена).
   * **Яркая кнопка-приглашение: «Сыграть в Аркаду и войти в ТОП-3!»** с пояснением о розыгрыше призов.
2. **Жесткая блокировка повторного прохождения (One-Time Completion):**
   * В стейте выставляется `quest.isCompleted = true` и фиксируется `completedAt`.
   * **Повторно пройти квест нельзя:** при попытке вернуться назад или при повторном открытии сайта квест недоступен. Игрок видит свой профиль с личным ID и сразу попадает в Аркаду.
   * Начисление монет навсегда зафиксировано на фактически набранном значении (нельзя перепройти квест ради фарма недостающих монет).

---

### 2.4. Экран 2: Endless Canvas Jumper (Аркада)
* **Доступность:** Заблокирована до полного завершения квеста. Открывается только после получения личного ID.
* **Движок и физика (HTML5 Canvas 60 FPS):**
  * Фиксированный физический шаг дельта-тайминга (`fixed delta time = 16.6ms`) для предотвращения проваливания сквозь платформы при скачках FPS.
  * Реалистичная гравитация, импульс прыжка при приземлении сверху, вертикальный скролл камеры.
  * Процедурная генерация платформ с детерминированным сидом и возрастающей сложностью (статичные → движущиеся → исчезающие).
  * Горизонтальный Screen Wrapping (вылет слева — появление справа).
* **Управление:**
  * Десктоп: стрелки `ArrowLeft` / `ArrowRight`, клавиши `A` / `D`.
  * Мобилки: разделенный экран (левая половина — влево, правая — вправо) с мягким визуальным тач-откликом.
* **Game Over:**
  * Падение вниз фиксирует счет (набранная высота в очках), время забега и число прыжков.
  * Переход к экрану лидерборда.

---

### 2.5. Экран 3: Лидерборд с призами за ТОП-3 и Supabase REST
* **Правило рейтинга:** **Рейтинг ведется ТОЛЬКО в аркаде.** В квесте рейтинга нет — квест является квалификационным допуском к борьбе за призы.
* **Призовые места (ТОП-3):**
  * В шапке лидерборда выводится яркий мотивационный блок: **«Удерживай позиции в ТОП-3 школы и получи фирменный мерч от Easycode!»**.
  * Места 1, 2 и 3 выделены особыми фирменными бейджами:
    * 🥇 **1 место:** Золотой бейдж + отметка «Главный приз»
    * 🥈 **2 место:** Серебряный бейдж + отметка «Призовой мерч»
    * 🥉 **3 место:** Бронзовый бейдж + отметка «Призовой мерч»
    * Места 4–10: Стандартные ранги участников.
* **Интеграция с Supabase (Zero-Dependency REST):**
  * Сервис на нативном `fetch` без сторонних библиотек (< 3 КБ кода).
  * Загрузка ТОП-10 рекордов: `GET /rest/v1/leaderboard?order=score.desc,created_at.asc&limit=10`.
  * Безопасная отправка рекорда через RPC-процедуру `submit_arcade_score`.
* **Античит-валидация:**
  * Запрет отправки счета без пройденного квеста и без валидного кода `EZ-XXXX`.
  * Проверка скорости набора очков: `score / time_spent <= 120 очков/сек`.
  * Защита от спама и повторной отправки одной и той же сессии.
  * Экранирование XSS в никнеймах игроков (2–16 символов).
  * Оффлайн-очередь (`pending_scores`) при нестабильном интернет-соединении.

---

### 2.6. Модуль автоматического учета для куратора (Curator Verification Table)
Чтобы куратор мог мгновенно проверить, действительно ли ребенок прошел квест, и начислить ему в платформе EasyLab **ровно столько коинов, сколько он заработал**, организуется **автоматический реестр прохождений**:

1. **Автоматическая отправка при финише квеста:**
   * В момент решения 4-й загадки клиентское приложение в фоновом режиме отправляет запись о прохождении через `POST /rest/v1/quest_completions` (или на защищенный Webhook).
   * Сохраняемые данные:
     * `verification_code`: личный код формата `EZ-XXXX` (уникальный ключ поиска);
     * `player_name`: позывной / имя ученика;
     * `student_id`: ID ученика (если был передан из платформы EasyLab);
     * `coins_earned`: **фактическое количество заработанных коинов** (динамическое число, набранное учеником);
     * `rooms_solved`: **4** из 4;
     * `completed_at`: точная дата и время завершения;
     * `is_awarded`: статус начисления (`false` — ожидает начисления / `true` — начислено).
2. **Как куратор проверяет данные (2 готовых удобных формата):**
   * **Формат А: Автоматическая Google Таблица (через Webhook / Google Apps Script)**:
     * При отправке данных срабатывает триггер (Webhook), который вставляет новую строку в Google Таблицу школы в реальном времени.
     * Столбцы: `[Время] | [Код EZ-XXXX] | [Имя ученика] | [ID] | [Заработано коинов] | [Статус]`.
     * Куратор открывает Google Таблицу, нажимает `Ctrl+F`, вставляет присланный ребенком код (например, `EZ-8492`) и сразу видит: сколько именно коинов набрал ученик (например, 55 или 70), дату и время.
   * **Формат Б: Служебная страница верификации куратора (`verify.html` / `admin.html`)**:
     * Легковесная страница в составе проекта (доступная по секретной ссылке куратора).
     * Интерактивная строка поиска: вводишь `EZ-8492` → мгновенно отображается карточка ученика:
       * 🟢 Статус: «Квест пройден. Заработано: **[X]** EasyCoins».
       * Кнопка в 1 клик: «Отметить коины как начисленные».
     * Режим авто-обновления списка последних 50 завершений каждые 15 секунд.

---

### 2.7. EasyLab Bridge (Интеграция с платформой `easycode-lab.ru`)
* **Протокол postMessage:** Двусторонний обмен с валидацией origin (`easycode-lab.ru`, `*.easycode-lab.ru`).
* **Вход:** Получение `EASYLAB_AUTH_INIT` (ID ученика, имя, тема оформления).
* **Выход:** Отправка `EASYLAB_QUEST_COMPLETED` (фактически заработанные EasyCoins, код `EZ-XXXX`) и `EASYLAB_GAME_FINISHED` (финальный рекорд аркады).
* **Гостевой режим:** Полная автономность при запуске вне iframe.
* **Тестовый стенд `parent_test.html`:** Обязательный стенд для проверки интеграции.

---

## 3. К КАКОМУ РЕЗУЛЬТАТУ ПРИЙТИ (DEFINITION OF DONE)

Проект считается завершенным при соблюдении следующих критериев:

### 3.1. Архитектура и сборка
- [ ] Проект разворачивается через `npm run dev` и билдится без ошибок командой `npm run build`.
- [ ] Сборка в `dist/` использует относительные пути (`./`), размер бандла без звука не превышает **1.8 МБ**.
- [ ] Все стили изолированы префиксом `ezq-`, глобальные теги DOM не затронуты.

### 3.2. Сюжетный квест и учет куратора
- [ ] Реализовано 4 сюжетных комнаты с линейным переходом (Комната 1 → 2 → 3 → 4).
- [ ] В каждой комнате доступна **ровно одна загадка**. До ее решения переход дальше невозможен.
- [ ] Начисление монет является **динамическим** (зависит от прохождения и успешности решения задач учеником, в пределах максимума до 75 коинов).
- [ ] При прохождении 4-й комнаты появляется диалог триумфа с **Личным ID (`EZ-XXXX`)**, количеством заработанных монет, кнопкой копирования и инвайтом в Аркаду.
- [ ] **Квест повторно пройти нельзя:** после прохождения квест перманентно заблокирован. Повторное открытие страницы сразу перенаправляет в Аркаду, баланс монет не удваивается.
- [ ] **Авто-учет куратора:** В момент финиша квеста запись автоматически сохраняется в таблицу (Supabase / Google Sheets). Куратор может найти ученика по коду `EZ-XXXX` и увидеть **фактически заработанное количество монет** для начисления в профиль.

### 3.3. Endless Arcade и Лидерборд
- [ ] Доступ к Аркаде и Лидерборду открывается **только после завершения квеста**.
- [ ] Canvas-аркада выдает стабильные 60 FPS на ПК и мобильных без дрожания физики.
- [ ] Управление на мобильных устройствах не вызывает зума или системного скролла.
- [ ] Рейтинг ведется **исключительно в аркаде**.
- [ ] В Лидерборде четко выделен **ТОП-3 с призовыми бейджами** и сообщением о розыгрыше призов/мерча Easycode.
- [ ] Античит блокирует отправку нереалистичных результатов (скорость > 120 очков/сек) и результатов без кода `EZ-XXXX`.

### 3.4. Надежность и интеграция
- [ ] Прогресс синхронизируется в `localStorage`: перезагрузка вкладки не сбрасывает статус прохождения квеста, код `EZ-XXXX`, набранные монеты и рекорд.
- [ ] Файл `parent_test.html` успешно принимает события о заработанных монетах, коде `EZ-XXXX` и рекорде через `postMessage`.

---

## 4. СТРУКТУРА ДАННЫХ (DATA MODEL)

### 4.1. Единый интерфейс состояния (`EasyQuestGameState`)
```typescript
export interface EasyQuestGameState {
  meta: {
    version: "1.0.0";
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    isEmbedded: boolean;
    platformStudentId: string | null;
  };
  navigation: {
    currentScreen: "quest" | "arcade" | "leaderboard";
    currentRoomIndex: 1 | 2 | 3 | 4; // 1 загадка на 1 комнату
    isAudioMuted: boolean;
  };
  quest: {
    totalCoinsEarned: number;        // Фактически набранное число коинов (динамическое)
    maxPossibleCoins: 75;            // Теоретический максимум
    isCompleted: boolean;            // Флаг перманентного завершения
    completedAt: number | null;
    verificationCode: string | null; // Личный ID формата "EZ-XXXX"
    isSyncedWithCurator: boolean;    // Флаг успешной отправки в реестр куратора
    rooms: {
      1: { id: "room_variables"; title: "Рабочее место"; maxReward: 10; earnedCoins: number; isSolved: boolean; attempts: number };
      2: { id: "room_conditions"; title: "Умный шкаф / Робот"; maxReward: 15; earnedCoins: number; isSolved: boolean; attempts: number };
      3: { id: "room_loops"; title: "Библиотека знаний"; maxReward: 20; earnedCoins: number; isSolved: boolean; attempts: number };
      4: { id: "room_functions"; title: "Командный центр маскота"; maxReward: 30; earnedCoins: number; isSolved: boolean; attempts: number };
    };
  };
  arcade: {
    isUnlocked: boolean;             // Разблокируется ТОЛЬКО после quest.isCompleted
    highScore: number;
    totalRunsPlayed: number;
    lastRun: {
      runId: string;
      score: number;
      durationSeconds: number;
      jumpsCount: number;
      timestamp: number;
    } | null;
  };
  leaderboard: {
    playerName: string;
    hasSubmittedScore: boolean;
    lastSubmittedScore: number;
    currentRank: number | null;
    isTop3Winner: boolean;           // Флаг призового места (1-3)
  };
}
```

### 4.2. Схема базы данных Supabase (PostgreSQL DDL)

```sql
-- 1. Таблица учета завершений квеста для куратора (Верификация кодов и динамических монет)
CREATE TABLE IF NOT EXISTS public.quest_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_code VARCHAR(10) NOT NULL UNIQUE, -- Код "EZ-XXXX"
    player_name VARCHAR(32) NOT NULL,
    student_id TEXT NULL,                          -- ID из EasyLab
    coins_earned INTEGER NOT NULL CHECK (coins_earned >= 0 AND coins_earned <= 75), -- Динамическое число
    rooms_solved INTEGER NOT NULL DEFAULT 4,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    is_awarded BOOLEAN DEFAULT FALSE,              -- Начислены ли коины в платформу
    awarded_at TIMESTAMPTZ NULL
);

-- Индекс для мгновенного поиска по коду куратором (< 10 мс)
CREATE INDEX IF NOT EXISTS idx_quest_verification 
ON public.quest_completions (verification_code);

-- 2. Таблица лидеров аркады
CREATE TABLE IF NOT EXISTS public.leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    student_id TEXT NULL,
    player_name VARCHAR(16) NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 50000),
    time_spent_seconds INTEGER NOT NULL CHECK (time_spent_seconds >= 5),
    verification_code VARCHAR(10) NOT NULL REFERENCES public.quest_completions(verification_code),
    jumps_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_top 
ON public.leaderboard (score DESC, created_at ASC);
```

---

## 5. ИНЖЕНЕРНЫЕ ПРАВИЛА И ОГРАНИЧЕНИЯ

1. **Строгая изоляция стилей:** Только селекторы с префиксом `.ezq-*`. Никаких глобальных стилей на `body`, `div`, `canvas`.
2. **Нулевые тяжелые зависимости:** Никаких громоздких библиотек — чистый Canvas, нативный fetch, Vite.
3. **Безопасность:** Защита от XSS при выводе никнеймов в лидерборде.
4. **Однократность прохождения:** Логика квеста должна жестко гарантировать, что один и тот же игрок/сессия не может перезапустить квест или повторно зафармить монеты.
5. **Динамический подсчет монет:** Количество монет не должно быть захардкожено; оно рассчитывается по факту прохождения и строго передается в базу данных, таблицу куратора и `postMessage`.
6. **Приоритет мобильного опыта:** Ученики часто играют со смартфонов — отзывчивый тач, отсутствие задержек в 300мс и поддержка Safe Area обязательны.

<!-- autopilot:start -->
# EasyLab Quest & Endless Arcade — рабочая память

Веб-модуль для учеников школы Easycode (6–17 лет): квест из 4 комнат с динамическими EasyCoins и кодом `EZ-XXXX` → аркада-джампер с сезонным рейтингом; плюс кабинет куратора и стенд интеграции с платформой EasyLab.

## Команды

```bash
npm install                                   # только devDependencies; браузеры Playwright не нужны — e2e идут в установленном Google Chrome
npm run dev                                   # Vite: /, /verify.html, /parent_test.html
npm run build                                 # tsc --noEmit (включая tests/) + vite build → dist/ (3 входа)
npm run preview                               # раздать dist/
npm run check:size                            # dist/ ≤ 1.8 МБ и REST-клиент < 3000 Б; сначала build; другая папка: node scripts/check-size.mjs <dir>
npm test                                      # vitest run: unit + DOM (happy-dom) + SQL (PGlite)
npx vitest run tests/rules.test.ts            # один файл
npm run check:css                             # только линтер префикса ezq-
npx playwright test                           # все e2e (= npm run test:e2e)
npx playwright test tests/e2e/arcade.spec.ts  # один e2e-файл (webServer-сборки всё равно поднимутся)
EZQ_FINAL_SHOTS=1 npx playwright test tests/e2e/acceptance.spec.ts  # перезаписать final-*.png
EZQ_SHOTS=1 npx playwright test tests/e2e/arcade.spec.ts            # снять 2 пропускаемых теста скриншотов аркады
```

## Структура

```
index.html, verify.html, parent_test.html  # три входа сборки (vite.config.ts → rollupOptions.input)
src/core/          # types.ts (все общие типы), state.ts (store + ezq_save_v1), rules.ts (монеты, код, ник, античит)
src/app/           # mountApp: проводка сервисов, роутер с охраной, shell (fitStage, тосты, жесты), app.css с токенами
src/quest/         # 4 загадки (puzzles.ts), controller.ts (ход квеста без DOM), сцена-камера по room.jpg, триумф
src/arcade/        # движок с фиксированным шагом (engine/clock), canvas-рендер, процедурные спрайты, экран профиля
src/leaderboard/   # экран рейтинга: ТОП-10, бейджи ТОП-3, позиция, сезон, авто-обновление
src/services/      # rest (fetch → PostgREST), curator, leaderboard (очередь), bridge (postMessage), sfx (WebAudio)
src/verify/        # кабинет куратора (verify.html)
src/parent-test/   # стенд моста (parent_test.html): модуль в iframe, форма AUTH_INIT, журнал
supabase/schema.sql                 # вся БД: таблицы, RLS, view leaderboard, RPC, триггер в Google-таблицу
integrations/google-apps-script/    # Code.gs — приёмник вебхука в Google Таблицу
docs/              # SUPABASE_SETUP.md, GOOGLE_SHEETS.md, INTEGRATION.md
tests/             # vitest (*.test.ts, services/, sql/, helpers/css-lint.ts), e2e/ (Playwright)
```

## Ключевые файлы

- `src/core/rules.ts` — `REWARDS` (награда по номеру верной попытки: [1-я, 2-я, 3+]), `rewardFor(room, attempts, hintsUsed)` (2 подсказки → 0), `generateVerificationCode`/`isValidVerificationCode`/`normalizeVerificationCode` (алфавит `CODE_ALPHABET` без 0/1/I/O; кириллица → латиница), `validatePlayerName` (2–16, мат-фильтр), `isRunPlausible` + `MAX_POINTS_PER_SECOND=120`, `MIN_RUN_SECONDS=5`, `MAX_SCORE=50000`.
- `src/core/state.ts` — `createStore({ storage, now?, win?, newSessionId? }) → { get, update(draft ⇒ void), subscribe((s, prev, 'local'|'external') ⇒ …), replace, isMemoryOnly, destroy }`; `SAVE_KEY='ezq_save_v1'`, битое сохранение уходит в `ezq_save_v1_corrupt`.
- `src/core/types.ts` — `EasyQuestGameState` (бриф §4.1 + поля с пометкой `// §2`), `RunResult`, `SubmitOutcome` (`counted|queued|rejected|demo`), `LeaderboardService`, `CuratorSync`.
- `src/app/app.ts` — `mountApp(root, { storage?, win?, rest?, bridge?, screens?, authWaitMs? })`, `questCompletedPayload(state)`; единственное место, где сервисы связываются между собой.
- `src/app/router.ts` — `resolveScreen` / `startScreen`: без квеста — только `quest`, после — `quest` недоступен.
- `src/app/screens.ts` — `SCREENS` (фабрики экранов) и `AppContext`.
- `src/quest/controller.ts` — `createQuestController(store, { onCompleted?, now?, randomFn? })`: `submit`, `useHint`, `canUseHint`, `advance`, `startQuest`, `currentReward`.
- `src/quest/puzzles.ts` — `PUZZLES[1..4]`: `check(answer)` чистая, `render(el, { onAnswerChange })`.
- `src/quest/scene.ts` — `ZONES`: фокус камеры и hotspot каждой комнаты в пикселях исходника 1586×992.
- `src/arcade/engine.ts` — `createWorld(seed, opts)`, `stepWorld(world, { left, right }, dt)`, `botInput`, `runStats`, `scoreForHeight` (1 очко = 10 px), пороги сложности `*_FROM`.
- `src/arcade/game.ts` — `createArcadeGame(canvas, { highScore, onGameOver, sfx?, readInput?, seed? })`, `newRunId()` (UUID v4), `newRunSeed()`.
- `src/arcade/screen.ts` — `mountArcadeScreen(host, { store, sfx, onGameOver, onOpenLeaderboard, dailyLimit?, autoStart?, readInput? })`, `recordRun(store, r, now)`.
- `src/services/rest.ts` — `createRestClient({ url, anonKey, fetchImpl?, timeoutMs=8000 })` → `{ isConfigured, select, rpc }`; ошибки `NotConfiguredError`, `NetworkError` (сеть/таймаут/5xx/408/429), `RpcError(code)` (`code` — префикс текста RAISE или `HTTP_<status>`).
- `src/services/curator.ts` — `syncNow()` → RPC `register_quest_completion`; `restoreByStudent(id)`; `startRetryLoop()` (30 с → ×2 до 5 мин, `online`).
- `src/services/leaderboard.ts` — `submitRun`, `flushQueue`, `fetchTop` (`TOP_QUERY`), `fetchStanding`, `fetchSeason`, `startRetryLoop`; очередь `ezq_pending_scores_v1` (≤ 50).
- `src/services/bridge.ts` — `createBridge({ win?, extraOrigins? })`, `isAllowedOrigin`, `parseExtraOrigins`.
- `src/verify/page.ts` — `mountVerifyPage(root, { rest, win?, refreshMs=15000 })`; `src/verify/format.ts` — время МСК.
- `supabase/schema.sql` — источник истины RPC-контракта (имена параметров, коды ошибок).

## Архитектура

- `src/main.ts` → `mountApp(#ezq-app)`: создаёт store, sfx, rest (из env), bridge, curator, leaderboard, controller; запускает оба retry-цикла; затем роутер монтирует экран в `.ezq-screen-host`.
- Экраны получают зависимости только через `AppContext` (`src/app/screens.ts`) и не импортируют друг друга; сервисы не знают про DOM.
- Состояние: всё пишется через `store.update` → сохранение в localStorage → подписчики. Store — единственная память между экранами и перезагрузками.
- Квест: `controller.submit` пишет попытку, затем монеты; 4-я комната одним update ставит `isCompleted`, `completedAt`, `verificationCode`, `arcade.isUnlocked` → `onCompleted` → `curator.syncNow()` + `bridge.sendQuestCompleted`.
- Аркада: game over → `recordRun` в store → через ~0.9 с `ctx.onGameOver` → `leaderboard.submitRun` (промис кладётся в `ctx.lastRun`) → `bridge.sendGameFinished` после ответа → роутер на `leaderboard`.
- Рейтинг: забег уходит на сервер только после `quest.isSyncedWithCurator`; `doFlush` сам зовёт `curator.syncNow()`. Отказы `CHEAT_SPEED/TOO_SHORT/SCORE_RANGE/NO_QUEST/BAD_CODE/RATE_LIMIT` удаляют забег из очереди, `BAD_NAME` держит до смены ника, сеть — backoff.
- Supabase: anon видит только view `public.leaderboard` и RPC (`SECURITY DEFINER`), таблицы закрыты RLS без политик.
  - Ученик: `register_quest_completion(p_code, p_player_name, p_student_id, p_coins, p_completed_at)`, `restore_by_student(p_student_id)`, `submit_arcade_score(p_run_id uuid, p_code, p_session_id, p_student_id, p_player_name, p_score, p_time_spent, p_jumps)`, `get_my_standing(p_code)`, `get_season_info()`.
  - Куратор (первый аргумент `p_secret`): `curator_check`, `curator_find`, `curator_recent`, `curator_set_awarded`, `curator_leaderboard`, `curator_set_hidden`, `curator_set_daily_limit`, `curator_set_countdown`, `curator_finish_season`, `curator_winners`.
  - Только SQL Editor: `ezq_set_curator_secret(secret)`. Коды ошибок: `NO_QUEST BAD_CODE BAD_NAME BAD_COINS CHEAT_SPEED TOO_SHORT SCORE_RANGE RATE_LIMIT CODE_TAKEN FORBIDDEN BAD_LIMIT`.
- Google Таблица: триггер `ezq_notify_sheets` (pg_net, при insert и смене `is_awarded`) шлёт `{ secret, event: 'insert'|'awarded', row }` в `integrations/google-apps-script/Code.gs` (`doPost`); URL и секрет — в `public.ezq_settings`.
- Мост: исходящие — конверт `{ source: 'ezq', version: 1, type, payload }`:
  - `EASYLAB_READY {}` при старте во iframe;
  - `EASYLAB_QUEST_COMPLETED { coinsEarned, maxCoins: 75, verificationCode, completedAt (ISO), studentId, rooms: [{ room, id, earnedCoins, maxReward, attempts, hintsUsed }] }` — повторно, если код перевыпущен;
  - `EASYLAB_GAME_FINISHED { score, highScore, seasonTotal, durationSeconds, jumpsCount, verificationCode }`.
  - Входящее: `{ type: 'EASYLAB_AUTH_INIT', payload: { studentId, name, theme } }` (конверт не обязателен), только от `window.parent` с разрешённого origin; `studentId` → `restoreByStudent`.
- Кабинет куратора: `src/verify/main.ts` → `mountVerifyPage`, работает только через RPC `curator_*`; секрет в адресе `verify.html#k=<секрет>`.

## Соглашения кода

- CSS: каждый составной селектор начинается с `.ezq-`, анимации `@keyframes ezq-*`; никаких тегов, `:root`, `*`, `@import`. Проверяет `tests/css-prefix.test.ts` по всем `src/**/*.css`.
- CSS-токены `--ezq-*` объявляются на корне страницы: `.ezq-root` (`src/app/app.css`), `.ezq-verify-root`, `.ezq-pt-root`. Светлая тема — `.ezq-root[data-ezq-theme="light"]`.
- Прокрутка работает только внутри `.ezq-scroll` (`blockGestures` гасит `touchmove` вне него); кнопки — класс `.ezq-btn`.
- Каждый экран сам импортирует свой CSS (`import './quest.css'` и т.п.).
- Правила монет, кода, ника и античита — только из `src/core/rules.ts`, свои копии не писать. Их серверные зеркала в `supabase/schema.sql` (`ezq_is_code`, `ezq_name_error`, 75/120/5/50000) меняются вместе с ними.
- Время для людей — `Europe/Moscow`, `ДД.ММ.ГГГГ ЧЧ:ММ`, через `src/verify/format.ts`.
- Пользовательские строки (ники, имена) — только `textContent`; `innerHTML` — лишь статичные SVG-константы.
- Новое поле состояния: добавить в `src/core/types.ts` и в `createInitialState` — старые сохранения дополнятся значениями по умолчанию (`mergeInto`); типы только расширять.
- `RunResult.runId` — UUID v4 (`newRunId`), иначе сервис подменит id и повтор может засчитаться дважды.
- DOM собирается через `el`/`button` из `src/core/dom.ts`, UUID — `newUuid` из `src/core/state.ts`; своих копий в экранах не заводить.
- Рантайм-зависимостей нет (в `package.json` только devDependencies); единственный растровый ассет — `src/assets/room.jpg`, остальное — canvas/CSS/inline SVG.
- Тексты интерфейса — по-русски, на «ты».

## Окружение

Типы — `src/vite-env.d.ts`, шаблон — `.env.example`. Все переменные вшиваются при сборке.
- `VITE_SUPABASE_URL` — адрес проекта Supabase; пусто → демо-режим.
- `VITE_SUPABASE_ANON_KEY` — anon-ключ для PostgREST; пусто → демо-режим.
- `VITE_BRIDGE_EXTRA_ORIGINS` — дополнительные разрешённые origin родителя (через запятую/пробел, маска `https://*.host`).
- Секрет куратора и вебхук Google-таблицы — не env, а данные БД (`ezq_set_curator_secret`, `public.ezq_settings`).

## Тесты

- Vitest: `tests/**/*.test.ts`, окружение по умолчанию `node`; DOM-тесты объявляют `// @vitest-environment happy-dom` первой строкой.
- Сервисы тестируются на фейковых `fetch` / `window` / storage (`tests/services/helpers.ts`), без сети.
- `tests/sql/schema.test.ts` — `supabase/schema.sql` в PGlite (Postgres в WASM): схема применяется дважды (проверка идемпотентности), RPC зовутся под ролью `anon`.
- Playwright (`playwright.config.ts`): `channel: 'chrome'`, браузеры не скачиваются.
  - 5231 — сборка без Supabase (демо) в `node_modules/.ezq-e2e/dist-demo`;
  - 5232 — сборка с `VITE_SUPABASE_URL=https://ezq-e2e.supabase.test`, запросы `/rest/v1/*` перехватывает `tests/e2e/support/supabase-mock.ts` на уровне контекста (iframe и verify.html видят ту же «базу»);
  - 5199 — `tests/e2e/arcade.spec.ts` поднимает свой Vite dev со страницей `tests/e2e/arcade-harness.html` (её нет в сборке).
- `reuseExistingServer: false` и `strictPort`: занятые 5231/5232/5199 валят прогон.
- Скриншоты — `tests/e2e/__screenshots__/`: `final-*.png` (в репо) пишутся только при `EZQ_FINAL_SHOTS=1`; `EZQ_SHOTS=1` включает скриншоты аркады (`arcade-*.png`, в репо не входят).

## Подводные камни

- Демо-режим: без `VITE_SUPABASE_*` `rest.isConfigured=false` — `syncNow()`→`'demo'`, `submitRun`→`{ kind: 'demo' }`, экран рейтинга показывает только личную статистику, verify.html — ошибку конфигурации. Квест и аркада работают полностью.
- После правки `.env` нужна пересборка: значения читаются из `import.meta.env` при сборке.
- e2e собирает в `node_modules/.ezq-e2e/`, `dist/` не трогает; `npm run check:size` меряет именно `dist/`.
- `npm run build` гоняет `tsc` и по `tests/` (tsconfig `include`): ошибка типов в тесте ломает сборку.
- `leaderboard` в Supabase — view над `leaderboard_entries`, а не таблица из брифа §4.2: там сумма засчитанных очков за активный сезон (`score` = сумма `counted_score`), а не лучший забег. Старая таблица `leaderboard` переименовывается в `leaderboard_legacy_v0`; CHECK-и брифа живут в `arcade_runs`.
- Засчитывается не больше дневного лимита на код (`ezq_daily_limit`, по умолчанию 3000, сутки по МСК); больше 60 забегов в сутки → `RATE_LIMIT`; после `ends_at` сезона забег пишется с 0.
- `store.get()` глубоко заморожен — менять только в `update(draft => …)`.
- Роутер сам реагирует только на `external`-изменения (другая вкладка). Локальная запись `navigation.currentScreen` экран не меняет — нужен `router.go` (так сделано после `restoreByStudent`).
- Локальное завершение квеста не уводит в аркаду: остаётся триумф, уход по кнопке; редирект — только при старте/перезагрузке или из другой вкладки.
- Завершение необратимо: `update` подхватывает завершённое сохранение из storage, а storage-событие с незавершённым квестом игнорируется.
- Квест: 1-я подсказка — только после ≥ 1 попытки; `INCOMPLETE` (ответ не собран) попыткой не считается; попытка сохраняется до показа результата.
- Сервер при совпадении кода сам выдаёт свободный и возвращает его в `verification_code` (`CODE_TAKEN` больше не отвечает); клиент применяет код из ответа — тост «Код обновлён» и повтор `EASYLAB_QUEST_COMPLETED`. Если у `student_id` уже есть прохождение, сервер вернёт `restored: true` со своими кодом и монетами — они перезапишут локальные.
- Лимит перебора кодов в SQL: 120 единиц в час на адрес (первый из `x-forwarded-for`, 128 корзин в схеме `ezq_private`); промах по коду — 4, найденная запись по `student_id` — 1, новая регистрация — 0. После лимита — `RATE_LIMIT`. Час окна — `ezq_rl_hour()`, тесты её подменяют.
- Во iframe модуль до 1500 мс (`AUTH_WAIT_MS`) ждёт `EASYLAB_AUTH_INIT` на экране загрузки. Исходящие сообщения до того, как известен origin родителя (из `document.referrer` или AUTH_INIT), копятся в очереди (≤ 20), `EASYLAB_READY` — не копится.
- Разрешены `https://easycode-lab.ru`, `https://*.easycode-lab.ru` (порт по умолчанию), собственный origin и `VITE_BRIDGE_EXTRA_ORIGINS` — поэтому `parent_test.html` работает с того же origin без настройки.
- «Четыре комнаты» — зоны одной картинки `src/assets/room.jpg` под CSS-камерой; координаты в `ZONES` заданы в пикселях исходника, не сцены 1600×900.
- `schema.sql` должен оставаться идемпотентным (тест прогоняет его дважды); триггер Google-таблицы создаётся, только если доступно расширение `pg_net`.

## Как здесь работает Autopilot

Сборка ведётся навыком `/autopilot`. Требования, спецификация и таски — в `.autopilot/`.
Прогресс — `.autopilot/dashboard.html`. Правило: требование из `manifest.md`
может снять только пользователь.

Если работа продолжается — скажи «продолжи автопилот»: состояние поднимется
из `.autopilot/state.js`, переспрашивать ничего не нужно.
<!-- autopilot:end -->
