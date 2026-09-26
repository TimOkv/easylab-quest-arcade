import { describe, expect, it } from 'vitest';
import { newRunId } from '../src/arcade/game';

// Контракт interfaces.md: RunResult.runId — UUID v4 (сервис шлёт его как p_run_id uuid).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('arcade: runId забега', () => {
  it('UUID v4 даже там, где нет crypto.randomUUID (не-secure контекст iframe)', () => {
    let n = 0;
    const onlyRandomValues = {
      getRandomValues(a: Uint8Array<ArrayBuffer>) {
        const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        for (let i = 0; i < b.length; i++) b[i] = (n++ * 37 + 11) & 255;
        return a;
      },
    };
    const a = newRunId(onlyRandomValues);
    const b = newRunId(onlyRandomValues);
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });

  it('по умолчанию — тоже UUID v4', () => {
    expect(newRunId()).toMatch(UUID_V4);
  });
});
