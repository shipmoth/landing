// The coloured art in index.ansi (ansi-text.ts): the wordmark and the hero moth from
// @shipmoth/ascii-art, drawn in half blocks and centred in the terminal's 80 columns. index.txt
// never has it.
//
// Where it goes: a long page scrolls by after `curl` and the terminal is left showing its END. So
// the home page opens with the wordmark and closes with the moth just above the links (the last
// screenful is moth + links); the about page has the wordmark on top.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { decodeArt, renderArtForTerminal, visibleWidth, type Art, type CompactArt } from '@shipmoth/ascii-art';
import type { PageArt } from './ansi-text';
import { WIDTH } from './plain-text';

/** false: index.ansi is the coloured text alone, with no art */
export const TERMINAL_ART = true;

export type ArtName = 'hero' | 'wordmark';

/** one piece of art: which, and how many columns at most */
interface Piece {
  name: ArtName;
  width: number;
}

/** which art goes where on which page (by its file in dist) */
const PAGE_ART: Record<string, { top?: Piece; beforeLinks?: Piece }> = {
  'index.html': { top: { name: 'wordmark', width: WIDTH }, beforeLinks: { name: 'hero', width: 60 } },
  'about/index.html': { top: { name: 'wordmark', width: WIDTH } },
};

const require = createRequire(import.meta.url);
const decoded = new Map<ArtName, Art>();

function art(name: ArtName): Art {
  let found = decoded.get(name);
  if (!found) {
    found = decodeArt(JSON.parse(readFileSync(require.resolve(`@shipmoth/ascii-art/${name}`), 'utf8')) as CompactArt);
    decoded.set(name, found);
  }
  return found;
}

/** a piece as terminal lines (half blocks, 256 colours), centred in WIDTH columns */
export function terminalArt({ name, width }: Piece): string[] {
  const lines = renderArtForTerminal(art(name), { width, mode: 'blocks', colours: 256 });
  const left = ' '.repeat(Math.max(0, Math.floor((WIDTH - Math.max(0, ...lines.map(visibleWidth))) / 2)));
  return lines.map((line) => left + line);
}

/** the art for a page (`index.html`, `about/index.html`) */
export function artFor(page: string): PageArt {
  const pieces = TERMINAL_ART ? PAGE_ART[page] : undefined;
  return {
    top: pieces?.top ? terminalArt(pieces.top) : [],
    beforeLinks: pieces?.beforeLinks ? terminalArt(pieces.beforeLinks) : [],
  };
}
