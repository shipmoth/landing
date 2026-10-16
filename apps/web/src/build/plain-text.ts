// The plain-text version of a page (index.txt, for curl and terminals): UTF-8, no escape codes,
// hard-wrapped so no line is wider than WIDTH columns, laid out like the site: a small banner,
// `## ` headings, numbered steps, labels in a column beside their text, the small ascii drawings.
//
// The layout is made of styled lines (layout()): every character carries a Mark that says what it
// is (a heading, a link's address, dim text, a colour the page gives it). index.txt is just their
// characters; the coloured version (ansi-text.ts, index.ansi) is the same lines with the marks
// turned into colours, so the two can never say different things or wrap differently.
import { MOTH_FRAMES } from '../scripts/lib/moth';
import type { Block, Inline, ListItem, PageModel, Tone, ToneRun } from './page-model';

export const WIDTH = 80;
/** labels wider than this go on their own line instead of in a column */
const MAX_LEAD = 24;
const MOTH = MOTH_FRAMES[0];
const MARKDOWN_HREF = 'index.md';
const HTML_HREF = './';

// ---- styled text ---------------------------------------------------------------------------------

/** what a character is, for the coloured version (plain text ignores it) */
export interface Mark {
  /** its colour: one the page gives it, or the layout's (dim frames and markers, the amber moth) */
  tone?: Tone;
  bold?: boolean;
  /** an address (a URL, a path, the e-mail address) */
  link?: boolean;
}

/** one character, one terminal column (the copy has no wide or combining characters) */
export interface Cell {
  ch: string;
  mark?: Mark;
}

/** a line, or a stretch of one */
export type Styled = Cell[];

const DIM: Mark = { tone: 'dim' };
const LINK: Mark = { link: true };
const BOLD: Mark = { bold: true };

const toneMark = (tone: Tone | undefined): Mark | undefined => (tone ? { tone } : undefined);

/** `inner` on top of `outer` (inside a dim paragraph, a coloured phrase is coloured) */
function merge(outer: Mark | undefined, inner: Mark | undefined): Mark | undefined {
  return outer && inner ? { ...outer, ...inner } : (inner ?? outer);
}

function sameMark(a: Mark | undefined, b: Mark | undefined): boolean {
  return a?.tone === b?.tone && !!a?.bold === !!b?.bold && !!a?.link === !!b?.link;
}

function cell(ch: string, mark: Mark | undefined): Cell {
  return mark ? { ch, mark } : { ch };
}

function styled(text: string, mark?: Mark): Styled {
  return [...text].map((ch) => cell(ch, mark));
}

const spaces = (n: number): Styled => styled(' '.repeat(Math.max(0, n)));

/** the characters of a styled line */
export function textOf(line: Styled): string {
  return line.map((c) => c.ch).join('');
}

function width(text: Styled): number {
  return text.length;
}

function pad(text: Styled, to: number): Styled {
  return [...text, ...spaces(to - width(text))];
}

const isSpace = (c: Cell | undefined) => c?.ch === ' ';

function trimEnd(text: Styled): Styled {
  let end = text.length;
  while (end > 0 && isSpace(text[end - 1])) end--;
  return text.slice(0, end);
}

function trim(text: Styled): Styled {
  let start = 0;
  while (start < text.length && isSpace(text[start])) start++;
  return trimEnd(text.slice(start));
}

/** the text cut at a character (a newline, a space), without it */
function split(text: Styled, at: string): Styled[] {
  const out: Styled[] = [[]];
  for (const c of text) {
    if (c.ch === at) out.push([]);
    else out[out.length - 1]?.push(c);
  }
  return out;
}

function join(parts: Styled[], separator: string): Styled {
  return parts.flatMap((part, i) => (i ? [...styled(separator), ...part] : part));
}

/** a word cut into pieces of at most `room` columns (the copy has none that long; a URL could be) */
function pieces(word: Styled, room: number): Styled[] {
  const out: Styled[] = [];
  for (let i = 0; i < word.length; i += room) out.push(word.slice(i, i + room));
  return out;
}

/**
 * Greedy word wrap to `columns`: the first line starts with `first`, the others with `rest`. The
 * space between two words keeps their mark when they share it (a bold phrase stays one stretch).
 */
function wrap(text: Styled, first: Styled, rest: Styled = spaces(width(first)), columns = WIDTH): Styled[] {
  const room = columns - Math.max(width(first), width(rest));
  const out: Styled[] = [];
  let line = [...first];
  let filled = false;
  for (const word of split(text, ' ').filter((w) => w.length)) {
    for (const piece of pieces(word, room)) {
      if (filled && width(line) + 1 + width(piece) > columns) {
        out.push(line);
        line = [...rest];
        filled = false;
      }
      if (filled) {
        const before = line[line.length - 1]?.mark;
        const after = piece[0]?.mark;
        line.push(cell(' ', sameMark(before, after) ? before : undefined));
      }
      line.push(...piece);
      filled = true;
    }
  }
  if (filled || !out.length) out.push(line);
  return out.map(trimEnd);
}

