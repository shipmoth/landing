/* ---------- wordmark: plasma-tide ascii on a canvas ----------
   types in, a tide of light rolls through it, and letters near the cursor
   are pushed aside and glow, then spring back into place.                 */

import type { Art, Rgb } from '@shipmoth/ascii-art';
import { bodyFont, canvasDpr, context2d } from '../lib/canvas';
import { bar, blockCover, drawsBlocks, snap } from '../lib/ink';
import { mixRgb } from '../lib/colour';
import { reducedMotion } from '../lib/motion';
import { onResizeSettled } from '../lib/resize';

const MAX_CELL = 1.75, SHARE = 0.8;          // px-per-column cap, and share of the text column it may fill
const PAD = 70;                              // room around the art for pushed letters and ripples
const RADIUS = 50, PUSH = 0.2, SPRING = 0.12, DAMP = 0.74;   // mouse response
const RIPPLE_EVERY = 280, RIPPLE_LIFE = 1200, RIPPLE_SPEED = 0.18, RIPPLE_WIDTH = 9, RIPPLE_PUSH = 0.05, RIPPLE_GLOW = 0.12;
// type in left to right on a timer, starting once the moth has mostly printed
const TYPE_START = 700, TYPE_TICK = 18, TYPE_STEPS = 60;
const FAR = -1e4;                            // pointer position when there is no pointer
const WARM_WHITE = { r: 255, g: 226, b: 170 };   // what a glyph glows towards

/** A letter of the art, with its spring state. */
interface Glyph {
  readonly r: number;
  readonly c: number;
  readonly ch: string;
  readonly rgb: Rgb;
  readonly cover: number;                    // share of its cell its bar covers, when drawn as bars
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  heat: number;
}

interface Ripple {
  readonly x: number;
  readonly y: number;
  readonly t0: number;
}

/** Non-space glyphs in reading order, then stably sorted by column for the type-in. */
function parseGlyphs(art: Art): Glyph[] {
  const cells: Glyph[] = [];
  for (let r = 0; r < art.h; r++) {
    const row = art.rows[r] ?? '';
    for (let c = 0; c < row.length; c++) {
      const ch = row.charAt(c);
      const rgb = art.palette[art.color[r * art.w + c] ?? -1];
      if (ch !== ' ' && rgb) cells.push({ r, c, ch, rgb, cover: blockCover(ch), ox: 0, oy: 0, vx: 0, vy: 0, heat: 0 });
    }
  }
  cells.sort((a, b) => a.c - b.c);       // by column, for the type-in
  return cells;
}

/** A glyph's colour pulled towards warm white as it heats up. */
function glowColour(e: Glyph): string {
  if (!(e.heat > 0.02)) return e.rgb.hex;
  return mixRgb(e.rgb, WARM_WHITE, Math.min(1, e.heat));
}

// ripple strength at distance d from a ripple's origin: a thin ring that expands and fades
function band(d: number, rp: Ripple, now: number): number {
  const age = (now - rp.t0) / RIPPLE_LIFE;
  if (age >= 1) return 0;
  const k = (d - (now - rp.t0) * RIPPLE_SPEED) / RIPPLE_WIDTH;
  return Math.exp(-k * k) * (1 - age) * (1 - age);
}

export function initWordmark(art: Art): void {
  const cv = document.querySelector('.title .word');
  // the selector guarantees a parent (.title)
  if (!(cv instanceof HTMLCanvasElement) || !cv.parentElement) return;
  runWordmark(cv, cv.parentElement, art);
}

