/* The idea line's model: crates of ideas ride a belt past a QA stamp, which ships the weird ones
   and bins the rest. Plain data and functions, no DOM: `step` moves the belt one tick and
   `renderBelt` draws it as the html of a <pre>. The view lives in features/idea-line.ts. */

import { escapeHtml } from './html';
import { MOTH_FRAMES } from './moth';

/* ---------- settings ---------- */

const WEIRD_EVERY = 3;   // roughly one weird idea for every few normal ones
export const ROWS = 7;   // 0 stamp arm, 1 stamp head, 2-4 crate, 5 belt, 6 legs
const FLAP_MS = 180;     // the stamp's moth changes frame this often

/* ---------- state ---------- */

export interface Ideas {
  readonly weird: readonly string[];    // QA always ships these
  readonly normal: readonly string[];   // QA always bins these
}

export type Verdict = 'ok' | 'no';

export interface Crate {
  x: number;             // left edge; starts off-screen to the left
  label: string;
  weird: boolean;
  verdict: Verdict | null;
  fall: number;          // steps spent falling into the bin
}

export interface Belt {
  readonly ideas: Ideas;
  width: number;         // in characters
  crates: Crate[];
  pause: number;         // steps left while the stamp is coming down
  stampDrop: number;     // 0 up, 1 and 2 on the way down or up
  shipped: number;
  binned: number;
  weirdDeck: string[];
  normalDeck: string[];
  sinceWeird: number;
}

export function createBelt(ideas: Ideas): Belt {
  return { ideas, width: 60, crates: [], pause: 0, stampDrop: 0, shipped: 3, binned: 211, weirdDeck: [], normalDeck: [], sinceWeird: 0 };
}

export const beltEnd = (belt: Belt): number => belt.width - 9;
export const stampX = (belt: Belt): number => Math.floor(belt.width * 0.55);
// the stranger the idea, the more likely it ships. here: always.
const verdictFor = (crate: Crate): Verdict => (crate.weird ? 'ok' : 'no');

/* ---------- moving the belt ---------- */

function shuffled(items: readonly string[]): string[] {
  return items.slice().sort(() => Math.random() - 0.5);
}

/** Deals the next idea: a weird one after every two or three normal ones, each deck reshuffled when empty. */
function nextIdea(belt: Belt): { label: string; weird: boolean } {
  const weird = belt.sinceWeird >= WEIRD_EVERY - 1 + (Math.random() < 0.5 ? 0 : 1);
  let text: string;
  if (weird) {
    if (!belt.weirdDeck.length) belt.weirdDeck = shuffled(belt.ideas.weird);
    belt.sinceWeird = 0;
    text = belt.weirdDeck.pop() ?? '';
  } else {
    if (!belt.normalDeck.length) belt.normalDeck = shuffled(belt.ideas.normal);
    belt.sinceWeird++;
    text = belt.normalDeck.pop() ?? '';
  }
  // long ideas are cut to fit the belt, with an ellipsis
  const max = Math.max(10, belt.width - 22);
  return { label: text.length > max ? text.slice(0, max - 1) + '…' : text, weird };
}

/** Puts a new crate on the belt, just off its left end. */
export function addCrate(belt: Belt): void {
  const idea = nextIdea(belt);
  belt.crates.push({ x: -(idea.label.length + 4), label: idea.label, weird: idea.weird, verdict: null, fall: 0 });
}

/** One tick: the stamp comes down on a crate, or the belt moves every crate one character on. */
export function step(belt: Belt): void {
  const stamp = stampX(belt);
  const end = beltEnd(belt);
  if (belt.pause > 0) {                                  // the stamp is coming down
    belt.pause--;
    belt.stampDrop = belt.pause > 3 ? 1 : belt.pause > 1 ? 2 : 1;
    if (belt.pause === 2) {
      const crate = belt.crates.find((c) => !c.verdict && c.x + 2 <= stamp && c.x + c.label.length + 2 >= stamp);
      if (crate) crate.verdict = verdictFor(crate);
    }
    if (belt.pause === 0) belt.stampDrop = 0;
    return;
  }
  belt.crates.forEach((c) => {
    c.x++;
    if (c.x >= end - 1 && c.verdict === 'no') c.fall++;  // off the end of the belt: into the bin
  });
  // a crate whose middle reaches the stamp stops the line
  const under = belt.crates.find((c) => !c.verdict && c.x + Math.floor((c.label.length + 4) / 2) === stamp);
  if (under) belt.pause = 6;
  // anything not yet judged that slips past still gets judged, so nothing escapes QA
  belt.crates = belt.crates.filter((c) => {
    if (c.verdict === 'no' && c.fall > 3) { belt.binned++; return false; }
    if (c.verdict === 'ok' && c.x > belt.width) { belt.shipped++; return false; }
    if (!c.verdict && c.x > stamp + 2) c.verdict = verdictFor(c);
    return true;
  });
  const lead = belt.crates.reduce((m, c) => Math.min(m, c.x), 1e9);
  if (!belt.crates.length || lead > 5) addCrate(belt);
}

