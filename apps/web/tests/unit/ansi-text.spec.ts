/**
 * The coloured-text version of a page (index.ansi, src/build/ansi-text.ts) on html fixtures shaped
 * like the built pages. The escapes are read back by a small terminal model written here (not the
 * generator's own code), and the colour indices expected are written down here from global.css and
 * the xterm palette (the nearest in OKLab, as @shipmoth/ascii-art's nearestXterm256 picks them):
 *
 *   --y #f5b63a -> 214 #ffaf00   --v #a995ff -> 141 #af87ff   --p #ff7fb8 -> 211 #ff87af
 *   --t #45d6c8 -> 44 #00d7d7    --dim #757575 -> 243 #767676
 *
 * The invariant: stripped of its escapes, index.ansi is index.txt, byte for byte, with at most two
 * blocks of art lines inserted, each followed by one empty line: one before the first line, one
 * before the closing links' rule (the last line of dashes). Art lines are half blocks and spaces.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PALETTE } from '../../src/build/ansi-text';
import { plainVersions } from '../../src/build/plain-pages';
import { TERMINAL_ART, artFor } from '../../src/build/terminal-art';

const WIDTH = 80;
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const AMBER = 214;
const VIOLET = 141;
const PINK = 211;
const TEAL = 44;
const DIM = 243;
/** an art line, stripped: half blocks and spaces, at least one block */
const ART_LINE = /^ *[▀▄█][ ▀▄█]*$/;

/** index.txt with art blocks put where the invariant says (each block: its lines, then an empty one) */
function withArtInserted(txt: string, top: string[], beforeLinks: string[]): string {
  const lines = txt.split('\n');
  const at = lines.lastIndexOf('-'.repeat(WIDTH));
  expect(at, 'the closing links start with a rule').toBeGreaterThan(0);
  expect(lines[at + 2], 'and it is the links').toBe('links, relative to this page:');
  const block = (art: string[]) => (art.length ? [...art, ''] : []);
  return [...block(top), ...lines.slice(0, at), ...block(beforeLinks), ...lines.slice(at)].join('\n');
}

const HEADER = `<header class="top"><nav class="nav"><a href="./" aria-current="page">shipmoth</a> <span class="dim" aria-hidden="true">/</span> <a href="about/">about</a></nav> <span class="dim"><span id="spin" aria-hidden="true">|</span> an indie software factory</span></header>`;

