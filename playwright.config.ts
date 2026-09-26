import { defineConfig } from 'playwright/test';

// Браузеры не скачиваются: используется установленный Google Chrome.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:4173/' },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
