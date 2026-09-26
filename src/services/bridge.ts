// EasyLab Bridge: обмен postMessage с платформой (истории 76–79).
// Входящие — только с разрешённых origin и только от родительского окна; исходящие — только
// на проверенный origin родителя (из document.referrer или из пришедшего AUTH_INIT). Вне iframe — тишина.
import type { RoomIndex, Theme } from '../core/types';

export const BRIDGE_SOURCE = 'ezq';
export const BRIDGE_VERSION = 1;
const PLATFORM_HOST = 'easycode-lab.ru';

export type BridgeOutType = 'EASYLAB_READY' | 'EASYLAB_QUEST_COMPLETED' | 'EASYLAB_GAME_FINISHED';

export interface BridgeEnvelope<T = unknown> {
  source: typeof BRIDGE_SOURCE;
  version: typeof BRIDGE_VERSION;
  type: BridgeOutType;
  payload: T;
}

/** `EASYLAB_AUTH_INIT` после очистки: пустое/кривое поле → null. */
export interface AuthInit {
  studentId: string | null;
  name: string | null;
  theme: Theme | null;
}

export interface QuestRoomReport {
  room: RoomIndex;
  id: string;
  earnedCoins: number;
  maxReward: number;
  attempts: number;
  hintsUsed: number;
}

export interface QuestCompletedPayload {
  coinsEarned: number;
  maxCoins: 75;
  verificationCode: string;
  completedAt: string; // ISO 8601
  studentId: string | null;
  rooms: QuestRoomReport[];
}

export interface GameFinishedPayload {
  score: number;
  highScore: number;
  seasonTotal: number;
  durationSeconds: number;
  jumpsCount: number;
  verificationCode: string | null;
}

type MessageEventLike = { origin: string; data: unknown; source: unknown };

/** Подмножество window, которое нужно мосту (для тестов — фейк). */
export interface BridgeWindow {
  location: { origin: string };
  document?: { referrer?: string } | null;
  parent: { postMessage(data: unknown, targetOrigin: string): void } | null;
  addEventListener(type: 'message', fn: (e: MessageEventLike) => void): void;
  removeEventListener(type: 'message', fn: (e: MessageEventLike) => void): void;
}

export interface Bridge {
  isEmbedded: boolean;
  onAuthInit(cb: (auth: AuthInit) => void): () => void;
  announceReady(): void;
  sendQuestCompleted(p: QuestCompletedPayload): void;
  sendGameFinished(p: GameFinishedPayload): void;
  destroy(): void;
}

function parseOrigin(s: string): URL | null {
  try {
    const u = new URL(s);
    return u.origin === s ? u : null;
  } catch {
    return null;
  }
}

function matchesPattern(u: URL, pattern: string): boolean {
  const star = pattern.indexOf('://*.');
  if (star < 0) return u.origin === pattern;
  const proto = pattern.slice(0, star + 1);
  const rest = pattern.slice(star + 4); // «.domain[:port]»
  return u.protocol === proto && `.${u.host}`.endsWith(rest) && u.host.length > rest.length - 1;
}

/** `https://easycode-lab.ru`, `https://*.easycode-lab.ru` (порт по умолчанию) или один из `extra` (точно / маска `*.`). */
export function isAllowedOrigin(origin: string, extra: readonly string[] = []): boolean {
  const u = parseOrigin(origin);
  if (!u) return false;
  if (u.protocol === 'https:' && u.port === '' && (u.hostname === PLATFORM_HOST || u.hostname.endsWith(`.${PLATFORM_HOST}`))) return true;
  return extra.some((p) => matchesPattern(u, p.trim()));
}

/** `VITE_BRIDGE_EXTRA_ORIGINS` — список через запятую/пробел. */
export function parseExtraOrigins(raw: string | undefined | null): string[] {
  return (raw ?? '').split(/[\s,]+/).map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

function parseAuth(data: unknown): AuthInit | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { type?: unknown; payload?: unknown };
  if (d.type !== 'EASYLAB_AUTH_INIT') return null;
  const p = (d.payload && typeof d.payload === 'object' ? d.payload : d) as Record<string, unknown>;
  return {
    studentId: str(p.studentId, 64),
    name: str(p.name, 32),
    theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : null,
  };
}

const devLog = (...args: unknown[]): void => {
  if (import.meta.env?.DEV) console.debug('[ezq bridge]', ...args);
};

export function createBridge(opts: { win?: BridgeWindow | null; extraOrigins?: readonly string[] } = {}): Bridge {
  const win = opts.win !== undefined ? opts.win : typeof window !== 'undefined' ? (window as unknown as BridgeWindow) : null;
  const parent = win?.parent ?? null;
  const isEmbedded = !!win && !!parent && (parent as unknown) !== (win as unknown);
  const allowed = [...(opts.extraOrigins ?? []), ...(win?.location.origin && win.location.origin !== 'null' ? [win.location.origin] : [])];

  let parentOrigin: string | null = null;
  const refOrigin = parseOrigin(safeReferrerOrigin(win));
  if (isEmbedded && refOrigin && isAllowedOrigin(refOrigin.origin, allowed)) parentOrigin = refOrigin.origin;

  const outbox: Array<BridgeEnvelope> = [];
  const listeners = new Set<(a: AuthInit) => void>();

  const post = (env: BridgeEnvelope): void => {
    if (!isEmbedded || !parent) return;
    if (!parentOrigin) {
      if (env.type !== 'EASYLAB_READY') outbox.push(env);
      if (outbox.length > 20) outbox.shift();
      return;
    }
    try {
      parent.postMessage(env, parentOrigin);
    } catch (e) {
      devLog('postMessage failed', e);
    }
  };
  const send = <T>(type: BridgeOutType, payload: T): void =>
    post({ source: BRIDGE_SOURCE, version: BRIDGE_VERSION, type, payload });

  const onMessage = (e: MessageEventLike): void => {
    if (!isEmbedded) return;
    const auth = parseAuth(e.data);
    if (!auth) return;
    if (!isAllowedOrigin(e.origin, allowed) || e.source !== parent) {
      devLog('ignored message from', e.origin);
      return;
    }
    if (parentOrigin !== e.origin) {
      parentOrigin = e.origin;
      outbox.splice(0).forEach(post);
    }
    listeners.forEach((cb) => cb(auth));
  };
  if (isEmbedded) win?.addEventListener('message', onMessage);

  return {
    isEmbedded,
    onAuthInit(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    announceReady: () => send('EASYLAB_READY', {}),
    sendQuestCompleted: (p) => send('EASYLAB_QUEST_COMPLETED', p),
    sendGameFinished: (p) => send('EASYLAB_GAME_FINISHED', p),
    destroy() {
      listeners.clear();
      if (isEmbedded) win?.removeEventListener('message', onMessage);
    },
  };
}

function safeReferrerOrigin(win: BridgeWindow | null): string {
  try {
    const r = win?.document?.referrer;
    return r ? new URL(r).origin : '';
  } catch {
    return '';
  }
}
