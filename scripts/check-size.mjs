// Проверка бюджета бандла: dist/ не больше 1.8 МБ (R04).
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = Math.round(1.8 * 1024 * 1024);
const dir = process.argv[2] ?? 'dist';
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
  process.exit(1);
}
console.log(`check:size OK — ${dir}: ${mb(total)} МБ из 1.8 МБ`);
