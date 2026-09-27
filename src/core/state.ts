// Store состояния EasyQuestGameState с сохранением в localStorage['ezq_save_v1'].
import type { EasyQuestGameState, KeyValueStorage, RoomIndex, ScreenName } from './types';

export type { EasyQuestGameState } from './types';

export const SAVE_KEY = 'ezq_save_v1';
export const CORRUPT_KEY = 'ezq_save_v1_corrupt';
/** Дневной лимит засчитываемых очков по умолчанию (G09; куратор меняет). Не путать с лимитом 60 забегов/сутки (RATE_LIMIT). */
export const DEFAULT_DAILY_LIMIT = 3000;

export function createInitialState(now: number, sessionId: string): EasyQuestGameState {
  const room = <I extends string, T extends string, M extends number>(id: I, title: T, maxReward: M) => ({
    id, title, maxReward, earnedCoins: 0, isSolved: false, attempts: 0, hintsUsed: 0 as const,
  });
  return {
    meta: {
      version: '1.0.0',
      sessionId,
      createdAt: now,
      updatedAt: now,
      isEmbedded: false,
      platformStudentId: null,
      theme: 'dark',
    },
    navigation: { currentScreen: 'quest', currentRoomIndex: 1, isAudioMuted: false },
    quest: {
      totalCoinsEarned: 0,
      maxPossibleCoins: 75,
      isCompleted: false,
      completedAt: null,
      verificationCode: null,
      isSyncedWithCurator: false,
      syncAttempts: 0,
      lastSyncError: null,
      rooms: {
        1: room('room_variables', 'Рабочее место', 10),
        2: room('room_conditions', 'Умный шкаф / Робот', 15),
        3: room('room_loops', 'Библиотека знаний', 20),
        4: room('room_functions', 'Командный центр маскота', 30),
      },
    },
    arcade: { isUnlocked: false, highScore: 0, totalRunsPlayed: 0, bestHeightPx: 0, lastRun: null },
    leaderboard: {
      playerName: '',
      hasSubmittedScore: false,
      lastSubmittedScore: 0,
      currentRank: null,
      isTop3Winner: false,
      seasonTotal: 0,
      todayCounted: 0,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      isHidden: false,
      cachedTop: null,
    },
  };
}

// ---------------------------------------------------------------- валидация и миграция

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const SCREENS: readonly ScreenName[] = ['quest', 'arcade', 'leaderboard'];
const ROOMS: readonly RoomIndex[] = [1, 2, 3, 4];

/** Проверка обязательной формы §4.1 (аддитивные поля §2 могут отсутствовать). */
function hasRequiredShape(v: unknown): v is Obj {
  if (!isObj(v) || !isObj(v.meta) || !isObj(v.navigation) || !isObj(v.quest) || !isObj(v.arcade) || !isObj(v.leaderboard)) return false;
  const { meta, navigation: nav, quest, arcade, leaderboard: lb } = v;
  if (meta.version !== '1.0.0' || typeof meta.sessionId !== 'string' || typeof meta.createdAt !== 'number') return false;
  if (!SCREENS.includes(nav.currentScreen as ScreenName)) return false;
  if (!ROOMS.includes(nav.currentRoomIndex as RoomIndex)) return false;
  if (typeof quest.isCompleted !== 'boolean' || typeof quest.totalCoinsEarned !== 'number') return false;
  if (quest.verificationCode !== null && typeof quest.verificationCode !== 'string') return false;
  if (!isObj(quest.rooms)) return false;
  for (const i of ROOMS) {
    const r = quest.rooms[i];
    if (!isObj(r) || typeof r.attempts !== 'number' || typeof r.isSolved !== 'boolean' || typeof r.earnedCoins !== 'number') return false;
  }
  if (typeof arcade.highScore !== 'number') return false;
  if (typeof lb.playerName !== 'string') return false;
  return true;
}

/** Накладывает сохранённые значения на значения по умолчанию (совпадающие по типу). */
function mergeInto(def: unknown, raw: unknown): unknown {
  if (isObj(def)) {
    if (!isObj(raw)) return def;
    const out: Obj = { ...def };
    for (const k of Object.keys(def)) if (k in raw) out[k] = mergeInto(def[k], raw[k]);
    return out;
  }
  if (def === null) return raw === undefined ? null : raw;
  return typeof raw === typeof def ? raw : def;
}

function hydrate(raw: unknown): EasyQuestGameState | null {
  if (!hasRequiredShape(raw)) return null;
  const meta = raw.meta as Obj;
  const base = createInitialState(meta.createdAt as number, meta.sessionId as string);
  const merged = mergeInto(base, raw) as EasyQuestGameState;
  const lr = merged.arcade.lastRun as unknown;
  if (lr !== null) {
    if (!isObj(lr) || typeof lr.score !== 'number') merged.arcade.lastRun = null;
    else merged.arcade.lastRun = { seed: 0, countedScore: null, ...(lr as object) } as EasyQuestGameState['arcade']['lastRun'];
  }
  return merged;
}

