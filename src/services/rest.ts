// HTTP к Supabase (PostgREST) на нативном fetch, без зависимостей (< 3 КБ минифицированного кода).

/** Сервер не настроен (нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — демо-режим. */
export class NotConfiguredError extends Error {}
/** Сеть недоступна, таймаут или временный сбой сервера (5xx/408/429) — стоит повторить позже. */
export class NetworkError extends Error {}
/** Сервер отверг запрос. `code` — префикс сообщения RAISE EXCEPTION (`CODE_TAKEN`, `BAD_NAME`…) или `HTTP_<status>`. */
export class RpcError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
  }
}

export interface RestConfig {
  url?: string | null;
  anonKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RestClient {
  isConfigured: boolean;
  /** GET /rest/v1/<pathWithQuery>. */
  select<T = unknown>(pathWithQuery: string): Promise<T>;
  /** POST /rest/v1/rpc/<name> с JSON-аргументами. */
  rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
}

export function createRestClient(cfg: RestConfig): RestClient {
  const base = (cfg.url ?? '').trim().replace(/\/+$/, '');
  const key = (cfg.anonKey ?? '').trim();
  const isConfigured = !!(base && key);
  const timeoutMs = cfg.timeoutMs ?? 8000;

  async function request<T>(path: string, body?: unknown): Promise<T> {
    if (!isConfigured) throw new NotConfiguredError('Supabase is not configured');
    const doFetch = cfg.fetchImpl ?? globalThis.fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    let text: string;
    try {
      res = await doFetch(`${base}/rest/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch (e) {
      throw new NetworkError(ctrl.signal.aborted ? 'timeout' : String((e as Error)?.message ?? e));
    } finally {
      clearTimeout(timer);
    }
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (res.ok) return data as T;
    const s = res.status;
    if (s >= 500 || s === 408 || s === 429) throw new NetworkError(`HTTP ${s}`);
    const msg = String((data as { message?: unknown } | null)?.message ?? text ?? '');
    throw new RpcError(/^[A-Z][A-Z0-9_]{2,}/.exec(msg)?.[0] ?? `HTTP_${s}`, msg, s);
  }

  return {
    isConfigured,
    select: (pathWithQuery) => request(pathWithQuery.replace(/^\/+/, '')),
    rpc: (name, args) => request(`rpc/${name}`, args ?? {}),
  };
}

/** Клиент по переменным окружения Vite (пусто → демо-режим). */
export function createRestClientFromEnv(fetchImpl?: typeof fetch): RestClient {
  const env = import.meta.env ?? {};
  return createRestClient({ url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY, fetchImpl });
}
