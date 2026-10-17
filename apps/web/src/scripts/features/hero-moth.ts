/* ---------- hero moth: ascii on three canvases, wings hinge at the body ---------- */

import { luminance } from '@shipmoth/ascii-art';
import type { Art, Rgb } from '@shipmoth/ascii-art';
import { bodyFont, canvasDpr, context2d } from '../lib/canvas';
import { RAMP, bar, blockCover, drawsBlocks, snap } from '../lib/ink';
import { reducedMotion } from '../lib/motion';
import { onResizeSettled } from '../lib/resize';

const HL = 150, HR = 170;                    // body columns: [HL, HR)
const MAX_CELL = 4.2;                        // px per column on wide screens
const ASPECT = 1.75;                         // a row is ~1.75 columns tall

// entrance timings, ms
const SWEEP = 2100, BURN = 560, DELAY = 200;
const STEPS = 6;                             // density steps a glyph climbs before it settles
const GROW_TICK = 16;

// flicker: every FLICKER_EVERY ms, FLICKER_COUNT glyphs shift density for a moment
const FLICKER_EVERY = 70, FLICKER_COUNT = 22;

const BEAT = 2600;                           // ms per wingbeat at rest tempo

/** One of the three canvases: the left wing, the body, the right wing. */
interface Part {
  readonly c0: number;                       // columns [c0, c1)
  readonly c1: number;
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  left: number;                              // block mode: where the canvas starts, css px on the device-pixel grid
}

/** The art as flat row-major grids: id = r * w + c. */
interface Cells {
  readonly w: number;
  readonly h: number;
  readonly ch: readonly string[];            // ' ' where blank
  readonly col: readonly (Rgb | undefined)[];
  readonly lit: readonly number[];           // non-space cells, for flicker
}

function parseCells(art: Art): Cells {
  const { w, h } = art;
  const ch: string[] = new Array<string>(w * h).fill(' ');
  const col: (Rgb | undefined)[] = new Array<Rgb | undefined>(w * h).fill(undefined);
  for (let r = 0; r < h; r++) {
    const row = art.rows[r] ?? '';
    for (let c = 0; c < row.length; c++) {
      ch[r * w + c] = row.charAt(c);
      col[r * w + c] = art.palette[art.color[r * w + c] ?? -1];
    }
  }
  const lit: number[] = [];
  for (let id = 0; id < w * h; id++) if (ch[id] !== ' ') lit.push(id);
  return { w, h, ch, col, lit };
}

/** Bright glyphs burn in through the density ramp; dim ones just appear. */
function isBright(rgb: Rgb | undefined): boolean {
  return rgb ? luminance(rgb) > 48 : true;
}

function createPart(stage: HTMLElement, c0: number, c1: number, className: string): Part {
  const cv = document.createElement('canvas');
  cv.className = className;
  stage.appendChild(cv);
  return { c0, c1, cv, ctx: context2d(cv), left: 0 };
}

/* entrance: a point of light at the centre of the body grows outward, and the moth is made by it.
   nothing exists ahead of the light. when the light reaches one of the moth's characters it builds
   up through the ascii density scale in its own colour until it lands on its real glyph. it only
   travels through the moth's own characters, so it traces the wings and body rather than the
   rectangle of the art. */

/** Distance of every lit cell from the moth's centre, slightly jittered, and its maximum. */
function entranceDistances(cells: Cells): { dist: Float32Array; dmax: number } {
  const { w, h, col, lit } = cells;
  // start from the moth's true centre: its body axis across, the middle of its visible height down.
  // (an average of all characters drifts up and right, where the wing and the filler are denser)
  let rTop = h, rBot = 0;
  lit.forEach((id) => {
    const rgb = col[id];
    if (rgb && luminance(rgb) > 48) {
      const r = (id / w) | 0;
      if (r < rTop) rTop = r;
      if (r > rBot) rBot = r;
    }
  });
  const cx = (HL + HR) / 2, cy = (rTop + rBot) / 2;
  const dist = new Float32Array(w * h);
  let dmax = 0;
  lit.forEach((id) => {
    const d = Math.hypot(id % w - cx, (((id / w) | 0) - cy) * ASPECT) * (1 + (Math.random() - 0.5) * 0.16);
    dist[id] = d;
    if (d > dmax) dmax = d;
  });
  return { dist, dmax };
}

