// Общие фейки для тестов сетевых сервисов: fetch по имени RPC, storage, store.
import { createRestClient } from '../../src/services/rest';
import { createStore } from '../../src/core/state';
import type { EasyQuestGameState, KeyValueStorage } from '../../src/core/types';

export class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

export type Reply = { status?: number; body?: unknown; networkDown?: boolean };
export type Handler = (args: any, path: string) => Reply;

/** Фейковый PostgREST: `routes[name]` отвечает на rpc/<name> и на select по первому сегменту пути. */
export function fakeServer(routes: Record<string, Handler>) {
  const calls: Array<{ path: string; args: any }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = String(url).replace('https://t.supabase.co/rest/v1/', '');
    const args = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, args });
    const name = path.startsWith('rpc/') ? path.slice(4) : path.split('?')[0];
    const h = routes[name];
    if (!h) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
    const r = h(args, path);
    if (r.networkDown) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(r.body ?? null), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  const rest = createRestClient({ url: 'https://t.supabase.co', anonKey: 'k', fetchImpl });
  const rpcCalls = (name: string) => calls.filter((c) => c.path === `rpc/${name}`);
  return { rest, calls, rpcCalls };
}

export const rpcError = (message: string, status = 400): Reply => ({ status, body: { code: 'P0001', message } });

export const demoRest = () => createRestClient({ url: '', anonKey: '' });

/** Store с пройденным квестом (или без) на фейковом storage. */
export function makeStore(patch?: (d: EasyQuestGameState) => void) {
  let t = 1_700_000_000_000;
  const store = createStore({ storage: new FakeStorage(), win: null, now: () => (t += 1000), newSessionId: () => 'sess-test' });
  store.update((d) => {
    d.leaderboard.playerName = 'Аня';
    d.quest.isCompleted = true;
    d.quest.completedAt = 1_699_000_000_000;
    d.quest.verificationCode = 'EZ-AB2C';
    d.quest.totalCoinsEarned = 58;
    d.arcade.isUnlocked = true;
    patch?.(d);
  });
  return store;
}
