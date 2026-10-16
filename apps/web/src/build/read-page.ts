// Reads a built page (dist/**/index.html) into a PageModel: what a visitor without JavaScript
// reads in <main>, plus the title, the description and the header. The markdown and plain-text
// versions are rendered from that, so their copy can never drift from the html. It also notes the
// colours the html gives (tone, from styles/global.css's classes and accents) for the coloured
// text version; the copy does not depend on them.
//
// Every element kind in <main> has a rule here. One without a rule fails the build (with its name),
// so new markup is either given a rule or listed as skipped, never silently dropped.
import { DomUtils, parseDocument } from 'htmlparser2';
import { plainText, type Block, type HeadingLevel, type Inline, type ListItem, type NavLink, type PageModel, type Tone, type ToneRun } from './page-model';

type Document = ReturnType<typeof parseDocument>;
type Node = Document['children'][number];
type Element = Extract<Node, { attribs: Record<string, string> }>;

interface Skip {
  why: string;
  matches(el: Element): boolean;
}

/**
 * What is not content. Besides the plain rules (hidden, aria-hidden, not text), this mirrors the
 * <noscript> styles in layouts/Base.astro: what only the page's script fills in or makes work.
 */
const SKIPS: Skip[] = [
  { why: 'hidden from everyone', matches: (el) => 'hidden' in el.attribs },
  { why: 'decoration that screen readers skip too', matches: (el) => el.attribs['aria-hidden'] === 'true' },
  { why: 'not text: scripts, styles, canvases, the signup form, [ copy ]', matches: (el) => NOT_TEXT.has(el.name) },
  { why: 'drawn by the script: the hero moth, the idea line and its caption', matches: (el) => drawnByScript(el) },
  { why: 'the invitation to sign up (the form is skipped), and its reply line', matches: (el) => signup(el) },
];

const NOT_TEXT = new Set(['script', 'style', 'template', 'canvas', 'form', 'button', 'input', 'label', 'select', 'textarea']);
/** the address in the contact line, which becomes a mailto link (components/MailCopy.astro) */
const MAIL_ID = 'mail';
/** product cards follow "off the line" as its subsections: their h2 reads as a level deeper */
const SUBSECTION_CLASS = 'prod';
/** the drawing that goes with a "what we go after" goal (components/GoalTile.astro) */
const ICON_CLASS = 'ico';
const CONTAINERS = new Set(['section', 'div', 'footer', 'header', 'article', 'aside', 'main', 'noscript']);
const HEADINGS: Record<string, HeadingLevel> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
/** inline elements that only carry styling, read as their text */
const PLAIN_INLINE = new Set(['span', 'noscript', 'small', 'abbr', 'time', 'code', 'kbd', 'samp']);
/** css white space (not \s, which would also take no-break spaces) */
const WHITE_SPACE = /[ \t\n\r\f]+/g;

function hasClass(el: Element, name: string): boolean {
  return (el.attribs['class'] ?? '').split(WHITE_SPACE).includes(name);
}

// ---- colours ---------------------------------------------------------------------------------
// The rules of styles/global.css that colour text, as tones: `.dim` and `i.d` (--dim), the colour
// classes (`i.y`, `b.r`, ...), `.loop` (dim), and `.lede` and `.tag`, which take their box's accent (`--c`).

const TONE_CLASSES = new Map<string, Tone>([['y', 'y'], ['v', 'v'], ['p', 'p'], ['t', 't'], ['r', 'r'], ['g', 'g'], ['w', 'w'], ['d', 'dim'], ['dim', 'dim'], ['loop', 'dim']]);
const ACCENT_CLASSES = new Set(['lede', 'tag']);
/** `style="--c:var(--y)"` (content/colours.ts, accent()) */
const ACCENT_STYLE = /(?:^|;)\s*--c\s*:\s*var\(--([a-z]+)\)/;

/** the accent a box hands its contents, if it sets one */
function accentOf(el: Element): Tone | undefined {
  const name = ACCENT_STYLE.exec(el.attribs['style'] ?? '')?.[1];
  return name ? TONE_CLASSES.get(name) : undefined;
}

/** the colour an element's own class gives its text (`accent`: the colour of the box it is in) */
function toneOf(el: Element, accent: Tone | undefined): Tone | undefined {
  const classes = (el.attribs['class'] ?? '').split(WHITE_SPACE);
  if (accent && classes.some((name) => ACCENT_CLASSES.has(name))) return accent;
  for (const name of classes) {
    const tone = TONE_CLASSES.get(name);
    if (tone) return tone;
  }
  return undefined;
}

function withTone<T extends object>(value: T, tone: Tone | undefined): T & { tone?: Tone } {
  return tone ? { ...value, tone } : value;
}

function drawnByScript(el: Element): boolean {
  return el.attribs['id'] === 'orbit' || el.attribs['id'] === 'belt' || hasClass(el, 'belt-cap');
}

