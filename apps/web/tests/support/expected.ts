/**
 * What the site must do, written down once and on purpose NOT imported from src/: a spec that read
 * its expectations from the code under test could never fail. When the copy or a timing changes on
 * purpose, change it here too.
 */

export type PageName = 'index' | 'about';

export interface PageSpec {
  /** where the page is served: clean URLs, each page an index.html in its own folder (astro.config.ts) */
  url: string;
  /** the page's file in the built site (for file:// URLs and the markdown / plain-text versions) */
  file: string;
  /** the nav's two hrefs as written on this page (relative folder links) */
  nav: { shipmoth: string; about: string };
  title: string;
  description: string;
  /** accessible name of the single h1 */
  h1: string;
  /** the nav link marked aria-current="page" */
  current: 'shipmoth' | 'about';
  /** the line the typewriter ends on */
  line: string;
}

export const PAGES: Record<PageName, PageSpec> = {
  index: {
    url: '/',
    file: 'index.html',
    nav: { shipmoth: './', about: 'about/' },
    title: 'shipmoth',
    description:
      'shipmoth is an indie software factory. we build unrelated apps with one goal: make everyday things take less time, less space and fewer steps. lride, lwatch, lglow.',
    h1: 'shipmoth',
    current: 'shipmoth',
    line: 'a small software factory. odd ideas in. less friction out.',
  },
  about: {
    url: '/about/',
    file: 'about/index.html',
    nav: { shipmoth: '../', about: './' },
    title: 'about · shipmoth',
    description:
      'shipmoth is four people and a moth: arjun, alan, ijas and jose. an indie software factory building small apps that take the friction out of everyday things.',
    h1: 'about shipmoth',
    current: 'about',
    line: 'four people. one light. a lot of flapping.',
  },
};

export const PAGE_NAMES = Object.keys(PAGES) as PageName[];

export const META = { themeColor: '#000000', viewport: 'width=device-width, initial-scale=1' };

/** typewriter: one character every 36ms, but a full stop holds for 300ms */
export const TYPE_DELAY = 36;
export const TYPE_DELAY_STOP = 300;

/** how many characters of `line` are visible `ms` after the typewriter starts */
export function typedLength(line: string, ms: number): number {
  let t = 0;
  for (let k = 0; k < line.length; k++) {
    t += line[k] === '.' ? TYPE_DELAY_STOP : TYPE_DELAY;
    if (t > ms) return k;
  }
  return line.length;
}

/** total time until the whole line is visible */
export function typingDuration(line: string): number {
  let t = 0;
  for (const c of line) t += c === '.' ? TYPE_DELAY_STOP : TYPE_DELAY;
  return t;
}

export const SPINNER = { frames: ['|', '/', '-', '\\'], every: 240 };

export const AWAY_TITLE = 'come back, the moth misses you';

export const CONTACT = {
  invalid: (v: string) => `> ${v}\nthat address is missing a part. usually the part after the @.`,
  valid: (v: string) => `> ${v}\nreceived. we will write when the next thing comes off the line, and not before.`,
};

export const COPY = {
  idle: '[ copy ]',
  copied: '[ copied ]',
  selected: '[ selected ]',
  resetAfter: 1500,
  address: 'hello@shipmoth.com',
};

/**
 * The hero moth and the wordmark draw each art cell as its glyph (fillText) when a cell is at least
 * BLOCK_BELOW device px wide, else as a bar (fillRect). Their canvases render at the screen's
 * pixel ratio as long as the canvases drawn together stay within PIXEL_BUDGET device pixels (and
 * never below 2x on a denser screen); every other canvas is capped at 2x.
 */
export const ART_RENDER = {
  blockBelow: 3.4,
  pixelBudget: 3_000_000,
  /** non-blank cells: the hero art (314 x 102) and the wordmark art (315 x 34) */
  heroCells: 18_507,
  wordCells: 5_243,
  /** transparent room around the wordmark's art, css px a side */
  wordPad: 70,
  /** the wordmark drawn as glyphs at 1280px, before it had bars (Chromium, Windows): the 95th
   *  percentile of what its inked pixels show, and its share of bright pixels (tests/support/canvas.ts) */
  wordGlyphLook: { p95: 0.358, bright: 0.0606 },
} as const;

export const WING_FRAMES = ['}o{', ')o(', '|o|', ')o('];

export const IDLE_MS = 30_000;

export const BELT = { rows: 7, tick: 130, minWidth: 30, maxWidth: 72, startShipped: 3, startBinned: 211 };

/** boxes that get an ascii frame */
export const FRAMED = 'main .prod, main .mate, main .wall figure, main .flow li';

/** anything a visitor might press to read or operate; pressing these never lights the lamp */
export const TEXTY =
  'p,li,pre,h1,h2,h3,a,button,input,textarea,select,label,b,i,s,span,code,small,figcaption,[contenteditable]';

/** the design tokens (global.css :root) the state checks expect, as computed colours */
export const COLOURS = {
  bg: 'rgb(0, 0, 0)',
  fg: 'rgb(214, 214, 214)',
  dim: 'rgb(117, 117, 117)',
  y: 'rgb(245, 182, 58)',
  v: 'rgb(169, 149, 255)',
  g: 'rgb(139, 226, 139)',
  w: 'rgb(255, 255, 255)',
};

export const CREW_BIOS: Record<string, readonly string[]> = {
  arjun: [
    'makes things look good, then makes them move.',
    'pushes pixels until they push back.',
    'has opinions about kerning. strong ones.',
    'animates anything that sits still too long.',
    'draws the arrows on the whiteboard, then makes them prettier.',
  ],
  alan: [
    'turns whiteboard ideas into things that run.',
    'writes the code that makes the arrows real.',
    'ships it, then fixes it, then ships it again.',
    'reads error messages for fun. mostly.',
    'thinks in loops and dreams in stack traces.',
  ],
  ijas: [
    'keeps everything underneath quietly working.',
    'the reason the servers sleep well at night.',
    'speaks fluent database. reluctantly.',
    'makes the boring parts boring on purpose.',
    'guards the pipes nobody else wants to look at.',
  ],
  jose: [
    'runs the products and talks to the humans.',
    'answers the emails so the rest of us can hide.',
    'turns "can it do this?" into "it does now."',
    'keeps the lights on and the porch light brighter.',
    'says yes to customers, then tells us about it.',
  ],
};
