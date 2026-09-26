// Линтер изоляции стилей (R05): только .ezq-*, @keyframes ezq-*, @media/@supports.

const COMPOUND_OK = /^\.ezq-[A-Za-z0-9_-]+/;

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return s.length;
}

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function checkSelector(sel: string): string | null {
  // Содержимое скобок (аргументы псевдоклассов, атрибуты) не является отдельным составным селектором.
  let flat = sel;
  for (let prev = ''; prev !== flat; ) {
    prev = flat;
    flat = flat.replace(/\([^()]*\)/g, '()').replace(/\[[^[\]]*\]/g, '[]');
  }
  const compounds = flat.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  if (compounds.length === 0) return `пустой селектор`;
  const bad = compounds.find((c) => !COMPOUND_OK.test(c));
  return bad ? `селектор «${sel.trim()}»: «${bad}» не начинается с .ezq-` : null;
}

function lintBlock(css: string, out: string[]): void {
  let i = 0;
  while (i < css.length) {
    const rest = css.slice(i);
    const brace = rest.indexOf('{');
    const semi = rest.indexOf(';');
    if (brace === -1 && semi === -1) {
      if (rest.trim()) out.push(`мусор в конце: «${rest.trim().slice(0, 40)}»`);
      return;
    }
    if (semi !== -1 && (brace === -1 || semi < brace)) {
      const stmt = rest.slice(0, semi).trim();
      if (stmt) out.push(`запрещённая инструкция «${stmt.slice(0, 40)}»`);
      i += semi + 1;
      continue;
    }
    const prelude = rest.slice(0, brace).trim();
    const close = matchBrace(rest, brace);
    const body = rest.slice(brace + 1, close);
    i += close + 1;
    if (prelude.startsWith('@')) {
      const name = prelude.split(/[\s(]/)[0].toLowerCase();
      if (name === '@media' || name === '@supports' || name === '@container') lintBlock(body, out);
      else if (/^@(-webkit-)?keyframes$/.test(name)) {
        const kf = prelude.slice(name.length).trim();
        if (!kf.startsWith('ezq-')) out.push(`@keyframes «${kf}» без префикса ezq-`);
      } else out.push(`запрещённое at-правило «${prelude.slice(0, 40)}»`);
      continue;
    }
    for (const sel of splitTop(prelude, ',')) {
      const err = checkSelector(sel);
      if (err) out.push(err);
    }
  }
}

export function lintCss(css: string): string[] {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  const out: string[] = [];
  lintBlock(clean, out);
  return out;
}
