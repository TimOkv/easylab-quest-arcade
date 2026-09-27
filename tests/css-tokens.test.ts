// Цвета квеста и кнопки 🎵 — только токенами --ezq-* с корня .ezq-root (src/app/app.css).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Тело правила `.ezq-root { … }` в app.css — место объявления токенов. */
function rootTokens(): Set<string> {
  const css = stripComments(read('src/app/app.css'));
  const start = css.indexOf('.ezq-root {');
  const body = css.slice(start, css.indexOf('\n}', start));
  return new Set([...body.matchAll(/(--ezq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RAW_RGB = /rgba?\(\s*\d/g; // rgba(0, 104, 255, …) — без токена

describe('цвета — токенами', () => {
  it('quest.css: ни одного hex и rgba с числами, только var(--ezq-*) и rgba(var(--ezq-*-rgb), a)', () => {
    const css = stripComments(read('src/quest/quest.css'));
    expect(css.match(HEX)).toBeNull();
    expect(css.match(RAW_RGB)).toBeNull();
  });

  it('каждый токен цвета, который берут quest.css и кнопка 🎵, объявлен на .ezq-root', () => {
    const declared = rootTokens();
    const used = new Set<string>();
    for (const rel of ['src/quest/quest.css', 'src/app/app.css']) {
      for (const m of stripComments(read(rel)).matchAll(/var\((--ezq-[a-z0-9-]+)/g)) used.add(m[1]);
    }
    // не цвета: координаты затемнения и длительность «ожившего» декора ставит screen.ts на самом элементе
    const local = ['--ezq-wx', '--ezq-wy', '--ezq-wr', '--ezq-alive-s'];
    const missing = [...used].filter((t) => !declared.has(t) && !local.includes(t));
    expect(missing).toEqual([]);
  });

  it('фирменный синий — один источник: остальные токены синего собраны из --ezq-blue-rgb', () => {
    const css = stripComments(read('src/app/app.css'));
    expect(css.match(/--ezq-blue-rgb:\s*0, 104, 255;/g)).toHaveLength(1);
    expect(css).toContain('--ezq-blue: rgb(var(--ezq-blue-rgb));');
    expect(css.match(/#0068ff/gi)).toBeNull();
    expect(stripComments(read('src/quest/quest.css')).match(/0,\s*104,\s*255/g)).toBeNull();
  });

  it('screen.ts и shell.ts не зашивают цвета (canvas берёт --ezq-gold, черта 🎵 — класс .ezq-music__slash)', () => {
    for (const rel of ['src/quest/screen.ts', 'src/app/shell.ts']) {
      const src = read(rel);
      expect(src.match(/['"`]#[0-9a-fA-F]{3,8}['"`]/g), rel).toBeNull();
      expect(src.match(RAW_RGB), rel).toBeNull();
    }
    expect(read('src/quest/screen.ts')).toContain("'--ezq-gold'");
    const css = stripComments(read('src/app/app.css'));
    expect(css).toMatch(/\.ezq-music__slash \{[^}]*background: var\(--ezq-mute-slash\);/);
  });

  it('затемнение перехода берёт размер сцены, а не 1600×900 px', () => {
    const css = stripComments(read('src/quest/quest.css'));
    const start = css.indexOf('.ezq-qwipe {');
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('inset: 0;');
    expect(rule).not.toMatch(/1600px|900px|800px|450px/);
  });
});