function parse(text: string | null): EasyQuestGameState | null {
  if (text === null) return null;
  try {
    return hydrate(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Читает сохранение. Нет сохранения → null. Повреждённое (JSON/форма) → копия в
 * `ezq_save_v1_corrupt` и null. Исключения хранилища пробрасываются (их ловит store).
 */
export function loadState(storage: KeyValueStorage): EasyQuestGameState | null {
  const text = storage.getItem(SAVE_KEY);
  if (text === null) return null;
  const state = parse(text);
  if (state) return state;
  try {
    storage.setItem(CORRUPT_KEY, text);
  } catch {
    /* резерв не критичен */
  }
  return null;
}

// ---------------------------------------------------------------- store

/** source: 'local' — update/replace этой вкладки, 'external' — событие storage из другой вкладки. */
export type StoreListener = (state: EasyQuestGameState, prev: EasyQuestGameState, source: 'local' | 'external') => void;

export interface Store {
  /** Текущее состояние (глубоко заморожено — менять только через update). */
  get(): EasyQuestGameState;
  /** Мутатор получает изменяемую копию; после него состояние сохраняется и рассылается. */
  update(mutator: (draft: EasyQuestGameState) => void): void;
  subscribe(fn: StoreListener): () => void;
  replace(state: EasyQuestGameState): void;
  /** true — сохранение работает в памяти (localStorage недоступен). */
  isMemoryOnly(): boolean;
  destroy(): void;
}

export interface StorageEventSource {
  addEventListener(type: 'storage', fn: (e: Event) => void): void;
  removeEventListener(type: 'storage', fn: (e: Event) => void): void;
}

export interface CreateStoreOptions {
  storage: KeyValueStorage | null;
  now?: () => number;
  /** Источник событий `storage` (по умолчанию window; null — не слушать). */
  win?: StorageEventSource | null;
  newSessionId?: () => string;
}

export type UuidCrypto = { randomUUID?: () => string; getRandomValues?(a: Uint8Array<ArrayBuffer>): unknown };

/** UUID v4 — единственный генератор проекта (сессия, id забега): randomUUID, а без него (не-secure контекст) — из getRandomValues по RFC 4122. */
export function newUuid(c: UuidCrypto | undefined = globalThis.crypto): string {
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  let h = '';
  for (let i = 0; i < 16; i++) {
    h += b[i].toString(16).padStart(2, '0');
    if (i === 3 || i === 5 || i === 7 || i === 9) h += '-';
  }
  return h;
}

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Obj)[k]);
  }
  return v;
}

const clone = <T>(v: T): T => structuredClone(v);

export function createStore(opts: CreateStoreOptions): Store {
  const now = opts.now ?? (() => Date.now());
  let storage: KeyValueStorage | null = opts.storage;
  const listeners = new Set<StoreListener>();

  let loaded: EasyQuestGameState | null = null;
  if (storage) {
    try {
      loaded = loadState(storage);
    } catch {
      storage = null; // приватный режим / заблокировано → память
    }
  }
  let state = deepFreeze(loaded ?? createInitialState(now(), (opts.newSessionId ?? newUuid)()));

  const persist = (): void => {
    if (!storage) return;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      storage = null;
    }
  };
  const emit = (prev: EasyQuestGameState, source: 'local' | 'external' = 'local'): void => {
    for (const fn of [...listeners]) fn(state, prev, source);
  };
  /** Завершение квеста необратимо: запись устаревшей вкладки его не отменит. */
  const adoptCompletedFromStorage = (): void => {
    if (!storage || state.quest.isCompleted) return;
    try {
      const stored = parse(storage.getItem(SAVE_KEY));
      if (stored?.quest.isCompleted) state = deepFreeze(stored);
    } catch {
      /* нет доступа — работаем с тем, что есть */
    }
  };

  if (!loaded) persist();

  const onStorage = (e: Event): void => {
    const ev = e as Event & { key?: string | null; newValue?: string | null };
    if (ev.key !== SAVE_KEY) return;
    const next = parse(ev.newValue ?? null);
    if (!next) return;
    if (state.quest.isCompleted && !next.quest.isCompleted) return;
    const prev = state;
    state = deepFreeze(next);
    emit(prev, 'external');
  };
  const win = opts.win === undefined ? (typeof window !== 'undefined' ? window : null) : opts.win;
  win?.addEventListener('storage', onStorage);

  return {
    get: () => state,
    update(mutator) {
      const prev = state;
      adoptCompletedFromStorage();
      const draft = clone(state);
      mutator(draft);
      draft.meta.updatedAt = Math.max(now(), state.meta.updatedAt + 1);
      state = deepFreeze(draft);
      persist();
      emit(prev);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    replace(next) {
      const prev = state;
      state = deepFreeze(clone(next));
      persist();
      emit(prev);
    },
    isMemoryOnly: () => storage === null,
    destroy() {
      win?.removeEventListener('storage', onStorage);
      listeners.clear();
    },
  };
}