function html(main: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>shipmoth</title><meta name="description" content="what it is about"></head><body>${HEADER}<main>${main}</main></body></html>`;
}

const product = (id: string, colour: string, lede: string) => `
  <section class="prod" id="${id}" style="--c:var(--${colour})"><h2>${id}</h2><p class="lede">${lede}</p><p>${id} does a thing for you.</p>
    <ul class="feat"><li class="was"><span>before</span><s>the old way, which took a long time.</s></li><li class="now"><span>after</span>the new way.</li></ul>
    <p><a class="go" href="#${id}">[ open ${id} ]</a></p></section>`;

/** a page with every kind of colour the site uses */
const SITE = html(`
  <section class="hero"><div id="orbit" role="img" aria-label="a moth"></div><h1 class="title"><span class="sr">shipmoth</span></h1>
    <p class="type"><span id="typed"><noscript>odd ideas in. less friction out.</noscript></span></p></section>
  <hr>
  <section><p>one helps you <i class="y">learn to drive</i>. one helps you <i class="v">find a film and someone to watch it with</i>. one helps you <i class="p">pick a haircut before you commit to it</i>. take <b>less time, less space, and fewer steps</b>.</p></section>
  <hr>
  <section><h2>what we go after</h2><ul class="gofor">
    <li style="--c:var(--y)"><pre class="ico" aria-hidden="true">._.\n|_|</pre> <b>time</b> <span class="txt">slow tabs.</span></li>
    <li style="--c:var(--v)"><pre class="ico" aria-hidden="true">+-+\n+-+</pre> <b>space</b> <span class="txt">five apps.</span></li>
    <li style="--c:var(--p)"><pre class="ico" aria-hidden="true">_|\n|</pre> <b>steps</b> <span class="txt">every form.</span></li></ul>
    <p class="dim gofor-note">if tech can reach it, it is fair game.</p></section>
  <hr>
  <section><h2>off the line</h2><p class="dim">three products so far.</p></section>
  ${product('lride', 'y', 'learning to drive.')}${product('lwatch', 'v', 'a film.')}${product('lglow', 'p', 'your next look.')}
  <hr>
  <section><h2>how the factory runs</h2><ol class="flow"><li><b>find a friction</b><span>something slow.</span></li><li><b>fix it</b><span>small.</span></li></ol>
    <pre class="loop" role="img" aria-label="back">'--- back to 01 ---'</pre></section>
  <hr>
  <section><h2>the crew</h2><ul class="crew"><li class="mate" style="--c:var(--t)"><h3>ijas</h3><p class="bio">keeps it working.</p><p class="tag">[ backend ]</p></li></ul></section>
  <section id="contact"><h2>say hello</h2><p>write to <b id="mail">hello@shipmoth.com</b></p><p>sign up below.</p></section>
  <hr>
  <footer><pre class="dim signed">-----BEGIN SHIPMOTH SIGNED MESSAGE-----
  less time. less space. fewer steps.

<span class="mid"><i class="y">lride</i>  &middot;  <i class="v">lwatch</i>  &middot;  <i class="p">lglow</i></span>
------END SHIPMOTH SIGNED MESSAGE------</pre><p class="dim">&copy; 2026 shipmoth</p></footer>`);

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

interface Shown {
  ch: string;
  fg: number | undefined;
  bold: boolean;
  underline: boolean;
}

/** a terminal's reading of SGR escapes: each visible character with the style it is drawn in */
class Terminal {
  fg: number | undefined;
  /** (the art sets backgrounds too) */
  bg: number | undefined;
  bold = false;
  underline = false;

  get plain(): boolean {
    return this.fg === undefined && this.bg === undefined && !this.bold && !this.underline;
  }

  apply(params: string): void {
    const p = params === '' ? [0] : params.split(';').map(Number);
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      if (v === 0) [this.fg, this.bg, this.bold, this.underline] = [undefined, undefined, false, false];
      else if (v === 1) this.bold = true;
      else if (v === 4) this.underline = true;
      else if (v === 38 && p[i + 1] === 5) this.fg = p[(i += 2)];
      else if (v === 48 && p[i + 1] === 5) this.bg = p[(i += 2)];
      else if (v === 39) this.fg = undefined;
      else if (v === 49) this.bg = undefined;
      else throw new Error(`unexpected SGR parameter ${v} in ${params}`);
    }
  }

  line(text: string): Shown[] {
    const out: Shown[] = [];
    for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
      const sgr = /^\x1b\[([0-9;]*)m$/.exec(part);
      if (sgr) this.apply(sgr[1] ?? '');
      else for (const ch of part) out.push({ ch, fg: this.fg, bold: this.bold, underline: this.underline });
    }
    return out;
  }
}

/** every line of an ansi text as shown, each starting from the state the previous one left */
function show(ansi: string): Shown[][] {
  const terminal = new Terminal();
  return ansi.split('\n').map((line) => terminal.line(line));
}

/** the style of `word` where it first appears on a line matching `on` (all its characters must agree) */
function styleOf(ansi: string, word: string, on: RegExp | string = word): Omit<Shown, 'ch'> {
  for (const line of show(ansi)) {
    const text = line.map((c) => c.ch).join('');
    if (typeof on === 'string' ? !text.includes(on) : !on.test(text)) continue;
    const at = [...text].join('').indexOf(word);
    if (at < 0) continue;
    const cells = line.slice(at, at + [...word].length);
    const [first] = cells;
    if (!first) continue;
    for (const c of cells) expect({ ...c, ch: '' }, `"${word}" is one style`).toEqual({ ...first, ch: '' });
    return { fg: first.fg, bold: first.bold, underline: first.underline };
  }
  throw new Error(`"${word}" not found`);
}

const { txt, ansi } = plainVersions(SITE);

test.describe('the invariant: index.ansi is index.txt plus colour', () => {
  test('without art, stripping the escapes gives exactly index.txt', () => {
    expect(ansi).toContain(ESC);
    expect(strip(ansi)).toBe(txt);
  });

  test('with art: the art lines inserted on top and before the links, the text exactly the same', () => {
    const top = [`${ESC}[38;5;214m▀▄█${RESET}`, `  ${ESC}[38;5;141;48;5;16m█ ▀${RESET}`];
    const beforeLinks = [`   ${ESC}[38;5;211m▄▄${RESET}`];
    const withArt = plainVersions(SITE, { top, beforeLinks }).ansi;
    expect(withArt.startsWith(`${top.join('\n')}\n\n`)).toBe(true);
    expect(withArt).toContain(`\n\n${beforeLinks[0]}\n\n`);
    expect(strip(withArt)).toBe(withArtInserted(txt, ['▀▄█', '  █ ▀'], ['   ▄▄']));
    // the art moves nothing else: without it, the coloured text is the same
    const isArt = (line: string | undefined) => line !== undefined && ART_LINE.test(strip(line));
    const lines = withArt.split('\n');
    const rest = lines.filter((line, i) => !isArt(line) && !(line === '' && isArt(lines[i - 1])));
    expect(rest.join('\n')).toBe(ansi);
  });

  test('the real art: the wordmark on top of both pages, the moth before the home page links', () => {
    test.skip(!TERMINAL_ART, 'TERMINAL_ART is off');
    const home = artFor('index.html');
    const about = artFor('about/index.html');
    expect(home.top?.length, 'home wordmark rows').toBeGreaterThanOrEqual(5);
    expect(home.beforeLinks?.length, 'home moth rows').toBeGreaterThanOrEqual(8);
    expect(about.top, 'the same wordmark').toEqual(home.top);
    expect(about.beforeLinks ?? []).toEqual([]);
    for (const [name, art] of [['home', home], ['about', about]] as const) {
      const top = [...(art.top ?? [])];
      const beforeLinks = [...(art.beforeLinks ?? [])];
      const out = strip(plainVersions(SITE, art).ansi);
      expect(out, name).toBe(withArtInserted(txt, top.map(strip), beforeLinks.map(strip)));
      for (const line of [...top, ...beforeLinks]) expect(strip(line), name).toMatch(ART_LINE);
    }
  });

  test('the real art is centred in 80 columns; the moth is at most 60 wide', () => {
    test.skip(!TERMINAL_ART, 'TERMINAL_ART is off');
    const { top = [], beforeLinks = [] } = artFor('index.html');
    for (const [art, most] of [[top, WIDTH], [beforeLinks, 60]] as const) {
      const lines = art.map(strip);
      const left = Math.min(...lines.map((l) => l.length - l.trimStart().length));
      const right = Math.max(...lines.map((l) => [...l].length));
      expect(right - left, 'art width').toBeLessThanOrEqual(most);
      expect(Math.abs(left - (WIDTH - right)), `margins ${left} and ${WIDTH - right}`).toBeLessThanOrEqual(1);
    }
  });

  test('is deterministic', () => {
    expect(plainVersions(SITE).ansi).toBe(ansi);
    expect(plainVersions(SITE, artFor('index.html')).ansi).toBe(plainVersions(SITE, artFor('index.html')).ansi);
  });
});

test.describe('safe in any terminal', () => {
  const pages = { 'no art': ansi, 'home art': plainVersions(SITE, artFor('index.html')).ansi, 'about art': plainVersions(SITE, artFor('about/index.html')).ansi };

  for (const [name, out] of Object.entries(pages)) {
    test(`${name}: only SGR escapes, and in the text only 0, 1, 4 and 38;5;n`, () => {
      const lines = out.split('\n');
      for (const [i, line] of lines.entries()) {
        expect(strip(line), `line ${i + 1}: an escape that is not SGR`).not.toContain(ESC);
        expect(line, `line ${i + 1}: control characters`).not.toMatch(/[\x00-\x1a\x1c-\x1f\x7f]/);
      }
      // the text's lines (not the art's): 256 colours, bold and underline only
      for (const line of lines.filter((l) => !ART_LINE.test(strip(l)))) {
        for (const [, params] of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
          expect(params, line).toMatch(/^(0|1|4|38;5;(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))(;(0|1|4|38;5;(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])))*$/);
        }
      }
    });

    test(`${name}: every line that sets a colour ends with a reset, so no colour crosses a line`, () => {
      const terminal = new Terminal();
      for (const [i, line] of out.split('\n').entries()) {
        if (line.includes(ESC)) expect(line.endsWith(RESET), `line ${i + 1}: ${JSON.stringify(line)}`).toBe(true);
        terminal.line(line);
        expect(terminal.plain, `line ${i + 1} leaves a style on: ${JSON.stringify(line)}`).toBe(true);
      }
    });

    test(`${name}: at most ${WIDTH} visible columns a line, no trailing spaces, one final newline`, () => {
      const lines = out.split('\n');
      expect(lines.pop()).toBe('');
      for (const [i, line] of lines.entries()) {
        expect([...strip(line)].length, `line ${i + 1}`).toBeLessThanOrEqual(WIDTH);
        expect(strip(line), `line ${i + 1}`).toBe(strip(line).trimEnd());
      }
    });
  }

  test('long words and long lines still fit, and every word survives', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const out = plainVersions(html(`<h2>${long}</h2><p class="dim">${long} <b>${long}</b></p><p>${'x'.repeat(200)}</p>`)).ansi;
    for (const line of out.split('\n')) expect([...strip(line)].length).toBeLessThanOrEqual(WIDTH);
    expect(strip(out).replace(/\s+/g, ' ')).toContain(`${long} ${long}`);
  });
});

test.describe('the colours', () => {
  test('product names and phrases in their accent colours', () => {
    expect(styleOf(ansi, 'lride', '### lride')).toEqual({ fg: AMBER, bold: true, underline: false });
    expect(styleOf(ansi, 'lwatch', '### lwatch')).toEqual({ fg: VIOLET, bold: true, underline: false });
    expect(styleOf(ansi, 'lglow', '### lglow')).toEqual({ fg: PINK, bold: true, underline: false });
    expect(styleOf(ansi, 'learning to drive.').fg).toBe(AMBER);   // the lede
    expect(styleOf(ansi, 'your next look.').fg).toBe(PINK);
    expect(styleOf(ansi, 'learn to drive').fg).toBe(AMBER);
    expect(styleOf(ansi, 'find a film').fg).toBe(VIOLET);
    expect(styleOf(ansi, 'pick a haircut').fg).toBe(PINK);
    // a product's pitch is the default colour
    expect(styleOf(ansi, 'lride does a thing').fg).toBeUndefined();
  });

  test('a crew card takes its colour: name and tag', () => {
    expect(styleOf(ansi, 'ijas', '### ijas')).toEqual({ fg: TEAL, bold: true, underline: false });
    expect(styleOf(ansi, '[ backend ]').fg).toBe(TEAL);
    expect(styleOf(ansi, 'keeps it working.').fg).toBeUndefined();
  });

  test('headings: the ## marker dim, the words bold', () => {
    expect(styleOf(ansi, '##', '## what we go after')).toEqual({ fg: DIM, bold: false, underline: false });
    expect(styleOf(ansi, 'what we go after')).toEqual({ fg: undefined, bold: true, underline: false });
    expect(styleOf(ansi, '#', /^# shipmoth$/).fg).toBe(DIM);
    expect(styleOf(ansi, 'shipmoth', /^# shipmoth$/).bold).toBe(true);
  });

  test('dim text, rules, the strapline and before / after labels are grey 243', () => {
    expect(styleOf(ansi, 'three products so far.').fg).toBe(DIM);
    expect(styleOf(ansi, 'if tech can reach it').fg).toBe(DIM);
    expect(styleOf(ansi, '-'.repeat(WIDTH)).fg).toBe(DIM);
    expect(styleOf(ansi, 'an indie software factory').fg).toBe(DIM);
    expect(styleOf(ansi, 'before', '  before').fg).toBe(DIM);
    expect(styleOf(ansi, 'after', '  after').fg).toBe(DIM);
    expect(styleOf(ansi, 'the old way').fg).toBe(DIM);   // struck-through on the site
    expect(styleOf(ansi, 'the new way.').fg).toBeUndefined();
  });

  test('the goals: icons and names in their colours, text plain', () => {
    expect(styleOf(ansi, '._.').fg).toBe(AMBER);
    expect(styleOf(ansi, '+-+').fg).toBe(VIOLET);
    expect(styleOf(ansi, '_|').fg).toBe(PINK);
    expect(styleOf(ansi, 'time', '  time ')).toEqual({ fg: AMBER, bold: true, underline: false });
    expect(styleOf(ansi, 'space', '  space ').fg).toBe(VIOLET);
    expect(styleOf(ansi, 'steps', '  steps ').fg).toBe(PINK);
    expect(styleOf(ansi, 'slow tabs.').fg).toBeUndefined();
  });

  test('the banner: dim frame, amber moth, bold title', () => {
    expect(styleOf(ansi, '+---').fg).toBe(DIM);
    expect(styleOf(ansi, '|', '}o{').fg).toBe(DIM);
    expect(styleOf(ansi, '}o{').fg).toBe(AMBER);
    expect(styleOf(ansi, 'shipmoth', '}o{').bold).toBe(true);
  });

  test('the steps: amber numbers, bold names, dim text', () => {
    expect(styleOf(ansi, '01', '01  find').fg).toBe(AMBER);
    expect(styleOf(ansi, 'find a friction').bold).toBe(true);
    expect(styleOf(ansi, 'something slow.').fg).toBe(DIM);
    expect(styleOf(ansi, 'back to 01').fg).toBe(DIM);
  });

  test('the signed message like the site footer: dim frame, coloured product names', () => {
    expect(styleOf(ansi, '-----BEGIN SHIPMOTH SIGNED MESSAGE-----').fg).toBe(DIM);
    expect(styleOf(ansi, 'less time. less space. fewer steps.').fg).toBe(DIM);
    expect(styleOf(ansi, 'lride', 'lride  ·').fg).toBe(AMBER);
    expect(styleOf(ansi, 'lwatch', 'lride  ·').fg).toBe(VIOLET);
    expect(styleOf(ansi, 'lglow', 'lride  ·').fg).toBe(PINK);
    expect(styleOf(ansi, '·', 'lride  ·').fg).toBe(DIM);
  });

  test('bold copy stays bold across its spaces, and addresses are underlined', () => {
    // (wrapped over two lines here; neither line leaves it open)
    expect(styleOf(ansi, 'less time, less', 'take less time')).toEqual({ fg: undefined, bold: true, underline: false });
    expect(styleOf(ansi, 'space, and fewer steps')).toEqual({ fg: undefined, bold: true, underline: false });
    expect(styleOf(ansi, 'hello@shipmoth.com').underline).toBe(true);
    expect(styleOf(ansi, 'about/', /^ {2}about +about\/$/).underline).toBe(true);
    expect(styleOf(ansi, 'index.md', '  markdown').underline).toBe(true);
    expect(styleOf(ansi, '(or ask for text/markdown)').fg).toBe(DIM);
    // the space before a note is not underlined
    const footer = show(ansi).find((line) => line.map((c) => c.ch).join('').startsWith('  markdown'));
    const at = footer?.map((c) => c.ch).join('').indexOf('index.md (') ?? -1;
    expect(footer?.[at + 'index.md'.length]?.underline).toBe(false);
  });

  test('the palette is the one in global.css', () => {
    const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    for (const [tone, hex] of Object.entries(PALETTE)) {
      if (tone === 'w') {
        expect(css).toMatch(/--w:#fff;/);
        continue;
      }
      expect(css, `--${tone}`).toContain(`--${tone}:${hex};`);
    }
  });
});

test.describe('art that would break the terminal fails the build', () => {
  const cases: [string, string, RegExp][] = [
    ['a colour that is not reset', `${ESC}[38;5;1m▀▄`, /does not reset/],
    ['wider than 80 columns', '█'.repeat(WIDTH + 1), /wider than 80/],
    ['a cursor movement', `${ESC}[2A▀▄`, /not SGR/],
    ['a line break', `▀\n▄`, /line break/],
    ['text, which could pass for the page', `${ESC}[38;5;1m}o{${RESET}`, /half blocks/],
    ['a blank line', '   ', /half blocks/],
  ];
  for (const [name, line, error] of cases) {
    test(`${name} (on top or before the links)`, () => {
      expect(() => plainVersions(SITE, { top: [line] })).toThrow(error);
      expect(() => plainVersions(SITE, { beforeLinks: ['█', line] })).toThrow(error);
    });
  }
  test('half blocks in colour, centred, are fine', () => {
    expect(() => plainVersions(SITE, { top: [`   ${ESC}[38;5;1;48;5;2m▀▄█ ▀${RESET}`] })).not.toThrow();
  });
});