// ---- inline content --------------------------------------------------------------------------

/** a link's own address is spelled out after its text, unless the text already is the address */
function linkText(href: string, children: Inline[], mark: Mark | undefined): Styled {
  const text = inlines(children, mark);
  if (href.startsWith('#')) return text;
  const shown = href.startsWith('mailto:') ? href.slice('mailto:'.length) : href;
  if (textOf(text).trim() === shown) return inlines(children, merge(mark, LINK));
  return [...text, ...styled(' (', mark), ...styled(shown, merge(mark, LINK)), ...styled(')', mark)];
}

function inline(node: Inline, mark: Mark | undefined): Styled {
  switch (node.kind) {
    case 'text':
      return styled(node.text, mark);
    case 'emphasis':
      return inlines(node.children, merge(mark, toneMark(node.tone)));
    case 'strong':
      return inlines(node.children, merge(mark, merge(BOLD, toneMark(node.tone))));
    case 'deleted':
      // (struck-through text is the old way of doing a thing: dim, like on the site)
      return inlines(node.children, merge(mark, toneMark(node.tone ?? 'dim')));
    case 'link':
      return linkText(node.href, node.children, mark);
    case 'break':
      return styled('\n');
  }
}

function inlines(content: Inline[], mark: Mark | undefined): Styled {
  return content.flatMap((node) => inline(node, mark));
}

/** runs of more than one space as one */
function collapse(text: Styled): Styled {
  return text.filter((c, i) => !(isSpace(c) && isSpace(text[i - 1])));
}

/** inline content as lines of words (split at breaks, white space collapsed) */
function lines(content: Inline[], mark?: Mark): Styled[] {
  return split(inlines(content, mark), '\n')
    .map((line) => trim(collapse(line)))
    .filter((line) => line.length);
}

function wrapped(content: Inline[], first: Styled, rest?: Styled, mark?: Mark): Styled[] {
  return lines(content, mark).flatMap((line, i) => wrap(line, i ? (rest ?? spaces(width(first))) : first, rest));
}

// ---- blocks ------------------------------------------------------------------------------------

/** `## what we go after`: the marker dim, the words bold (and in the box's colour, if it has one) */
function heading(level: number, content: Inline[], tone: Tone | undefined): Styled[] {
  const marker = styled(`${'#'.repeat(level)} `, DIM);
  return wrapped(content, marker, undefined, merge(BOLD, toneMark(tone)));
}

function paragraph(content: Inline[], tone: Tone | undefined): Styled[] {
  return wrapped(content, [], undefined, toneMark(tone));
}

/** the items' drawings side by side, one column each, when they all fit (each in its item's colour) */
function icons(items: ListItem[]): Styled[] {
  const drawings = items.map((item) => (item.icon ?? '').split('\n').map((line) => styled(line, toneMark(item.tone))));
  if (!drawings.some((d) => d.some((line) => line.length))) return [];
  const column = Math.floor(WIDTH / drawings.length);
  const art = drawings.map((d) => Math.max(...d.map(width)));
  if (art.some((w) => w > column)) return [];
  const rows = Math.max(...drawings.map((d) => d.length));
  const out: Styled[] = [];
  for (let r = 0; r < rows; r++) {
    const cells = drawings.map((d, i) => {
      const left = Math.floor((column - (art[i] ?? 0)) / 2);
      return pad([...spaces(left), ...(d[r] ?? [])], column);
    });
    out.push(trimEnd(cells.flat()));
  }
  return [...out, []];
}

/** `01  find a friction` with the step's text below it, like the site's flowchart (amber numbers, dim text) */
function numbered(item: ListItem, n: number): Styled[] {
  const number = [...styled(String(n).padStart(2, '0'), { tone: 'y' }), ...spaces(2)];
  const indent = spaces(width(number));
  if (!item.lead) return wrapped(item.body, number, indent);
  return [...wrapped(item.lead, number, indent), ...wrapped(item.body, indent, undefined, DIM)];
}

/** a label in its item's colour (a goal's name); otherwise dim (before / after) */
const leadMark = (item: ListItem): Mark => toneMark(item.tone) ?? DIM;

/** labels in a column, their text beside them: `  before   ask around, call schools…` */
function labelled(items: ListItem[], mark: (item: ListItem) => Mark | undefined = leadMark): Styled[] {
  const lead = (item: ListItem) => join(lines(item.lead ?? [], mark(item)), ' ');
  const leadWidth = Math.max(...items.map((item) => width(lead(item))));
  if (leadWidth > MAX_LEAD) return items.flatMap((item) => bulleted(item, mark));
  return items.flatMap((item) => {
    const first = [...spaces(2), ...pad(lead(item), leadWidth), ...spaces(3)];
    return wrapped(item.body, first, spaces(width(first)));
  });
}

