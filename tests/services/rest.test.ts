import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { build } from 'vite';
import { createRestClient, NotConfiguredError, NetworkError, RpcError } from '../../src/services/rest';

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const cfg = (fetchImpl: typeof fetch, extra: object = {}) => ({
  url: 'https://abc.supabase.co/',
  anonKey: 'anon-key-123',
  fetchImpl,
  ...extra,
});

afterEach(() => vi.useRealTimers());

describe('services/rest', () => {
  it('без url/ключа — демо: isConfigured=false и NotConfiguredError, fetch не зовётся', async () => {
    const f = fakeFetch(() => json([]));
    const rest = createRestClient({ url: '', anonKey: 'k', fetchImpl: f.impl });
    expect(rest.isConfigured).toBe(false);
    await expect(rest.select('leaderboard')).rejects.toBeInstanceOf(NotConfiguredError);
    await expect(rest.rpc('get_season_info', {})).rejects.toBeInstanceOf(NotConfiguredError);
    expect(createRestClient({ url: 'https://x.supabase.co', anonKey: undefined, fetchImpl: f.impl }).isConfigured).toBe(false);
    expect(f.calls).toHaveLength(0);
  });

  it('select: GET на /rest/v1/<путь> с apikey и Bearer', async () => {
    const f = fakeFetch(() => json([{ player_name: 'Аня', score: 10 }]));
    const rest = createRestClient(cfg(f.impl));
    expect(rest.isConfigured).toBe(true);
    const rows = await rest.select('leaderboard?order=score.desc,created_at.asc&limit=10');
    expect(rows).toEqual([{ player_name: 'Аня', score: 10 }]);
    expect(f.calls[0].url).toBe('https://abc.supabase.co/rest/v1/leaderboard?order=score.desc,created_at.asc&limit=10');
    const h = new Headers(f.calls[0].init.headers);
    expect(h.get('apikey')).toBe('anon-key-123');
    expect(h.get('authorization')).toBe('Bearer anon-key-123');
    expect(f.calls[0].init.method ?? 'GET').toBe('GET');
  });

  it('rpc: POST JSON на /rest/v1/rpc/<name>, ответ-скаляр и null разбираются', async () => {
    const f = fakeFetch((c) => (c.url.endsWith('restore_by_student') ? json(null) : json({ counted: 5 })));
    const rest = createRestClient(cfg(f.impl));
    expect(await rest.rpc('submit_arcade_score', { p_score: 5 })).toEqual({ counted: 5 });
    expect(f.calls[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/submit_arcade_score');
    expect(f.calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ p_score: 5 });
    expect(new Headers(f.calls[0].init.headers).get('content-type')).toContain('application/json');
    expect(await rest.rpc('restore_by_student', { p_student_id: 'x' })).toBeNull();
  });

  it('ошибка PostgREST (RAISE EXCEPTION) → RpcError с кодом из префикса сообщения', async () => {
    const f = fakeFetch(() => json({ code: 'P0001', message: 'CODE_TAKEN: код уже занят', details: null, hint: null }, 400));
    const rest = createRestClient(cfg(f.impl));
    const err = (await rest.rpc('register_quest_completion', {}).catch((e: unknown) => e as RpcError)) as RpcError;
    expect(err).toBeInstanceOf(RpcError);
    expect(err.code).toBe('CODE_TAKEN');
    expect(err.status).toBe(400);
  });

  it('4xx без распознаваемого кода → RpcError HTTP_<status>', async () => {
    const f = fakeFetch(() => new Response('not found', { status: 404 }));
    const err = (await createRestClient(cfg(f.impl)).rpc('nope', {}).catch((e: unknown) => e as RpcError)) as RpcError;
    expect(err).toBeInstanceOf(RpcError);
    expect(err.code).toBe('HTTP_404');
  });

  it('сбой сети и 5xx → NetworkError', async () => {
    const down = fakeFetch(() => { throw new TypeError('Failed to fetch'); });
    await expect(createRestClient(cfg(down.impl)).select('leaderboard')).rejects.toBeInstanceOf(NetworkError);
    const s503 = fakeFetch(() => new Response('', { status: 503 }));
    await expect(createRestClient(cfg(s503.impl)).rpc('x', {})).rejects.toBeInstanceOf(NetworkError);
  });

  it('таймаут 8 с по умолчанию → NetworkError и запрос отменён', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const f = fakeFetch((c) => new Promise<Response>((_, reject) => {
      signal = c.init.signal ?? undefined;
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const p = createRestClient(cfg(f.impl)).rpc('slow', {}).catch((e: unknown) => e as RpcError);
    await vi.advanceTimersByTimeAsync(7_900);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toBeInstanceOf(NetworkError);
    expect(signal?.aborted).toBe(true);
  });

  it('модуль ≤ 3 КБ минифицированного кода', async () => {
    const out = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: true,
        lib: { entry: resolve(import.meta.dirname, '../../src/services/rest.ts'), formats: ['es'], fileName: 'rest' },
      },
    });
    const outputs = (Array.isArray(out) ? out : [out]) as Array<{ output: Array<{ type: string; code?: string }> }>;
    const code = outputs.flatMap((o) => o.output).filter((c) => c.type === 'chunk').map((c) => c.code ?? '').join('');
    expect(code.length).toBeGreaterThan(200);
    expect(new TextEncoder().encode(code).length).toBeLessThanOrEqual(3072);
  }, 30_000);
});
