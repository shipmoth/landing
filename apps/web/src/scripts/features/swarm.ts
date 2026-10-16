/* ---------- swarm + light ----------
   press anywhere: an ascii light blooms there. hold: it follows the pointer and the moths chase it.
   release: the light fades and the moths nearby scatter.                                         */

import { drawLightField } from '../lib/ascii-light';
import { bodyFont, canvasDpr } from '../lib/canvas';
import { MOTH_FRAMES, mothFrame } from '../lib/moth';
import { reducedMotion } from '../lib/motion';

/* ---- moths ---- */
const COLOURS = ['#f5b63a', '#ffd27a', '#e8dcc0', '#c9853a', '#ff9a52'] as const;

/* ---- input ---- */
// anything a visitor might press to read, select, copy or operate. pressing these never lights the lamp
const TEXTY = 'p,li,pre,h1,h2,h3,a,button,input,textarea,select,label,b,i,s,span,code,small,figcaption,[contenteditable]';
const WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'];

/* ---- idle moth: after 30s of stillness one moth lands on a word and rests ---- */
const IDLE_MS = 30000;

interface Light {
  x: number; // where the light is drawn: trails the pointer like a liquid
  y: number;
  tx: number; // where the pointer is
  ty: number;
  power: number; // 0..1, swells while held and dims smoothly after
  held: boolean;
}

interface Moth {
  x: number;
  y: number;
  a: number; // heading
  turn: number;
  depth: number; // 0 far/small/faint .. 1 near/big/bright
  size: number;
  speed: number;
  alpha: number;
  colour: string;
  beat: number; // ms per wingbeat
  t: number;
  orbit: 1 | -1; // which way it circles the light
  burst: number; // startled speed boost, decays to 0
  lag: number; // how sluggishly it turns towards the light
}

interface Idle {
  since: number;
  moth: Moth | null; // the moth flying to / resting on a word
  x: number;
  y: number;
  landed: boolean;
}

interface Point {
  x: number;
  y: number;
}

/** The wingbeat frame for a phase in 0..1. */
function frameAt(phase: number): string {
  return mothFrame((phase * MOTH_FRAMES.length) | 0);
}

function isTexty(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(TEXTY);
}

function selecting(): boolean {
  const sel = getSelection();
  return !!(sel && !sel.isCollapsed && String(sel).trim());
}

/** A new moth at a random spot. The order of the Math.random calls matters: the
 *  seeded e2e and visual tests (and their committed snapshots) depend on it. */
function spawn(W: number, H: number): Moth {
  const depth = Math.random();
  return {
    x: Math.random() * W, y: Math.random() * H, a: Math.random() * Math.PI * 2, turn: 0, depth,
    size: 9 + depth * 7, speed: 0.35 + depth * 0.7 + Math.random() * 0.3, alpha: 0.25 + depth * 0.55,
    colour: COLOURS[(Math.random() * COLOURS.length) | 0] ?? COLOURS[0], beat: 260 + Math.random() * 240,
    t: Math.random() * 1000, orbit: Math.random() < 0.5 ? 1 : -1, burst: 0, lag: 0.4 + Math.random() * 0.6,
  };
}

/** How many moths fit the viewport; a page can ask for fewer, e.g. data-moths="0.35". */
function mothCount(W: number, H: number): number {
  let count = Math.round(Math.min(70, Math.max(22, W * H / 26000)));
  const share = parseFloat(document.body.dataset.moths ?? '');
  if (share > 0 && share < 1) count = Math.max(6, Math.round(count * share));
  return count;
}

/** The centre of a random long-enough word on screen, or null after a few unlucky tries. */
function pickWord(H: number): Point | null {
  const els = Array.from(document.querySelectorAll('main p, main li, main h2')).filter((el) => {
    const b = el.getBoundingClientRect();
    return b.top > 60 && b.bottom < H - 40 && b.width > 0;
  });
  for (let tries = 0; tries < 8 && els.length; tries++) {
    const el = els[(Math.random() * els.length) | 0];
    if (!el) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n instanceof Text && /\w{4,}/.test(n.data)) nodes.push(n);
    }
    if (!nodes.length) continue;
    const node = nodes[(Math.random() * nodes.length) | 0];
    if (!node) continue;
    const words: [number, number][] = [];
    const re = /\w{4,}/g;
    for (let m = re.exec(node.data); m; m = re.exec(node.data)) words.push([m.index, m.index + m[0].length]);
    const w = words[(Math.random() * words.length) | 0];
    if (!w) continue;
    const r = document.createRange();
    r.setStart(node, w[0]);
    r.setEnd(node, w[1]);
    const b = r.getBoundingClientRect();
    if (b.width && b.top > 40 && b.bottom < H - 20) return { x: b.left + b.width / 2, y: b.top + b.height * 0.45 };
  }
  return null;
}