function bulleted(item: ListItem, mark: (item: ListItem) => Mark | undefined = leadMark): Styled[] {
  const bullet = [...styled('-', DIM), ...spaces(1)];
  if (!item.lead) return wrapped(item.body, bullet, spaces(2));
  return [...wrapped(item.lead, bullet, spaces(2), mark(item)), ...wrapped(item.body, spaces(2))];
}

function list(ordered: boolean, items: ListItem[]): Styled[] {
  const drawn = icons(items);
  if (ordered) return [...drawn, ...items.flatMap((item, i) => numbered(item, i + 1))];
  if (items.every((item) => item.lead)) return [...drawn, ...labelled(items)];
  return [...drawn, ...items.flatMap((item) => bulleted(item))];
}

function preformatted(runs: ToneRun[]): Styled[] {
  const text = runs.flatMap((run) => styled(run.text, toneMark(run.tone)));
  const out = split(text, '\n').map((line) => trimEnd([...spaces(2), ...line]));
  const wide = out.find((line) => width(line) > WIDTH);
  if (wide !== undefined) throw new Error(`plain pages: a <pre> is wider than ${WIDTH} columns: ${JSON.stringify(textOf(wide))}`);
  return out;
}

const rule = (): Styled => styled('-'.repeat(WIDTH), DIM);

function block(b: Block): Styled[] {
  switch (b.kind) {
    case 'heading':
      return heading(b.level, b.content, b.tone);
    case 'paragraph':
      return paragraph(b.content, b.tone);
    case 'list':
      return list(b.ordered, b.items);
    case 'preformatted':
      return preformatted(b.runs);
    case 'rule':
      return [rule()];
  }
}

// ---- the page ------------------------------------------------------------------------------------

/** `| }o{  shipmoth                         an indie software factory |` in a (dim) box */
function banner(page: PageModel): Styled[] {
  const edge = styled(`+${'-'.repeat(WIDTH - 2)}+`, DIM);
  const inner = WIDTH - 4;
  const left = [...styled(MOTH, { tone: 'y' }), ...spaces(2), ...styled(page.title, BOLD)];
  const right = styled(page.strapline, DIM);
  const rows = width(left) + 2 + width(right) <= inner ? [[...pad(left, inner - width(right)), ...right]] : [left, right];
  // (a row too long for the box, which the site's short title and strapline never are, wraps)
  const fitted = rows.flatMap((row) => (width(row) <= inner ? [row] : wrap(row, [], [], inner)));
  return [edge, ...fitted.map((row) => [...styled('| ', DIM), ...pad(row, inner), ...styled(' |', DIM)]), edge];
}

const text = (t: string): Inline[] => [{ kind: 'text', text: t }];
const address = (href: string, note?: string): Inline[] => [
  { kind: 'link', href, children: text(href) },
  ...(note ? [{ kind: 'emphasis' as const, tone: 'dim' as const, children: text(` (${note})`) }] : []),
];

/** where to go next: the nav's pages and this page's other versions, as `name   address` rows */
function footer(page: PageModel): Styled[] {
  const items: ListItem[] = [
    ...page.nav.map((link) => ({ lead: text(link.text), body: address(link.href, link.current ? 'this page' : undefined) })),
    { lead: text('markdown'), body: address(MARKDOWN_HREF, 'or ask for text/markdown') },
    { lead: text('html'), body: address(HTML_HREF, 'what a browser gets') },
  ];
  return [rule(), [], styled('links, relative to this page:', DIM), [], ...labelled(items, () => undefined)];
}

/** consecutive rules (around a skipped section) read as one */
function withoutRepeatedRules(blocks: Block[]): Block[] {
  return blocks.filter((b, i) => !(b.kind === 'rule' && (i === 0 || blocks[i - 1]?.kind === 'rule')));
}

/**
 * The page as styled lines, in two parts: the banner and the page, then the closing links (from
 * their rule on). layout() is the two one empty line apart; the coloured version puts art between.
 */
export function layoutParts(page: PageModel): { body: Styled[]; links: Styled[] } {
  const sections = [banner(page), ...withoutRepeatedRules(page.blocks).map(block)];
  return { body: sections.flatMap((lines, i) => (i ? [[], ...lines] : lines)), links: footer(page) };
}

/** the page as styled lines, its sections one blank line apart (no line ends in a space) */
export function layout(page: PageModel): Styled[] {
  const { body, links } = layoutParts(page);
  return [...body, [], ...links];
}

export function toPlainText(page: PageModel): string {
  return `${layout(page).map(textOf).join('\n')}\n`;
}