/** `#contact > p:last-of-type` (components/Contact.astro) and `#out` */
function signup(el: Element): boolean {
  if (el.attribs['id'] === 'out') return true;
  const parent = el.parent;
  if (el.name !== 'p' || !parent || !DomUtils.isTag(parent) || parent.attribs['id'] !== 'contact') return false;
  return parent.children.filter((c) => DomUtils.isTag(c) && c.name === 'p').at(-1) === el;
}

function skipped(el: Element): boolean {
  return SKIPS.some((s) => s.matches(el));
}

/** a link to the section it sits in (the `[ open lride ]` placeholders until products have URLs) */
function selfLink(el: Element): boolean {
  const href = el.attribs['href'] ?? '';
  if (!href.startsWith('#')) return false;
  for (let p = el.parent; p && DomUtils.isTag(p); p = p.parent) if (p.attribs['id'] === href.slice(1)) return true;
  return false;
}

function isBlank(node: Node): boolean {
  return DomUtils.isText(node) ? !node.data.replace(WHITE_SPACE, '') : DomUtils.isComment(node);
}

function unknown(el: Element, where: string): never {
  throw new Error(`plain pages: no rule for <${el.name}> ${where} (add one in src/build/read-page.ts)`);
}

// ---- inline content --------------------------------------------------------------------------

function inlines(nodes: Node[]): Inline[] {
  return nodes.flatMap(inline);
}

function inline(node: Node): Inline[] {
  if (DomUtils.isText(node)) return [{ kind: 'text', text: node.data.replace(WHITE_SPACE, ' ') }];
  if (!DomUtils.isTag(node) || skipped(node)) return [];
  if (node.name === 'i' || node.name === 'em') return [withTone({ kind: 'emphasis', children: inlines(node.children) }, toneOf(node, undefined))];
  if (node.name === 'b' || node.name === 'strong') return strong(node);
  if (node.name === 's' || node.name === 'del') return [withTone({ kind: 'deleted', children: inlines(node.children) }, toneOf(node, undefined))];
  if (node.name === 'a') return link(node);
  if (node.name === 'br') return [{ kind: 'break' }];
  if (PLAIN_INLINE.has(node.name)) return inlines(node.children);
  return unknown(node, 'inside text');
}

function strong(el: Element): Inline[] {
  const children = inlines(el.children);
  if (el.attribs['id'] !== MAIL_ID) return [withTone({ kind: 'strong', children }, toneOf(el, undefined))];
  return [{ kind: 'link', href: `mailto:${DomUtils.textContent(el).trim()}`, children }];
}

function link(el: Element): Inline[] {
  if (selfLink(el)) return [];
  return [{ kind: 'link', href: el.attribs['href'] ?? '', children: inlines(el.children) }];
}

/** does this inline content say anything (more than white space)? */
function hasText(content: Inline[]): boolean {
  return content.some((i) => (i.kind === 'text' ? i.text.trim() !== '' : i.kind !== 'break' && hasText(i.children)));
}

// ---- blocks ------------------------------------------------------------------------------------

/** `accent`: the colour of the box these blocks are in (a product card's, a crew card's) */
function blocks(nodes: Node[], shift: number, accent: Tone | undefined): Block[] {
  return nodes.flatMap((node) => block(node, shift, accent));
}

function block(node: Node, shift: number, accent: Tone | undefined): Block[] {
  if (isBlank(node)) return [];
  if (!DomUtils.isTag(node)) throw new Error(`plain pages: loose text between blocks: ${JSON.stringify(DomUtils.textContent(node))}`);
  if (skipped(node)) return [];
  const level = HEADINGS[node.name];
  if (level) return heading(node, level, shift, accent);
  if (node.name === 'p') return paragraph(node, accent);
  if (node.name === 'ul' || node.name === 'ol') return list(node, shift, accent);
  if (node.name === 'pre') return preformatted(node, accent);
  if (node.name === 'hr') return [{ kind: 'rule' }];
  if (CONTAINERS.has(node.name)) return blocks(node.children, shift + (hasClass(node, SUBSECTION_CLASS) ? 1 : 0), accentOf(node) ?? accent);
  return unknown(node, 'between blocks');
}

/** a heading in a coloured box (a product's name, a crew member's) takes the box's colour */
function heading(el: Element, level: HeadingLevel, shift: number, accent: Tone | undefined): Block[] {
  const content = inlines(el.children);
  if (!hasText(content)) return [];
  return [withTone({ kind: 'heading', level: Math.min(6, level + shift) as HeadingLevel, content }, toneOf(el, accent) ?? accent)];
}

function paragraph(el: Element, accent: Tone | undefined): Block[] {
  const content = inlines(el.children);
  return hasText(content) ? [withTone({ kind: 'paragraph', content }, toneOf(el, accent))] : [];
}

