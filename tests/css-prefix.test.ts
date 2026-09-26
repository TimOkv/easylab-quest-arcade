import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { lintCss } from './helpers/css-lint';

const ROOT = join(import.meta.dirname, '..');
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith('.css') ? [p] : [];
  });
}

describe('линтер CSS', () => {
  it('ловит нарушения', () => {
    expect(lintCss('body { margin: 0 }')).toHaveLength(1);
    expect(lintCss(':root { --ezq-a: 1px }')).toHaveLength(1);
    expect(lintCss('.ezq-root button { color: red }')).toHaveLength(1);
    expect(lintCss('.ezq-root > * { color: red }')).toHaveLength(1);
    expect(lintCss('.btn { color: red }')).toHaveLength(1);
    expect(lintCss('@keyframes spin { to { opacity: 1 } }')).toHaveLength(1);
    expect(lintCss('@media (max-width: 600px) { div { color: red } }')).toHaveLength(1);
    expect(lintCss('.ezq-a, canvas { color: red }')).toHaveLength(1);
    expect(lintCss('@import url(x.css);')).toHaveLength(1);
  });

  it('пропускает допустимое', () => {
    const ok = `
      /* комментарий body { } */
      .ezq-root { --ezq-blue: #0068FF; }
      .ezq-root[data-ezq-theme="light"] .ezq-panel:hover::before { content: "a{b}"; }
      .ezq-a > .ezq-b + .ezq-c ~ .ezq-d:not(.ezq-e) { color: red }
      @keyframes ezq-pop { 0% { opacity: 0 } 100% { opacity: 1 } }
      @media (orientation: portrait) { .ezq-sheet { bottom: 0 } }
      @supports (height: 100dvh) { .ezq-root { height: 100dvh } }
    `;
    expect(lintCss(ok)).toEqual([]);
  });

  it('все .css в src/ изолированы префиксом ezq-', () => {
    const files = cssFiles(join(ROOT, 'src'));
    expect(files.length).toBeGreaterThan(0);
    const problems = files.flatMap((f) => lintCss(readFileSync(f, 'utf8')).map((m) => `${relative(ROOT, f)}: ${m}`));
    expect(problems).toEqual([]);
  });
});
