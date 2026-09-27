// Проверка бюджетов сборки:
//  1) dist/ не больше 1.8 МБ (R04);
//  2) сетевой REST-клиент Supabase (src/services/rest.ts) — меньше 3 КБ минифицированного кода без gzip (бриф, spec §6).
//     Модуль собирается отдельно тем же Vite (minify, как в продакшене): в dist/ он делит общий чанк
//     с src/core/rules.ts (оба нужны index.html и verify.html), поэтому размер чанка — не размер клиента.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';

const LIMIT = Math.round(1.8 * 1024 * 1024);
const REST_ENTRY = 'src/services/rest.ts';
const REST_LIMIT = 3000; // «< 3 КБ» — строже и десятичных, и двоичных килобайт
const dir = process.argv[2] ?? 'dist';
let failed = false;

if (!existsSync(dir)) {
  console.error(`check:size — нет папки ${dir}, сначала npm run build`);
  process.exit(1);
}
const walk = (d) => readdirSync(d).reduce((sum, name) => {
  const p = join(d, name);
  const st = statSync(p);
  return sum + (st.isDirectory() ? walk(p) : st.size);
}, 0);
const total = walk(dir);
const mb = (n) => (n / 1024 / 1024).toFixed(3);
if (total > LIMIT) {
  console.error(`check:size FAIL — ${dir}: ${mb(total)} МБ > 1.8 МБ`);
  failed = true;
} else {
  console.log(`check:size OK — ${dir}: ${mb(total)} МБ из 1.8 МБ`);
}

const res = await build({
  configFile: false,
  logLevel: 'silent',
  root: process.cwd(),
  build: { write: false, minify: true, modulePreload: false, rollupOptions: { input: REST_ENTRY, preserveEntrySignatures: 'strict' } },
});
const chunks = (Array.isArray(res) ? res : [res]).flatMap((r) => r.output).filter((c) => c.type === 'chunk');
const restBytes = chunks.reduce((sum, c) => sum + Buffer.byteLength(c.code), 0);
if (restBytes >= REST_LIMIT) {
  console.error(`check:size FAIL — REST-клиент ${REST_ENTRY}: ${restBytes} Б ≥ ${REST_LIMIT} Б (минифицировано, без gzip)`);
  failed = true;
} else {
  console.log(`check:size OK — REST-клиент ${REST_ENTRY}: ${restBytes} Б из < ${REST_LIMIT} Б (минифицировано, без gzip)`);
}
if (failed) process.exit(1);
