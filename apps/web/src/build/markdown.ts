// The markdown version of a page (index.md, served as text/markdown): CommonMark with GFM
// strikethrough, no front matter, no html. One paragraph per line (markdown readers wrap).
// Links stay relative to the page, like the html's, so they work from any sub-path.
import type { Block, Inline, ListItem, PageModel } from './page-model';

/** the page's other versions, next to it */
const HTML_HREF = './';
const TEXT_HREF = 'index.txt';

/** characters that mean something anywhere in a line of markdown (`&` only before an entity name) */
const INLINE_SPECIAL = /[\\`*_[\]<>~|]|&(?=#?\w+;)/g;
/** what would turn a line into something else at its start: a heading, a quote, a list item, a rule */
const LINE_START_SPECIAL = /^(?:[#>+=-]|\d+(?=[.)]))/;

function escape(text: string): string {
  return text.replace(INLINE_SPECIAL, (c) => `\\${c}`);
}

function escapeLineStart(line: string): string {
  const match = LINE_START_SPECIAL.exec(line);
  if (!match) return line;
  // a number is escaped by its dot or bracket, anything else by itself
  const at = /\d/.test(match[0]) ? match[0].length : 0;
  return `${line.slice(0, at)}\\${line.slice(at)}`;
}

// ---- inline content --------------------------------------------------------------------------

/** `*text*`, with white space at the edges moved outside the markers (`* x *` is not emphasis) */
function wrap(marker: string, inner: string): string {
  const trimmed = inner.trim();
  if (!trimmed) return inner;
  const before = inner.slice(0, inner.indexOf(trimmed));
  const after = inner.slice(before.length + trimmed.length);
  return `${before}${marker}${trimmed}${marker}${after}`;
}

function linkHref(href: string): string {
  return href.replace(/[ ()]/g, (c) => encodeURIComponent(c));
}

function inline(node: Inline): string {
  switch (node.kind) {
    case 'text':
      return escape(node.text);
    case 'emphasis':
      return wrap('*', inlines(node.children));
    case 'strong':
      return wrap('**', inlines(node.children));
    case 'deleted':
      return wrap('~~', inlines(node.children));
    case 'link':
      return `[${inlines(node.children).trim()}](${linkHref(node.href)})`;
    case 'break':
      return '\n';
  }
}

function inlines(content: Inline[]): string {
  return content.map(inline).join('');
}

/** inline content as lines: white space collapsed, each line made safe to start a block with */
function lines(content: Inline[]): string[] {
  return inlines(content)
    .split('\n')
    .map((line) => escapeLineStart(line.replace(/ {2,}/g, ' ').trim()))
    .filter(Boolean);
}

/** lines joined by hard breaks (a backslash at the end of a line), continuation lines indented */
function hardBreaks(parts: string[], indent: string): string {
  return parts.join(`\\\n${indent}`);
}

// ---- blocks ------------------------------------------------------------------------------------

function heading(level: number, content: Inline[]): string {
  return `${'#'.repeat(level)} ${lines(content).join(' ')}`;
}

function paragraph(content: Inline[]): string {
  return hardBreaks(lines(content), '');
}

function listItem(item: ListItem, marker: string): string {
  const indent = ' '.repeat(marker.length);
  const parts = [...(item.lead ? lines(item.lead) : []), ...lines(item.body)];
  return `${marker}${hardBreaks(parts, indent)}`;
}

function list(ordered: boolean, items: ListItem[]): string {
  return items.map((item, i) => listItem(item, ordered ? `${i + 1}. ` : '- ')).join('\n');
}

/** a fenced code block, its fence longer than any run of backticks inside */
function preformatted(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

function block(b: Block): string {
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
      return '---';
  }
}

/** a summary under the hero (which ends at the first rule): the page's meta description, quoted */
function withDescription(blocks: string[], page: PageModel): string[] {
  if (!page.description) return blocks;
  const at = page.blocks.findIndex((b) => b.kind === 'rule');
  const quote = `> ${escapeLineStart(escape(page.description))}`;
  return at < 0 ? [...blocks, quote] : [...blocks.slice(0, at), quote, ...blocks.slice(at)];
}

/** where to go next: the nav's pages and this page's other versions */
function footer(page: PageModel): string[] {
  const pages = page.nav.map((link) => `[${escape(link.text)}](${linkHref(link.href)})`).join(' · ');
  return ['---', `pages: ${pages}`, `this page as [html](${HTML_HREF}) or [plain text](${TEXT_HREF})`];
}

/** consecutive rules (around a skipped section) read as one */
function withoutRepeatedRules(blocks: Block[]): Block[] {
  return blocks.filter((b, i) => !(b.kind === 'rule' && (i === 0 || blocks[i - 1]?.kind === 'rule')));
}

export function toMarkdown(page: PageModel): string {
  const model = { ...page, blocks: withoutRepeatedRules(page.blocks) };
  const body = withDescription(model.blocks.map(block), model);
  return `${[...body, ...footer(model)].join('\n\n')}\n`;
}
