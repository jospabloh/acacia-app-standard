// Canonical test for shared/mario_style/celebrate.js — copy it next to the app's
// copy (e.g. src/lib/__tests__/celebrate.test.js) and fix the import path only.
// Runs under vitest + jsdom.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { celebrate, originPoint, pop, splitColors } from '@/lib/celebrate';

function setReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: reduce && q.includes('reduce'), media: q,
    addEventListener() {}, removeEventListener() {},
  }));
}

afterEach(() => {
  document.querySelectorAll('canvas[data-play-confetti]').forEach((c) => c.remove());
  vi.restoreAllMocks();
});

describe('celebrate', () => {
  // The whole point of the reduced-motion rule: a user who asked the OS for
  // less motion must never get a screen full of moving confetti.
  it('draws nothing when the user asked for reduced motion', () => {
    setReducedMotion(true);
    expect(celebrate(document.body)).toBe(false);
    expect(document.querySelector('canvas[data-play-confetti]')).toBeNull();
  });

  // Call sites fire it after an await and never wrap it in try/catch: it must
  // not throw where the canvas API is missing (jsdom, old webviews).
  it('never throws when there is no 2D canvas, it just declines', () => {
    setReducedMotion(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => celebrate()).not.toThrow();
    expect(celebrate()).toBe(false);
  });

  // The canvas must never eat the click the user makes right after a success.
  it('adds a click-through canvas when it can draw', () => {
    setReducedMotion(false);
    const fakeCtx = { clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, arc() {}, fill() {}, fillRect() {} };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(/** @type {any} */ (fakeCtx));
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    expect(celebrate({ x: 10, y: 20 })).toBe(true);
    const c = /** @type {HTMLCanvasElement} */ (document.querySelector('canvas[data-play-confetti]'));
    expect(c).not.toBeNull();
    expect(c.style.pointerEvents).toBe('none');
  });
});

describe('originPoint', () => {
  // After an await the clicked button is often gone (modal closed): the burst
  // must still land somewhere visible instead of at 0,0 or off-screen.
  it('falls back to the top-centre when the element left the page', () => {
    const el = document.createElement('button'); // never attached
    const p = originPoint(el);
    expect(p.x).toBe(window.innerWidth / 2);
    expect(p.y).toBe(window.innerHeight * 0.3);
  });

  // A row that overflows sideways can push the button off-screen while it is
  // still attached: that counts as gone too, not as a burst drawn off-canvas.
  it('falls back to the top-centre when the element is off-screen sideways', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
      /** @type {DOMRect} */ ({ left: window.innerWidth + 50, right: window.innerWidth + 150, top: 10, bottom: 40, width: 100, height: 30 }),
    );
    expect(originPoint(el)).toEqual({ x: window.innerWidth / 2, y: window.innerHeight * 0.3 });
    el.remove();
  });

  it('uses explicit coordinates as given', () => {
    expect(originPoint({ x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
  });
});

describe('pop', () => {
  it('respects reduced motion too', () => {
    setReducedMotion(true);
    const el = document.createElement('div');
    expect(pop(el)).toBe(false);
    expect(el.classList.contains('play-pop')).toBe(false);
  });
});

describe('splitColors', () => {
  // An app may map --play-confetti with legacy comma syntax; splitting on every
  // comma would turn rgb(47, 107, 242) into three invalid fragments.
  it('keeps functional colours whole', () => {
    expect(splitColors('rgb(47, 107, 242), #ffc53d, hsl(220, 90%, 55%)'))
      .toEqual(['rgb(47, 107, 242)', '#ffc53d', 'hsl(220, 90%, 55%)']);
  });

  it('handles space syntax, extra spaces and empty input', () => {
    expect(splitColors(' hsl(217 91% 50%) ,  #2fbf63 ')).toEqual(['hsl(217 91% 50%)', '#2fbf63']);
    expect(splitColors('')).toEqual([]);
  });
});