function runWordmark(cv: HTMLCanvasElement, parent: HTMLElement, art: Art): void {
  const W = art.w, H = art.h;
  let ripples: Ripple[] = [], lastRipple = 0, hovering = false;
  const cells = parseGlyphs(art);

  const g = context2d(cv), base = document.createElement('canvas'), bg = context2d(base);
  const tide = document.createElement('canvas'), tg = context2d(tide);
  // blocks: cells too small on screen for glyphs are drawn as bars of light (lib/ink.ts)
  let cw = 0, lh = 0, fs = 0, w = 0, h = 0, dpr = 1, drawn = 0, blocks = false;
  const FONT = bodyFont();
  const mouse = { x: FAR, y: FAR };
  let moving = false;

  function layout(): void {
    const avail = parent.clientWidth;
    cw = Math.min(avail * SHARE / W, MAX_CELL);
    bg.font = '100px ' + FONT;
    fs = cw / (bg.measureText('M').width / 100);
    lh = fs * 1.05;
    w = W * cw + PAD * 2;
    h = H * lh + PAD * 2;
    dpr = canvasDpr(w * h);
    blocks = drawsBlocks(cw, dpr);
    [cv, base, tide].forEach((c) => { c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); });
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    // centred on .title, which is the text column's width (global.css): the PAD either side spills
    // into the page gutter, the art itself (SHARE of the column) stays inside it
    cv.style.margin = `${-PAD}px calc(50% - ${w / 2}px)`;
    redraw();
    paint(performance.now());
  }

  /** The base layer: every typed glyph (or its bar) at its (pushed) position, in its (glowing) colour. */
  function redraw(): void {
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg.clearRect(0, 0, w, h);
    bg.font = fs + 'px ' + FONT;
    bg.textBaseline = 'middle';
    for (let i = 0; i < drawn; i++) {
      const e = cells[i];
      if (!e) continue;
      bg.fillStyle = glowColour(e);
      if (blocks) {
        // cells on whole device pixels: at rest they tile exactly, pushed ones move a pixel at a time
        const x0 = snap(PAD + e.c * cw + e.ox, dpr), x1 = snap(PAD + (e.c + 1) * cw + e.ox, dpr);
        const [top, height] = bar(snap(PAD + e.r * lh + e.oy, dpr), snap(PAD + (e.r + 1) * lh + e.oy, dpr), e.cover);
        bg.fillRect(x0, top, x1 - x0, height);
      } else {
        bg.fillText(e.ch, PAD + e.c * cw + e.ox, PAD + e.r * lh + lh / 2 + e.oy);
      }
    }
  }

  // springs: push away from the cursor, pull back home. returns true while anything is still moving
  function step(): boolean {
    const now = performance.now();
    ripples = ripples.filter((rp) => now - rp.t0 < RIPPLE_LIFE);
    if (hovering && now - lastRipple > RIPPLE_EVERY) { ripples.push({ x: mouse.x, y: mouse.y, t0: now }); lastRipple = now; }
    let live = false;
    const R2 = RADIUS * RADIUS;
    for (let i = 0; i < drawn; i++) {
      const e = cells[i];
      if (!e) continue;
      const hx = PAD + e.c * cw, hy = PAD + e.r * lh + lh / 2;
      const dx = hx + e.ox - mouse.x, dy = hy + e.oy - mouse.y, d2 = dx * dx + dy * dy;
      let target = 0;
      if (d2 < R2) {
        const d = Math.sqrt(d2) || 1;
        let f = 1 - d / RADIUS;
        f *= f;
        e.vx += dx / d * f * PUSH;
        e.vy += dy / d * f * PUSH;
        target = f * 0.15;
      }
      for (const rp of ripples) {
        const rx = hx - rp.x, ry = hy - rp.y, rd = Math.sqrt(rx * rx + ry * ry) || 1;
        const v = band(rd, rp, now);
        if (v > 0.01) { target += v * RIPPLE_GLOW; e.vx += rx / rd * v * RIPPLE_PUSH; e.vy += ry / rd * v * RIPPLE_PUSH; }
      }
      e.vx = (e.vx - e.ox * SPRING) * DAMP;
      e.vy = (e.vy - e.oy * SPRING) * DAMP;
      e.ox += e.vx;
      e.oy += e.vy;
      e.heat += (target - e.heat) * 0.35;
      if (Math.abs(e.ox) > 0.05 || Math.abs(e.oy) > 0.05 || e.heat > 0.02 || Math.abs(e.vx) > 0.02) live = true;
      else { e.ox = e.oy = e.vx = e.vy = 0; e.heat = 0; }
    }
    return live || ripples.length > 0;
  }

  // composite: base art, plus a soft band of light clipped to the glyphs that rolls across
  function paint(now: number): void {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(base, 0, 0);
    if (reducedMotion || drawn < cells.length) return;
    const t = now / 1000, span = cv.width * 1.6;
    const cx = ((t / 6) % 1) * span - cv.width * 0.3;               // one pass every 6s
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, tide.width, tide.height);
    const grad = tg.createLinearGradient(cx - cv.width * 0.18, 0, cx + cv.width * 0.18, cv.height * 0.6);
    grad.addColorStop(0, 'rgba(255,200,120,0)');
    grad.addColorStop(0.5, 'rgba(255,214,150,0.85)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    tg.fillStyle = grad;
    tg.fillRect(0, 0, tide.width, tide.height);
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(base, 0, Math.sin(t * 1.7) * dpr);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.55 + 0.15 * Math.sin(t * 0.9);
    g.drawImage(tide, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  // with reduced motion the art is drawn whole at once
  if (reducedMotion) drawn = cells.length;
  layout();
  onResizeSettled(layout);
  if (reducedMotion) return;

  trackPointer();
  typeIn();
  animate();

  function trackPointer(): void {
    function track(e: PointerEvent): void {
      const b = cv.getBoundingClientRect();
      mouse.x = e.clientX - b.left;
      mouse.y = e.clientY - b.top;
      moving = mouse.x > -RADIUS && mouse.y > -RADIUS && mouse.x < b.width + RADIUS && mouse.y < b.height + RADIUS;
      // ripples only while the pointer is over the word itself (not its padding)
      hovering = mouse.x > PAD * 0.5 && mouse.y > PAD * 0.5 && mouse.x < b.width - PAD * 0.5 && mouse.y < b.height - PAD * 0.5;
    }
    function forget(): void {
      mouse.x = mouse.y = FAR;
      hovering = moving = false;
    }
    addEventListener('pointermove', track);
    addEventListener('pointerdown', track);
    document.addEventListener('pointerleave', forget);
    addEventListener('scroll', forget, { passive: true });
  }

  function typeIn(): void {
    const perTick = Math.ceil(cells.length / TYPE_STEPS);
    setTimeout(function tick() {
      drawn = Math.min(cells.length, drawn + perTick);
      redraw();
      paint(performance.now());
      if (drawn < cells.length) setTimeout(tick, TYPE_TICK);
    }, TYPE_START);
  }

  function animate(): void {
    let settling = false;
    (function loop(now: number): void {
      if (drawn >= cells.length) {
        if (moving || settling) { settling = step(); redraw(); }
        paint(now);
      }
      requestAnimationFrame(loop);
    })(performance.now());
  }
}
