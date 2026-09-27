import { defineConfig } from 'playwright/test';
import { DEMO_URL, MOCK_URL, MOCK_SUPABASE } from './tests/e2e/support/supabase-mock';

// Браузеры не скачиваются: используется установленный Google Chrome.
// Приёмочные e2e идут на собранной сборке через `vite preview`:
//   5231 — сборка без Supabase (демо-режим, ровно то, что даёт `npm run build` без .env);
//   5232 — та же сборка, но с VITE_SUPABASE_URL на фейковый хост: запросы /rest/v1/* перехватывает page.route.
// Обе собираются в node_modules/.ezq-e2e/, чтобы не затирать боевой dist/ пользователя.
// 5199 занят e2e аркады (tests/e2e/arcade.spec.ts поднимает свой Vite dev).
const DEMO_DIST = 'node_modules/.ezq-e2e/dist-demo';
const MOCK_DIST = 'node_modules/.ezq-e2e/dist-mock';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: { channel: 'chrome', baseURL: DEMO_URL },
  webServer: [
    {
      command: `npx tsc --noEmit && npx vite build --outDir ${DEMO_DIST} --emptyOutDir --logLevel error && npx vite preview --outDir ${DEMO_DIST} --host 127.0.0.1 --port 5231 --strictPort`,
      url: DEMO_URL,
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npx vite build --outDir ${MOCK_DIST} --emptyOutDir --logLevel error && npx vite preview --outDir ${MOCK_DIST} --host 127.0.0.1 --port 5232 --strictPort`,
      url: MOCK_URL,
      env: { VITE_SUPABASE_URL: MOCK_SUPABASE, VITE_SUPABASE_ANON_KEY: 'e2e-anon-key-not-real' },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
