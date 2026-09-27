// Логотип Easycode (Решения §6, брендбук п. 2.1/2.7): знак «загрузки» — 7 скруглённых штрихов
// по кругу без верхнего левого — и слово «easy» + «code». Знак можно отдельно, слово без знака — нет.
// Возвращается статичная SVG-строка (вставляется через innerHTML — пользовательских данных в ней нет).
// SVG занимает 100% контейнера (brandRect предмета) и вписывается в него по центру.

import type { BrandKind } from './rooms';

export const EASYCODE_BLUE = '#0068FF';
export const EASYCODE_LIGHT = '#9BC4FF';

const FONT = "'TT Norms', 'TT Norms Pro', 'Nunito', 'Segoe UI', system-ui, sans-serif";

/** 7 радиальных штрихов вокруг (cx, cy) радиусом r; позиция «вверх-влево» пропущена. */
function loadingSign(cx: number, cy: number, r: number, color: string): string {
  const inner = r * 0.45;
  const width = (r * 0.26).toFixed(1);
  let out = '';
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4; // 0 — вправо, по часовой (ось y вниз)
    if (k === 5) continue; // 225° — верхний левый штрих
    const c = Math.cos(a);
    const s = Math.sin(a);
    const f = (v: number): string => v.toFixed(1);
    out += `<line x1="${f(cx + c * inner)}" y1="${f(cy + s * inner)}" x2="${f(cx + c * r)}" y2="${f(cy + s * r)}"/>`;
  }
  return `<g stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none">${out}</g>`;
}

function word(x: number, y: number, size: number, easy: string, code: string): string {
  return (
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${size}" letter-spacing="0.5">` +
    `<tspan fill="${easy}">easy</tspan><tspan fill="${code}">code</tspan></text>`
  );
}

function svg(viewBox: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" ` +
    `preserveAspectRatio="xMidYMid meet" role="img" aria-label="Easycode" focusable="false">${body}</svg>`
  );
}

const LOGOS: Record<BrandKind, string> = {
  // включённый экран: тёмный фон заливает весь контейнер (выходит за viewBox), знак и слово по центру
  screen: svg(
    '0 0 120 90',
    `<rect x="-600" y="-600" width="1320" height="1290" fill="#0A1230"/>` +
      `<rect x="-600" y="-600" width="1320" height="1290" fill="${EASYCODE_BLUE}" opacity="0.08"/>` +
      loadingSign(60, 34, 21, EASYCODE_BLUE) +
      word(60, 80, 21, '#FFFFFF', EASYCODE_BLUE),
  ),
  // магнит на холодильнике: белая плашка-магнитик, знак и слово в строку (слово растянуто textLength —
  // ширина не зависит от шрифта, «easycode» читается и на телефоне)
  magnet: svg(
    '0 0 110 40',
    `<rect x="1" y="1" width="108" height="38" rx="9" fill="#FFFFFF" stroke="#D5E4FF" stroke-width="1.5"/>` +
      loadingSign(19, 20, 12, EASYCODE_BLUE) +
      `<text x="36" y="26" font-family="${FONT}" font-weight="700" font-size="16" textLength="68" lengthAdjust="spacingAndGlyphs">` +
      `<tspan fill="#0A1230">easy</tspan><tspan fill="${EASYCODE_BLUE}">code</tspan></text>`,
  ),
  // постер на чердаке: знак и слово на синем
  poster: svg(
    '0 0 80 100',
    `<rect x="1" y="1" width="78" height="98" rx="4" fill="${EASYCODE_BLUE}"/>` +
      `<rect x="5" y="5" width="70" height="90" rx="2" fill="none" stroke="${EASYCODE_LIGHT}" stroke-width="1" opacity="0.6"/>` +
      loadingSign(40, 40, 20, '#FFFFFF') +
      word(40, 84, 13, '#FFFFFF', EASYCODE_LIGHT),
  ),
};

/** Логотип для бренд-оверлея предмета: экран компьютера, магнит, постер. */
export function easycodeLogoSvg(variant: BrandKind): string {
  return LOGOS[variant];
}
