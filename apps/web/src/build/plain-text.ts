// The plain-text version of a page (index.txt, for curl and terminals): UTF-8, no escape codes,
// hard-wrapped so no line is wider than WIDTH columns, laid out like the site: a small banner,
// `## ` headings, numbered steps, labels in a column beside their text, the small ascii drawings.
import { MOTH_FRAMES } from '../scripts/lib/moth';
import type { Block, Inline, ListItem, PageModel } from './page-model';

export const WIDTH = 80;
/** labels wider than this go on their own line instead of in a column */
const MAX_LEAD = 24;
const MOTH = MOTH_FRAMES[0];
const MARKDOWN_HREF = 'index.md';
const HTML_HREF = './';

/** a terminal column per code point (the copy has no wide or combining characters) */
function width(text: string): number {
  return [...text].length;
}

function pad(text: string, to: number): string {
  return text + ' '.repeat(Math.max(0, to - width(text)));
}

/** a word cut into pieces of at most `room` columns (the copy has none that long; a URL could be) */
function pieces(word: string, room: number): string[] {
  const chars = [...word];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += room) out.push(chars.slice(i, i + room).join(''));
  return out;
}

/** greedy word wrap to `columns`: the first line starts with `first`, the others with `rest` */
export function wrap(text: string, first: string, rest = ' '.repeat(width(first)), columns = WIDTH): string[] {
  const room = columns - Math.max(width(first), width(rest));
  const out: string[] = [];
  let line = first;
  let filled = false;
  for (const word of text.split(' ').filter(Boolean)) {
    for (const piece of pieces(word, room)) {
      if (filled && width(line) + 1 + width(piece) > columns) {
        out.push(line);
        line = rest;
        filled = false;
      }
      line += (filled ? ' ' : '') + piece;
      filled = true;
    }
  }
  if (filled || !out.length) out.push(line);
  return out.map((l) => l.trimEnd());
}

// ---- inline content --------------------------------------------------------------------------

/** a link's own address is spelled out after its text, unless the text already is the address */
function linkText(href: string, children: Inline[]): string {
  const text = inlines(children);
  const shown = href.startsWith('mailto:') ? href.slice('mailto:'.length) : href;
  return text.trim() === shown || href.startsWith('#') ? text : `${text} (${shown})`;
}

function inline(node: Inline): string {
  switch (node.kind) {
    case 'text':
      return node.text;
    case 'emphasis':
    case 'strong':
    case 'deleted':
      return inlines(node.children);
    case 'link':
      return linkText(node.href, node.children);
    case 'break':
      return '\n';
  }
}

function inlines(content: Inline[]): string {
  return content.map(inline).join('');
}

/** inline content as lines of words (split at breaks, white space collapsed) */
function lines(content: Inline[]): string[] {
  return inlines(content)
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);
}

function wrapped(content: Inline[], first: string, rest?: string): string[] {
  return lines(content).flatMap((line, i) => wrap(line, i ? (rest ?? ' '.repeat(width(first))) : first, rest));
}

// ---- blocks ------------------------------------------------------------------------------------

function heading(level: number, content: Inline[]): string[] {
  const marker = `${'#'.repeat(level)} `;
  return wrapped(content, marker);
}

function paragraph(content: Inline[]): string[] {
  return wrapped(content, '');
}

/** the items' drawings side by side, one column each, when they all fit */
function icons(items: ListItem[]): string[] {
  const drawings = items.map((item) => (item.icon ?? '').split('\n'));
  if (!drawings.some((d) => d.join(''))) return [];
  const column = Math.floor(WIDTH / drawings.length);
  const art = drawings.map((d) => Math.max(...d.map(width)));
  if (art.some((w) => w > column)) return [];
  const rows = Math.max(...drawings.map((d) => d.length));
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cells = drawings.map((d, i) => {
      const left = Math.floor((column - (art[i] ?? 0)) / 2);
      return pad(' '.repeat(left) + (d[r] ?? ''), column);
    });
    out.push(cells.join('').trimEnd());
  }
  return [...out, ''];
}