export function initHeroMoth(art: Art): void {
  const orbit = document.getElementById('orbit');
  if (!orbit) return;
  runHeroMoth(orbit, art);
}

function runHeroMoth(orbit: HTMLElement, art: Art): void {
  const cells = parseCells(art);
  const { w: W, h: H, ch, col, lit } = cells;

  /* three canvases */
  const stage = document.createElement('div');
  stage.className = 'stage';
  const parts: readonly [Part, Part, Part] = [
    createPart(stage, 0, HL, 'wl'),
    createPart(stage, HL, HR, 'wb'),
    createPart(stage, HR, W, 'wr'),
  ];
  orbit.appendChild(stage);

  // blocks: cells too small on screen for glyphs are drawn as bars of light (lib/ink.ts)
  let cw = 0, lh = 0, dpr = 1, blocks = false, revealed = 0, done = false, order: number[] = [];
  const glyph = (id: number): string => ch[id] ?? ' ';
  const partFor = (c: number): Part => (c < HL ? parts[0] : c < HR ? parts[1] : parts[2]);

  /** draws glyph g (blank clears) in cell (r, c): the glyph itself, or its bar */
  function cell(r: number, c: number, g: string): void {
    const p = partFor(c), ctx = p.ctx, px = (c - p.c0) * cw, py = r * lh;
    if (blocks) {
      // the cell on whole device pixels, so a redraw never touches the neighbouring cells
      const x0 = snap(c * cw, dpr) - p.left, x1 = snap((c + 1) * cw, dpr) - p.left, y0 = snap(py, dpr), y1 = snap((r + 1) * lh, dpr);
      ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      const cover = blockCover(g);
      if (cover > 0) {
        const [top, height] = bar(y0, y1, cover);
        ctx.fillStyle = col[r * W + c]?.hex ?? '';
        ctx.fillRect(x0, top, x1 - x0, height);
      }
      return;
    }
    ctx.clearRect(px - 0.5, py, cw + 1, lh);
    if (g && g !== ' ') {
      ctx.fillStyle = col[r * W + c]?.hex ?? '';
      ctx.fillText(g, px, py + lh / 2);
    }
  }
  const settle = (id: number): void => cell((id / W) | 0, id % W, glyph(id));

  function layout(): void {
    const font = bodyFont();
    cw = Math.min(orbit.clientWidth / W, MAX_CELL);
    const probe = parts[0].ctx;
    probe.font = '100px ' + font;
    const fs = cw / (probe.measureText('M').width / 100);
    lh = fs * 1.05;
    dpr = canvasDpr(W * cw * H * lh);         // the three canvases together
    blocks = drawsBlocks(cw, dpr);
    parts.forEach((p) => {
      let w = (p.c1 - p.c0) * cw;
      const h = H * lh;
      if (blocks) {
        // whole device pixels wide, so the three canvases meet on a pixel edge: no seam between them
        // (the height stays as it is: the page below the hero must not move)
        p.left = snap(p.c0 * cw, dpr);
        w = snap(p.c1 * cw, dpr) - p.left;
        p.cv.width = Math.round(w * dpr);
      } else {
        p.cv.width = Math.ceil(w * dpr);
      }
      p.cv.height = Math.ceil(h * dpr);
      p.cv.style.width = w + 'px';
      p.cv.style.height = h + 'px';
      p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.ctx.font = fs + 'px ' + font;
      p.ctx.textBaseline = 'middle';
    });
    for (let i = 0; i < revealed; i++) settle(order[i] ?? 0);
  }
  onResizeSettled(layout);

  const { dist, dmax } = entranceDistances(cells);
  order = lit.slice().sort((a, b) => (dist[a] ?? 0) - (dist[b] ?? 0));
  layout();
  if (reducedMotion) { revealed = order.length; layout(); done = true; return; }

  startEntrance();
  startFlicker();
  startFlight();

  function startEntrance(): void {
    const lively = new Uint8Array(W * H), start = new Float32Array(W * H);
    order.forEach((id) => {
      lively[id] = isBright(col[id]) ? 1 : 0;
      start[id] = DELAY + SWEEP * Math.pow((dist[id] ?? 0) / dmax, 1.1);   // close to a steady spread
    });
    const t0 = performance.now();
    let head = 0, band: number[] = [];
    // ascii build-up: when the light reaches a character it steps up the density scale
    // (. : ; + * # ...) in its own colour until it lands on its real glyph (as bars: the bar grows)
    function burn(id: number, a: number): void {                         // a: 0 just reached .. 1 settled
      const real = glyph(id);
      let target = RAMP.indexOf(real);
      if (target < 2) target = RAMP.length - 1;
      const step = Math.floor(a * STEPS) / STEPS;                        // discrete jumps, not a smooth blend
      cell((id / W) | 0, id % W, step >= 1 ? real : RAMP.charAt(Math.max(1, Math.round(step * target))));
    }
    function grow(): void {
      const t = performance.now() - t0;
      while (head < order.length && (start[order[head] ?? 0] ?? 0) <= t) {
        const nid = order[head++] ?? 0;
        if (lively[nid]) band.push(nid); else settle(nid);
      }
      const still: number[] = [];
      for (const id of band) {
        const a = (t - (start[id] ?? 0)) / BURN;
        if (a >= 1) { settle(id); continue; }
        burn(id, a);
        still.push(id);
      }
      band = still;
      revealed = head;
      if (head < order.length || band.length) setTimeout(grow, GROW_TICK);
      else { revealed = order.length; done = true; }
    }
    grow();
  }

  /* flicker: a few glyphs shift density for a moment, like embers */
  function startFlicker(): void {
    setInterval(() => {
      if (!done) return;
      for (let k = 0; k < FLICKER_COUNT; k++) {
        const id = lit[(Math.random() * lit.length) | 0];
        if (id === undefined) continue;
        const r = (id / W) | 0, c = id % W;
        const gi = RAMP.indexOf(glyph(id));
        if (gi < 0) continue;
        const ni = Math.max(1, Math.min(RAMP.length - 1, gi + ((Math.random() * 7) | 0) - 3));
        cell(r, c, RAMP.charAt(ni));
        setTimeout(() => { cell(r, c, glyph(id)); }, 90 + Math.random() * 200);
      }
    }, FLICKER_EVERY);
  }

  /* flight: one continuous slow wingbeat. depth and tempo drift smoothly, never stop dead */
  function startFlight(): void {
    let phase = 0, last = performance.now(), excite = 0;
    const tilt = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
    const [left, , right] = parts;
    orbit.addEventListener('pointerdown', () => { excite = 1; });
    addEventListener('pointermove', (e) => {
      const b = orbit.getBoundingClientRect();
      aim.x = Math.max(-1, Math.min(1, (e.clientX - (b.left + b.width / 2)) / (b.width / 2)));
      aim.y = Math.max(-1, Math.min(1, (e.clientY - (b.top + b.height / 2)) / (innerHeight / 2)));
    });
    function frame(now: number): void {
      const dt = Math.min(64, now - last);
      last = now;
      const s = now / 1000;
      // slow drift between near-still gliding and fuller beats (periods of ~11s and ~17s)
      const drift = 0.5 + 0.3 * Math.sin(s * 0.57) + 0.2 * Math.sin(s * 0.37 + 1.3);   // 0..1
      excite *= Math.pow(0.5, dt / 1400);                                                // a click fades over a few seconds
      const tempo = 0.75 + 0.35 * drift + 0.6 * excite;                                  // beats per BEAT
      phase += dt / BEAT * tempo;
      const f = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);                               // 0 open .. 1 raised
      const depth = 10 + 28 * drift + 20 * excite;                                       // degrees
      const a = 6 + depth * f;
      const lift = Math.sin(phase * 2 * Math.PI) * (2 + 3 * drift + 3 * excite);
      tilt.x += (aim.x - tilt.x) * 0.04;
      tilt.y += (aim.y - tilt.y) * 0.04;
      stage.style.transform = 'translateY(' + (-lift).toFixed(2) + 'px) rotateX(' + (8 - tilt.y * 8).toFixed(2) + 'deg) rotateY(' + (tilt.x * 10).toFixed(2) + 'deg)';
      left.cv.style.transform = 'rotateY(' + a.toFixed(2) + 'deg)';
      right.cv.style.transform = 'rotateY(' + (-a).toFixed(2) + 'deg)';
      const o = (1 - a / 180).toFixed(3);
      left.cv.style.opacity = o;
      right.cv.style.opacity = o;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
}