export function initSwarm(): void {
  const cv = document.getElementById('swarm');
  if (!cv) return;
  if (reducedMotion) {
    cv.remove();
    return;
  }
  if (!(cv instanceof HTMLCanvasElement)) return;
  const g = cv.getContext('2d');
  if (!g) return;
  runSwarm(cv, g);
}

function runSwarm(cv: HTMLCanvasElement, g: CanvasRenderingContext2D): void {
  let W = 0;
  let H = 0;
  let dpr = 1;
  const FONT = bodyFont();

  const light: Light = { x: 0, y: 0, tx: 0, ty: 0, power: 0, held: false };
  const moths: Moth[] = [];

  function size(): void {
    dpr = canvasDpr();
    W = innerWidth;
    H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  const COUNT = mothCount(W, H);
  for (let i = 0; i < COUNT; i++) moths.push(spawn(W, H));
  addEventListener('resize', size);

  /* ---- input ---- */
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isTexty(e.target)) return; // pressing on text is for selecting it, not for the light
    light.held = true;
    light.tx = e.clientX;
    light.ty = e.clientY;
    if (light.power < 0.05) { light.x = e.clientX; light.y = e.clientY; }
  });
  addEventListener('mousedown', (e) => { // no text-selection drag when pressing on empty space
    // primary button only: cancelling a middle press kills the browser's autoscroll (and the other buttons' defaults)
    if (e.button === 0 && !isTexty(e.target)) e.preventDefault();
  });
  addEventListener('pointermove', (e) => {
    if (light.held) { light.tx = e.clientX; light.ty = e.clientY; }
  });
  function release(): void {
    if (!light.held) return;
    light.held = false;
    moths.forEach((m) => { // lights out: the close ones scatter
      const dx = m.x - light.x;
      const dy = m.y - light.y;
      const d = Math.hypot(dx, dy);
      if (d < 260) { m.a = Math.atan2(dy, dx) + (Math.random() - 0.5); m.burst = 1 - d / 260; }
    });
  }
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  addEventListener('blur', release);
  // if a text selection starts while the light is on, put it out quietly (no scatter, no flash)
  document.addEventListener('selectionchange', () => { if (light.held && selecting()) light.held = false; });

  /* ---- draw the light ---- */
  function drawLight(t: number): void {
    const p = light.power;
    if (p < 0.01) return;
    const R = 70 + 190 * p; // radius grows while held
    drawLightField(g, FONT, t, light.x, light.y, R, { power: p, bounds: { width: W, height: H } });
  }

  /* ---- idle moth ---- */
  // looked up before wake() can run: the listeners below call it as soon as anything moves
  const perch = document.getElementById('perch');
  const idle: Idle = { since: performance.now(), moth: null, x: 0, y: 0, landed: false };

  function wake(): void {
    idle.since = performance.now();
    const m = idle.moth;
    if (!m) return;
    idle.moth = null;
    idle.landed = false;
    if (perch) perch.hidden = true;
    m.x = idle.x;
    m.y = idle.y - 8;
    m.a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6; // startled take-off
    m.burst = 1;
  }
  WAKE_EVENTS.forEach((ev) => { addEventListener(ev, wake, { passive: true }); });

  function land(): void {
    const spot = pickWord(H);
    if (!spot) { idle.since = performance.now(); return; }
    let best: Moth | null = null;
    let bd = 1e9;
    for (const m of moths) {
      if (m.depth < 0.5) continue;
      const d = Math.hypot(m.x - spot.x, m.y - spot.y);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return;
    idle.moth = best;
    idle.x = spot.x;
    idle.y = spot.y;
    idle.landed = false;
  }

  /** Flies the idle moth to its word, then lets it rest there as the #perch element. */
  function flyToWord(m: Moth, dt: number): void {
    const dx = idle.x - m.x;
    const dy = idle.y - m.y;
    const d = Math.hypot(dx, dy);
    if (!idle.landed) {
      if (d < 2) {
        idle.landed = true;
        m.x = idle.x;
        m.y = idle.y;
        if (perch) {
          perch.style.left = idle.x + 'px';
          perch.style.top = idle.y + 'px';
          perch.hidden = false;
        }
      } else {
        const sp = Math.min(d * 0.05, 1.6) * dt + 0.15;
        m.a = Math.atan2(dy, dx);
        m.x += dx / d * Math.min(sp, d);
        m.y += dy / d * Math.min(sp, d);
      }
    }
    m.t += dt * 16;
    // resting: slow, lazy wingbeats, drawn on the perch layer above the text
    const beat = idle.landed ? 1600 : m.beat;
    const ph = (m.t / beat) % 1;
    if (idle.landed) {
      const fr = frameAt(ph);
      if (perch && perch.textContent !== fr) perch.textContent = fr;
      return;
    }
    g.save();
    g.translate(m.x, m.y);
    g.globalAlpha = 1;
    g.fillStyle = '#ffd27a';
    g.font = m.size + 'px ' + FONT; // still flying: its own size (once landed it is drawn by #perch)
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText(frameAt(ph), 0, 0);
    g.restore();
  }

  /* ---- fly and draw one wandering moth ---- */
  function steer(m: Moth, dt: number): number {
    // returns how hard it is chasing the light (0..1)
    if (!light.held) return 0;
    const dx = light.x - m.x;
    const dy = light.y - m.y;
    const d = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx) + m.orbit * (d < 60 ? 1.9 : d < 160 ? 1.0 : 0.25);
    const diff = Math.atan2(Math.sin(want - m.a), Math.cos(want - m.a));
    m.a += diff * (d < 200 ? 0.09 : 0.045) * m.lag * dt;
    return Math.min(1, light.power * 1.5);
  }

  function glowOf(m: Moth): number {
    // moths near the light catch it and brighten
    if (light.power <= 0.02) return 0;
    const ld = Math.hypot(light.x - m.x, light.y - m.y);
    return Math.max(0, 1 - ld / (90 + 200 * light.power)) * light.power;
  }

  function wander(m: Moth, dt: number, chase: number): number {
    // returns the wingbeat phase
    const sp = m.speed * (1 + chase * 1.6 + m.burst * 4);
    if (m.burst) { m.burst *= Math.pow(0.94, dt); if (m.burst < 0.02) m.burst = 0; }
    m.x += Math.cos(m.a) * sp * dt;
    m.y += Math.sin(m.a) * sp * dt;
    m.t += dt * 16 * (1 + chase * 0.6);
    return (m.t / m.beat) % 1;
  }

  function wrap(m: Moth): void {
    const pad = 30;
    if (m.x < -pad) m.x = W + pad; else if (m.x > W + pad) m.x = -pad;
    if (m.y < -pad) m.y = H + pad; else if (m.y > H + pad) m.y = -pad;
  }

  function drawMoth(m: Moth, ph: number, bob: number, glow: number, behind: boolean): void {
    g.save();
    g.translate(m.x, m.y + bob);
    g.rotate(Math.cos(m.a) * 0.25);
    g.globalAlpha = Math.min(1, m.alpha + glow * 0.6) * (behind ? 0.22 : 1);
    g.fillStyle = glow > 0.35 ? '#fff3d6' : m.colour;
    g.font = m.size + 'px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(frameAt(ph), 0, 0);
    g.restore();
  }

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(48, now - last) / 16;
    last = now;
    const t = now / 1000;
    // the light trails the pointer like a liquid, and swells or dims smoothly
    light.x += (light.tx - light.x) * 0.16 * dt;
    light.y += (light.ty - light.y) * 0.16 * dt;
    const pTarget = light.held ? 1 : 0;
    light.power += (pTarget - light.power) * (pTarget > light.power ? 0.05 : 0.07) * dt;
    g.clearRect(0, 0, W, H);
    drawLight(t);
    if (!idle.moth && now - idle.since > IDLE_MS) land();

    // the text column below the hero: moths passing behind it fade back so the words stay clean
    const column = document.querySelector('main')?.getBoundingClientRect();
    const heroEl = document.querySelector('.hero');
    const heroBottom = heroEl ? heroEl.getBoundingClientRect().bottom : 0;
    for (const m of moths) {
      m.turn += (Math.random() - 0.5) * 0.06 * dt;
      m.turn *= 0.94;
      m.a += m.turn * dt;
      if (m === idle.moth) { flyToWord(m, dt); continue; }
      const chase = steer(m, dt);
      const ph = wander(m, dt, chase);
      const bob = Math.sin(ph * Math.PI * 2) * 1.2;
      wrap(m);
      const glow = glowOf(m);
      const behind = !!column && m.x > column.left - 12 && m.x < column.right + 12 && m.y > heroBottom && glow < 0.2;
      drawMoth(m, ph, bob, glow, behind);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
