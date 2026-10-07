/**
 * ACACIA `mario_style` celebration — part of an OPTIONAL portfolio style
 * (STANDARD.md §27). Byte-identical in every app that opts into it. Change it
 * in `jospabloh/acacia-app-standard` → `shared/mario_style/` and copy it out;
 * never edit an app's copy.
 *
 *   import { celebrate, pop } from '@/lib/celebrate';
 *
 *   const origin = document.activeElement;   // capture BEFORE the await
 *   await save();
 *   celebrate(origin);                        // confetti from that button
 *
 * Rules the call sites must keep (STANDARD.md §27):
 * - Only after the write SUCCEEDED, and only for finishing something (a paid
 *   charge, a resolved alert, a finished trip) — never on every edit or save.
 * - Never awaited, never blocking: it returns immediately and draws on its own.
 * - It is a no-op under prefers-reduced-motion and outside a browser.
 *
 * No dependencies: one fixed, click-through <canvas> created on demand and
 * removed when the last particle dies.
 */

const FALLBACK_COLORS = ['#2f6bf2', '#ffc53d', '#2fbf63', '#ff5d5d'];
const PARTICLES = 46;

let canvas = null;
let ctx = null;
let particles = [];
let frame = 0;

function reducedMotion() {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Colours come from `--play-confetti` (comma-separated) so each app keeps its palette. */
function palette() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--play-confetti');
    const list = raw.split(',').map((c) => c.trim()).filter(Boolean);
    return list.length ? list : FALLBACK_COLORS;
  } catch {
    return FALLBACK_COLORS;
  }
}

/** Where the burst starts: the element's centre if it is still on screen, else top-centre. */
export function originPoint(target) {
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (target && typeof target.x === 'number' && typeof target.y === 'number') return { x: target.x, y: target.y };
  if (target && target.isConnected && typeof target.getBoundingClientRect === 'function') {
    const r = target.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh) {
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  return { x: vw / 2, y: vh * 0.3 };
}

function ensureCanvas() {
  if (canvas && canvas.isConnected) return true;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.playConfetti = '';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '2147483646',
  });
  ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) { canvas = null; return false; }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round((window.innerWidth || 0) * dpr);
  canvas.height = Math.round((window.innerHeight || 0) * dpr);
  document.body.appendChild(canvas);
  return true;
}

function tick() {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => {
    p.vy += 0.35; p.vx *= 0.98; p.x += p.vx; p.y += p.vy; p.rot += 0.15; p.life -= 1;
    ctx.save();
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size * dpr * 0.6, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect((-p.size * dpr) / 2, (-p.size * dpr) / 4, p.size * dpr, (p.size * dpr) / 2);
    ctx.restore();
    return p.life > 0;
  });
  if (particles.length) {
    frame = window.requestAnimationFrame(tick);
  } else {
    frame = 0;
    canvas.remove();
    canvas = null;
    ctx = null;
  }
}

/**
 * Confetti burst. `target` is an Element (burst from its centre) or `{x, y}`
 * in viewport pixels; anything else bursts from the top of the screen.
 * Returns true when it drew, false when it deliberately did nothing.
 */
export function celebrate(target) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (reducedMotion()) return false;
  if (typeof window.requestAnimationFrame !== 'function') return false;
  if (!ensureCanvas()) return false;
  const { x, y } = originPoint(target);
  const colors = palette();
  for (let i = 0; i < PARTICLES; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      size: 4 + Math.random() * 5,
      color: colors[i % colors.length],
      life: 70 + Math.random() * 30,
      rot: Math.random() * 6,
      round: Math.random() < 0.5,
    });
  }
  if (!frame) frame = window.requestAnimationFrame(tick);
  return true;
}

/** Restartable one-shot bounce on an element (uses `.play-pop` from mario_style.css). */
export function pop(el) {
  if (!el || !el.classList || reducedMotion()) return false;
  el.classList.remove('play-pop');
  void el.offsetWidth; // restart the animation if it is already running
  el.classList.add('play-pop');
  return true;
}