/* ---------- drawing the belt ---------- */

interface Cell {
  ch: string;
  kind: string;          // css class of the span it sits in, '' for plain text
}

type Grid = Cell[][];

function createGrid(width: number): Grid {
  return Array.from({ length: ROWS }, () => Array.from({ length: width }, () => ({ ch: ' ', kind: '' })));
}

/** Writes text into the grid, quietly ignoring anything that falls outside it. */
function put(grid: Grid, row: number, x: number, text: string, kind: string): void {
  for (let i = 0; i < text.length; i++) {
    const cell = grid[row]?.[x + i];
    if (cell) {
      cell.ch = text.charAt(i);
      cell.kind = kind;
    }
  }
}

function drawBelt(grid: Grid, belt: Belt): void {
  const end = beltEnd(belt);
  // belt surface with moving texture, rollers underneath, the bin at the end
  const first = belt.crates[0];
  const off = first ? (first.x & 1) : 0;
  for (let x = 0; x < end; x++) put(grid, 5, x, (x + off) % 2 ? '=' : '-', 'k');
  for (let x = 1; x + 3 <= end; x += 6) put(grid, 6, x, ((x + off) % 4 < 2) ? '(o)' : '(0)', 'k');
  put(grid, 4, end + 1, '|     |', 'k');
  put(grid, 5, end + 1, '| bin |', 'k');
  put(grid, 6, end + 1, "'-----'", 'k');
}

function drawCrate(grid: Grid, c: Crate): void {
  const w = c.label.length + 4;
  const y = 2 + Math.min(c.fall, 3);
  const tilt = c.fall > 0;
  let top = '+' + '-'.repeat(w - 2) + '+';
  if (c.verdict) {
    const tag = c.verdict === 'ok' ? '[shipped]' : '[nope]';
    if (tag.length < w - 2) top = '+-' + tag + '-'.repeat(w - 3 - tag.length) + '+';
  }
  const k = c.verdict === 'ok' ? 'ok' : c.verdict === 'no' ? 'no' : 'k';
  put(grid, y, c.x + (tilt ? 1 : 0), top, k);
  put(grid, y + 1, c.x, '| ', k);
  put(grid, y + 1, c.x + 2, c.label, c.verdict === 'ok' ? 'ok' : 'lab');
  put(grid, y + 1, c.x + 2 + c.label.length, ' |', k);
  put(grid, y + 2, c.x - (tilt ? 1 : 0), '+' + '-'.repeat(w - 2) + '+', k);
}

/** The QA stamp sits on top of everything so it is visible as it comes down. */
function drawStamp(grid: Grid, belt: Belt, now: number): void {
  const x = stampX(belt);
  put(grid, 0, x - 2, '__|__', 'k');
  if (belt.stampDrop) put(grid, 1, x, '|', 'k');
  const wing = MOTH_FRAMES[Math.floor(now / FLAP_MS) % MOTH_FRAMES.length] ?? '';   // the stamp's moth flaps
  put(grid, 1 + belt.stampDrop, x - 1, wing, 'st');
}

/** Runs of the same class become one span; plain runs stay bare text. */
function rowHtml(row: readonly Cell[]): string {
  let html = '';
  let cur: string | null = null;
  let buf = '';
  const flush = (): void => {
    if (buf) html += cur ? '<span class="' + cur + '">' + escapeHtml(buf) + '</span>' : escapeHtml(buf);
    buf = '';
  };
  for (const cell of row) {
    if (cell.kind !== cur) { flush(); cur = cell.kind; }
    buf += cell.ch;
  }
  flush();
  return html;
}

/** The belt as the inner html of a <pre>: ROWS lines of `width` characters. `now` (ms) only picks the stamp moth's wing frame. */
export function renderBelt(belt: Belt, now: number): string {
  const grid = createGrid(belt.width);
  drawBelt(grid, belt);
  belt.crates.forEach((c) => drawCrate(grid, c));
  drawStamp(grid, belt, now);
  return grid.map(rowHtml).join('\n');
}
