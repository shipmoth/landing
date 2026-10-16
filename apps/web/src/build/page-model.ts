// What a built page says, without its markup: the shared input of the markdown and plain-text
// versions (src/build/markdown.ts, src/build/plain-text.ts). read-page.ts builds it from the html.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'emphasis' | 'strong' | 'deleted'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'break' };

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface ListItem {
  /** a label set flush against the item's text: a step's name, a goal's name, "before" / "after" */
  lead?: Inline[];
  body: Inline[];
  /** a small decorative drawing that goes with the item (the "what we go after" icons) */
  icon?: string;
}

export type Block =
  | { kind: 'heading'; level: HeadingLevel; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'preformatted'; text: string }
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
