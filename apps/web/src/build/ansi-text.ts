// The coloured-text version of a page (index.ansi, what curl, wget and HTTPie get by default): the
// plain-text layout (plain-text.ts) with its marks turned into terminal colours, plus two optional
// blocks of coloured art (terminal-art.ts). See the README, "Markdown and plain text".
//
// The invariant (tests/unit/ansi-text.spec.ts, tests/e2e/plain-pages.spec.ts): let T be the lines
// of index.txt and L the index of its closing links' rule (the last line of 80 dashes, after an
// empty line). With every escape sequence removed, the lines of index.ansi are exactly
//     TOP, T[0 .. L), BOTTOM, T[L ..]
// where TOP and BOTTOM are each either nothing or some art lines followed by one empty line. Art
// lines are drawn with half blocks only: each is spaces and ▀ ▄ █, and not blank. So the art is
// whole lines inserted at those two places and the text is index.txt's, byte for byte.
//
// Escapes are SGR only. The text uses 0 (reset), 1 (bold), 4 (underline: addresses) and 38;5;n (a
// 256 colour; no 24-bit colour); the art also sets backgrounds. A colour never runs across a line
// break: every line that sets one ends with a reset, so `| head` or Ctrl-C never leaves the
// terminal tinted.
import { nearestXterm256 } from '@shipmoth/ascii-art';
import type { PageModel, Tone } from './page-model';
import { WIDTH, layoutParts, type Mark, type Styled } from './plain-text';

/** the site's colour tokens (styles/global.css; tests/unit/plain-pages.spec.ts keeps them in sync) */
export const PALETTE: Record<Tone, string> = {
  y: '#f5b63a',
  v: '#a995ff',
  p: '#ff7fb8',
  t: '#45d6c8',
  r: '#ff5f5f',
  g: '#8be28b',
  w: '#ffffff',
  dim: '#757575',
};

const ESC = '\x1b';
export const RESET = `${ESC}[0m`;
/** an SGR sequence (the only escape this file writes, and the only one it accepts in art) */
const SGR = /\x1b\[[0-9;]*m/g;

/** the nearest xterm 256-colour index to "#rrggbb" (the same choice the art's colours get) */
function xterm256(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return nearestXterm256(n >> 16, (n >> 8) & 255, n & 255);
}

const COLOUR = Object.fromEntries(Object.entries(PALETTE).map(([tone, hex]) => [tone, xterm256(hex)])) as Record<Tone, number>;

/** the SGR parameters of a mark ('' for plain text) */
function parameters(mark: Mark | undefined): string {
  const out: string[] = [];
  if (mark?.bold) out.push('1');
  if (mark?.link) out.push('4');
  if (mark?.tone) out.push(`38;5;${COLOUR[mark.tone]}`);
  return out.join(';');
}

/** one styled line as escapes and text, ending with a reset if it set anything */
function encode(line: Styled): string {
  let out = '';
  let open = '';
  let openMark: Mark | undefined;
  for (const c of line) {
    // a plain space inside a colour can stay in it (nothing shows), unless it would be underlined
    const mark = c.ch === ' ' && !c.mark && open && !openMark?.link ? openMark : c.mark;
    const wanted = parameters(mark);
    if (wanted !== open) {
      out += wanted ? `${ESC}[${open ? '0;' : ''}${wanted}m` : RESET;
      open = wanted;
      openMark = mark;
    }
    out += c.ch;
  }
  // (ends with a reset even when the last stretch was plain: a line with escapes always does)
  return out.includes(ESC) && !out.endsWith(RESET) ? out + RESET : out;
}

/** the text without its SGR escapes */
export function stripSgr(text: string): string {
  return text.replace(SGR, '');
}

/** what an art line shows: half blocks and spaces, at least one block (so no art line can pass for text) */
const ART_LINE = /^ *[▀▄█][ ▀▄█]*$/;

/** art lines must be as safe as the text: one line each, SGR only, at most WIDTH columns, reset at the end */
function checkArt(art: readonly string[]): void {
  for (const [i, line] of art.entries()) {
    const why = /[\n\r]/.test(line)
      ? 'has a line break'
      : /[\x00-\x1a\x1c-\x1f\x7f]/.test(line) || stripSgr(line).includes(ESC)
        ? 'has an escape that is not SGR, or another control character'
        : [...stripSgr(line)].length > WIDTH
          ? `is wider than ${WIDTH} columns`
          : line.includes(ESC) && !line.endsWith(RESET)
            ? 'sets a colour and does not reset it at the end'
            : !ART_LINE.test(stripSgr(line))
              ? 'is not half blocks (spaces and ▀ ▄ █, not blank)'
              : undefined;
    if (why) throw new Error(`plain pages: line ${i + 1} of the terminal art ${why}: ${JSON.stringify(line)}`);
  }
}

/** the art for a page: already coloured lines for its two places */
export interface PageArt {
  /** above the banner: the first thing printed */
  top?: readonly string[];
  /** just before the closing links: the last screenful a terminal shows after `curl` */
  beforeLinks?: readonly string[];
}

/** a block of art lines and the empty line below it (nothing for no art) */
const artBlock = (art: readonly string[]): string[] => (art.length ? [...art, ''] : []);

/** the page in colour, with its art (see the invariant at the top) */
export function toAnsiText(page: PageModel, art: PageArt = {}): string {
  const { top = [], beforeLinks = [] } = art;
  checkArt(top);
  checkArt(beforeLinks);
  const { body, links } = layoutParts(page);
  return `${[...artBlock(top), ...body.map(encode), '', ...artBlock(beforeLinks), ...links.map(encode)].join('\n')}\n`;
}
