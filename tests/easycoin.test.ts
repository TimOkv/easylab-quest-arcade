// @vitest-environment happy-dom
// Фирменная монетка EasyCoin (история 6): тёмный круг, кольцо с засечками, белая «E».
import { describe, it, expect } from 'vitest';
import { coinIcon } from '../src/quest/effects';

describe('coinIcon — монетка EasyCoin', () => {
  it('отдаёт inline SVG с ободом, кольцом засечек и буквой E', () => {
    const icon = coinIcon();
    expect(icon.className).toBe('ezq-coin');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    const svg = icon.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('[data-ezq-coin="body"]')).not.toBeNull();
    expect(svg!.querySelector('[data-ezq-coin="rim"]')).not.toBeNull();
    const ticks = svg!.querySelector('[data-ezq-coin="ticks"]');
    expect(ticks?.getAttribute('stroke-dasharray')).toBeTruthy();
    const letter = svg!.querySelector('[data-ezq-coin="letter"]');
    expect(letter).not.toBeNull();
    expect(letter!.getAttribute('fill')?.toLowerCase()).toBe('#ffffff');
  });

  it('больше не жёлтая пиксельная монета', () => {
    const html = coinIcon().innerHTML.toLowerCase();
    expect(html).not.toContain('#ffc933');
    expect(html).not.toContain('crispedges');
  });

  it('класс передаётся как есть (летящая и крупная монетки)', () => {
    expect(coinIcon('ezq-coin ezq-coin--fly').className).toBe('ezq-coin ezq-coin--fly');
    expect(coinIcon('ezq-coin ezq-coin--lg').querySelector('[data-ezq-coin="letter"]')).not.toBeNull();
  });
});