/** the text of an element as shown in a <pre>, cut where its colour changes */
function toneRuns(el: Element, tone: Tone | undefined): ToneRun[] {
  return el.children.flatMap((child): ToneRun[] => {
    if (DomUtils.isText(child)) return [withTone({ text: child.data }, tone)];
    if (!DomUtils.isTag(child)) return [];
    return toneRuns(child, toneOf(child, undefined) ?? tone);
  });
}

/** the runs from character `start` (inclusive) to `end` (exclusive) of their joined text */
function sliceRuns(runs: ToneRun[], start: number, end: number): ToneRun[] {
  const out: ToneRun[] = [];
  let at = 0;
  for (const run of runs) {
    const text = run.text.slice(Math.max(0, start - at), Math.max(0, end - at));
    at += run.text.length;
    if (text) out.push({ ...run, text });
  }
  return out;
}

function preformatted(el: Element, accent: Tone | undefined): Block[] {
  const shown = DomUtils.textContent(el);
  const text = shown.replace(/^\n/, '').trimEnd();
  if (!text.trim()) return [];
  const start = shown.startsWith('\n') ? 1 : 0;
  const runs = sliceRuns(toneRuns(el, toneOf(el, accent)), start, start + text.length);
  // (textContent and the walk above see the same text nodes; this only guards against a change)
  if (runs.map((r) => r.text).join('') !== text) throw new Error('plain pages: the colours of a <pre> do not line up with its text');
  return [{ kind: 'preformatted', text, runs }];
}

/** a list of cards (items with their own heading, like the crew) reads as sections, not as a list */
function list(el: Element, shift: number, accent: Tone | undefined): Block[] {
  const lis = el.children.filter((c): c is Element => DomUtils.isTag(c) && !skipped(c));
  for (const li of lis) if (li.name !== 'li') unknown(li, `inside <${el.name}>`);
  if (lis.some((li) => li.children.some((c) => DomUtils.isTag(c) && c.name in HEADINGS))) {
    return lis.flatMap((li) => blocks(li.children, shift, accentOf(li) ?? accent));
  }
  const items = lis.map(listItem).filter((item) => hasText(item.body) || (item.lead && hasText(item.lead)));
  return items.length ? [{ kind: 'list', ordered: el.name === 'ol', items }] : [];
}

/**
 * An item's first element is its lead when nothing but white space comes before it and something
 * follows (`<b>find a friction</b><span>…</span>`, `<span>before</span><s>…</s>`).
 */
function listItem(li: Element): ListItem {
  const icon = li.children.find((c): c is Element => DomUtils.isTag(c) && c.name === 'pre' && hasClass(c, ICON_CLASS));
  const shown = li.children.filter((c) => !isBlank(c) && !(DomUtils.isTag(c) && skipped(c)));
  const [first, ...rest] = shown;
  const item: ListItem =
    first && rest.length && DomUtils.isTag(first) && ['b', 'strong', 'span'].includes(first.name)
      ? { lead: inline(first), body: inlines(li.children.slice(li.children.indexOf(first) + 1)) }
      : { body: inlines(li.children) };
  if (icon) item.icon = DomUtils.textContent(icon);
  const tone = accentOf(li);
  if (tone) item.tone = tone;
  return item;
}

// ---- the page ------------------------------------------------------------------------------------

function only(doc: Document, name: string): Element {
  const found = DomUtils.getElementsByTagName(name, doc, true);
  const [el] = found;
  if (!el || found.length > 1) throw new Error(`plain pages: expected one <${name}>, found ${found.length}`);
  return el;
}

function meta(doc: Document, name: string): string {
  const el = DomUtils.findOne((e) => e.name === 'meta' && e.attribs['name'] === name, doc.children);
  return el?.attribs['content'] ?? '';
}

function text(el: Element): string {
  return DomUtils.textContent(el).replace(WHITE_SPACE, ' ').trim();
}

function nav(header: Element): NavLink[] {
  return DomUtils.getElementsByTagName('a', header).map((a) => ({
    text: text(a),
    href: a.attribs['href'] ?? '',
    current: a.attribs['aria-current'] === 'page',
  }));
}

/** the header's text outside the nav, without its decoration (the spinner) */
function strapline(header: Element): string {
  const parts = header.children.filter((c): c is Element => DomUtils.isTag(c) && c.name !== 'nav');
  return parts.map((el) => plainText(inlines(el.children))).join(' ').replace(WHITE_SPACE, ' ').trim();
}

export function readPage(html: string): PageModel {
  const doc = parseDocument(html);
  const header = only(doc, 'header');
  return {
    title: text(only(doc, 'title')),
    description: meta(doc, 'description'),
    strapline: strapline(header),
    nav: nav(header),
    blocks: blocks(only(doc, 'main').children, 0, undefined),
  };
}
