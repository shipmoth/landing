/* ---------- about: four moths circling the ascii light, one per person ---------- */

import { drawLightField } from '../lib/ascii-light';
import { bodyFont, canvasDpr } from '../lib/canvas';
import { mothFrame } from '../lib/moth';
import { reducedMotion } from '../lib/motion';

// one moth per person, tinted with that person's colour variable
const CREW: readonly (readonly [name: string, cssVar: string])[] = [
  ['arjun', '--p'],
  ['alan', '--y'],
  ['ijas', '--t'],
  ['jose', '--v'],
];
const MAX_WIDTH = 760;

interface CrewMember {
  name: string;
  col: string;
}

/** A moth as placed for one frame. */
interface OrbitMoth extends CrewMember {
  x: number;
  y: number;
  back: boolean; // on the far side of the light
  ph: number; // wingbeat phase
}

export function initCrewOrbit(): void {
  const cv = document.getElementById('crew');
  if (!(cv instanceof HTMLCanvasElement)) return;
  const parent = cv.parentElement;
  const g = cv.getContext('2d');
  if (!parent || !g) return;
  runOrbit(cv, parent, g);
}

function runOrbit(cv: HTMLCanvasElement, parent: HTMLElement, g: CanvasRenderingContext2D): void {
  const FONT = bodyFont();
  const root = getComputedStyle(document.documentElement);
  const crew: CrewMember[] = CREW.map(([name, cssVar]) => ({ name, col: root.getPropertyValue(cssVar).trim() }));

  // the moth of whichever .mate card the pointer is over lights up
  let focus: string | null = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  document.querySelectorAll<HTMLElement>('.mate').forEach((el) => {
    el.addEventListener('pointerenter', () => { focus = el.dataset.name ?? null; });
    el.addEventListener('pointerleave', () => { focus = null; });
  });

  function size(): void {
    dpr = canvasDpr();
    W = Math.min(parent.clientWidth, MAX_WIDTH);
    H = Math.round(Math.max(260, Math.min(340, W * 0.48)));
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  addEventListener('resize', size);

  function drawMoth(m: OrbitMoth, cx: number): void {
    const hl = focus === m.name;
    const a = m.back && !hl ? 0.45 : 1;
    g.globalAlpha = a;
    g.textBaseline = 'middle';
    g.fillStyle = hl ? '#ffffff' : m.col;
    g.shadowColor = m.col;
    g.shadowBlur = hl ? 14 : 0;
    g.font = '16px ' + FONT;
    g.textAlign = 'center';
    g.fillText(mothFrame(Math.floor(m.ph) % 4), m.x, m.y);
    g.font = '600 14px ' + FONT;
    const right = m.x < cx; // label on the outside of the orbit
    g.textAlign = right ? 'right' : 'left';
    g.fillText(m.name, m.x + (right ? -22 : 22), m.y);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  function place(c: CrewMember, i: number, t: number, cx: number, cy: number): OrbitMoth {
    const a = t * 0.3 + i * Math.PI / 2 + Math.sin(t * 0.7 + i) * 0.15;
    return {
      name: c.name,
      col: c.col,
      x: cx + Math.cos(a) * Math.min(W * 0.36, W / 2 - 80),
      y: cy + Math.sin(a) * H * 0.34 + Math.sin(t * 2 + i) * 4,
      back: Math.sin(a) < 0,
      ph: t * 5 + i,
    };
  }

  const t0 = performance.now();
  function frame(now: number): void {
    const t = (now - t0) / 1000;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.34;
    g.clearRect(0, 0, W, H);
    const moths = crew.map((c, i) => place(c, i, t, cx, cy));
    // the moths on the far side go behind the light, the near ones in front
    moths.filter((m) => m.back).forEach((m) => drawMoth(m, cx));
    drawLightField(g, FONT, t, cx, cy, R);
    moths.filter((m) => !m.back).forEach((m) => drawMoth(m, cx));
    if (!reducedMotion) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