/** `01  find a friction` with the step's text below it, like the site's flowchart */
function numbered(item: ListItem, n: number): string[] {
  const number = `${String(n).padStart(2, '0')}  `;
  const indent = ' '.repeat(width(number));
  if (!item.lead) return wrapped(item.body, number, indent);
  return [...wrapped(item.lead, number, indent), ...wrapped(item.body, indent)];
}

/** labels in a column, their text beside them: `  before   ask around, call schools…` */
function labelled(items: ListItem[]): string[] {
  const leadWidth = Math.max(...items.map((item) => width(lines(item.lead ?? []).join(' '))));
  if (leadWidth > MAX_LEAD) return items.flatMap(bulleted);
  return items.flatMap((item) => {
    const first = `  ${pad(lines(item.lead ?? []).join(' '), leadWidth)}   `;
    return wrapped(item.body, first, ' '.repeat(width(first)));
  });
}

function bulleted(item: ListItem): string[] {
  if (!item.lead) return wrapped(item.body, '- ', '  ');
  return [...wrapped(item.lead, '- ', '  '), ...wrapped(item.body, '  ')];
}

function list(ordered: boolean, items: ListItem[]): string[] {
  const drawn = icons(items);
  if (ordered) return [...drawn, ...items.flatMap((item, i) => numbered(item, i + 1))];
  if (items.every((item) => item.lead)) return [...drawn, ...labelled(items)];
  return [...drawn, ...items.flatMap(bulleted)];
}

function preformatted(text: string): string[] {
  const out = text.split('\n').map((line) => `  ${line}`.trimEnd());
  const wide = out.find((line) => width(line) > WIDTH);
  if (wide !== undefined) throw new Error(`plain pages: a <pre> is wider than ${WIDTH} columns: ${JSON.stringify(wide)}`);
  return out;
}

function block(b: Block): string[] {
  switch (b.kind) {
    case 'heading':
      return heading(b.level, b.content);
    case 'paragraph':
      return paragraph(b.content);
    case 'list':
      return list(b.ordered, b.items);
    case 'preformatted':
      return preformatted(b.text);
    case 'rule':
      return ['-'.repeat(WIDTH)];
  }
}

// ---- the page ------------------------------------------------------------------------------------

/** `| }o{  shipmoth                         an indie software factory |` in a box */
function banner(page: PageModel): string[] {
  const edge = `+${'-'.repeat(WIDTH - 2)}+`;
  const inner = WIDTH - 4;
  const left = `${MOTH}  ${page.title}`;
  const right = page.strapline;
  const rows = width(left) + 2 + width(right) <= inner ? [pad(left, inner - width(right)) + right] : [left, right];
  // (a row too long for the box, which the site's short title and strapline never are, wraps)
  const fitted = rows.flatMap((row) => (width(row) <= inner ? [row] : wrap(row, '', '', inner)));
  return [edge, ...fitted.map((row) => `| ${pad(row, inner)} |`), edge];
}

const text = (t: string): Inline[] => [{ kind: 'text', text: t }];

/** where to go next: the nav's pages and this page's other versions, as `name   address` rows */
function footer(page: PageModel): string[] {
  const items: ListItem[] = [
    ...page.nav.map((link) => ({ lead: text(link.text), body: text(link.current ? `${link.href} (this page)` : link.href) })),
    { lead: text('markdown'), body: text(`${MARKDOWN_HREF} (or ask for text/markdown)`) },
    { lead: text('html'), body: text(`${HTML_HREF} (what a browser gets)`) },
  ];
  return ['-'.repeat(WIDTH), '', 'links, relative to this page:', '', ...labelled(items)];
}

/** consecutive rules (around a skipped section) read as one */
function withoutRepeatedRules(blocks: Block[]): Block[] {
  return blocks.filter((b, i) => !(b.kind === 'rule' && (i === 0 || blocks[i - 1]?.kind === 'rule')));
}

export function toPlainText(page: PageModel): string {
  const sections = [banner(page), ...withoutRepeatedRules(page.blocks).map(block), footer(page)];
  return `${sections.map((lines) => lines.join('\n')).join('\n\n')}\n`;
}
