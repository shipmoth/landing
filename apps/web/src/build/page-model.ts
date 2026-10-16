// What a built page says, without its markup: the shared input of the markdown, plain-text and
// coloured-text versions (src/build/markdown.ts, plain-text.ts, ansi-text.ts). read-page.ts builds
// it from the html.

/**
 * A colour of the site's palette (the tokens in styles/global.css), where the html gives one: a
 * colour class (`<i class="y">`, `.dim`) or a box's accent (`style="--c:var(--y)"`). Only the
 * coloured text version (ansi-text.ts) uses it; markdown and plain text ignore it.
 */
export type Tone = 'y' | 'v' | 'p' | 't' | 'r' | 'g' | 'w' | 'dim';

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'emphasis' | 'strong' | 'deleted'; children: Inline[]; tone?: Tone }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'break' };

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface ListItem {
  /** a label set flush against the item's text: a step's name, a goal's name, "before" / "after" */
  lead?: Inline[];
  body: Inline[];
  /** a small decorative drawing that goes with the item (the "what we go after" icons) */
  icon?: string;
  /** the item's accent (a goal tile's `--c`) */
  tone?: Tone;
}

/** a stretch of a <pre> in one colour */
export interface ToneRun {
  text: string;
  tone?: Tone;
}

export type Block =
  | { kind: 'heading'; level: HeadingLevel; content: Inline[]; tone?: Tone }
  | { kind: 'paragraph'; content: Inline[]; tone?: Tone }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  /** `runs` are `text` cut where its colour changes (joined, they are exactly `text`) */
  | { kind: 'preformatted'; text: string; runs: ToneRun[] }
  | { kind: 'rule' };

export interface NavLink {
  text: string;
  /** as written in the page, relative to it: `./`, `about/`, `../` */
  href: string;
  current: boolean;
}

export interface PageModel {
  /** <title> */
  title: string;
  /** <meta name="description"> */
  description: string;
  /** the header's line next to the nav ("an indie software factory") */
  strapline: string;
  nav: NavLink[];
  /** the content of <main>, in order */
  blocks: Block[];
}

/** the words of some inline content without its styling (a break is a newline, a link its text) */
export function plainText(content: Inline[]): string {
  return content.map((i) => (i.kind === 'text' ? i.text : i.kind === 'break' ? '\n' : plainText(i.children))).join('');
}
