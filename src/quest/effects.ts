// Микроанимации квеста: процедурная монетка, «набегание» счётчика, вылет монет, конфетти.

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Пиксельная монетка EasyCoin (inline SVG, статичная разметка). */
export function coinIcon(className = 'ezq-coin'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg class="ezq-svg" viewBox="0 0 12 12" shape-rendering="crispEdges">
<rect x="3" y="0" width="6" height="12" fill="#b8860b"/><rect x="0" y="3" width="12" height="6" fill="#b8860b"/>
<rect x="1" y="1" width="10" height="10" fill="#b8860b"/>
<rect x="3" y="1" width="6" height="10" fill="#ffc933"/><rect x="1" y="3" width="10" height="6" fill="#ffc933"/>
<rect x="2" y="2" width="8" height="8" fill="#ffc933"/>
<rect x="3" y="2" width="3" height="1" fill="#fff3b0"/><rect x="2" y="3" width="1" height="3" fill="#fff3b0"/>
<rect x="5" y="3" width="3" height="1" fill="#b8860b"/><rect x="4" y="4" width="1" height="4" fill="#b8860b"/>
<rect x="5" y="5" width="2" height="1" fill="#b8860b"/><rect x="5" y="8" width="3" height="1" fill="#b8860b"/>
</svg>`;
  return span;
}

/** Плавно досчитывает число в `node` от текущего до `to` (~0.8 с). */
export function countUp(node: HTMLElement, from: number, to: number, ms = 800): void {
  if (from === to || reducedMotion()) {
    node.textContent = String(to);
    return;
  }
  const t0 = performance.now();
  const tick = (t: number): void => {
    const k = Math.min(1, (t - t0) / ms);
    const eased = 1 - (1 - k) ** 3;
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Несколько монеток вылетают из точки `from` и летят к `target`. */
export function flyCoins(layer: HTMLElement, from: DOMRect, target: DOMRect, count: number, onArrive?: () => void): void {
  const base = layer.getBoundingClientRect();
  const n = Math.max(1, Math.min(8, count));
  if (reducedMotion() || typeof Element.prototype.animate !== 'function') {
    onArrive?.();
    return;
  }
  let arrived = false;
  for (let i = 0; i < n; i++) {
    const c = coinIcon('ezq-coin ezq-coin--fly');
    layer.appendChild(c);
    const x0 = from.left + from.width / 2 - base.left - 14 + (Math.random() - 0.5) * 60;
    const y0 = from.top + from.height / 2 - base.top - 14 + (Math.random() - 0.5) * 30;
    const x1 = target.left + target.width / 2 - base.left - 14;
    const y1 = target.top + target.height / 2 - base.top - 14;
    const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 120;
    const my = Math.min(y0, y1) - 80 - Math.random() * 60;
    const anim = c.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${x0}px, ${y0 - 30}px) scale(1.2)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 0.9 },
      ],
      { duration: 900, delay: i * 70, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      c.remove();
      if (!arrived) {
        arrived = true;
        onArrive?.();
      }
    };
  }
}

const CONFETTI_COLORS = ['#0068ff', '#9bc4ff', '#ffffff', '#b8a4fc', '#54c8f4', '#00b8ff', '#e500e6', '#ffc933'];

/** Конфетти на canvas поверх `host` (~4.5 с), возвращает остановку. */
export function confetti(host: HTMLElement): () => void {
  if (reducedMotion()) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'ezq-confetti';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => canvas.remove();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = host.clientWidth || 360;
  const h = host.clientHeight || 640;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: Math.round(Math.min(160, w / 5)) }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.6,
    vx: (Math.random() - 0.5) * 2.4,
    vy: 1.5 + Math.random() * 3,
    s: 5 + Math.random() * 6,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.25,
    c: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  }));
  let raf = 0;
  const t0 = performance.now();
  const frame = (t: number): void => {
    const age = t - t0;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = age > 3500 ? Math.max(0, 1 - (age - 3500) / 1000) : 1;
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (age < 4500) raf = requestAnimationFrame(frame);
    else canvas.remove();
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };
}
