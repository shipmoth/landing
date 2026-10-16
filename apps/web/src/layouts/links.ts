// Links between the pages. The build writes each page as an index file in its own folder
// (dist/index.html, dist/about/index.html: clean URLs, `/` and `/about/`), and every link stays
// relative, so the site works from any host and from a sub-path (`example.com/shipmoth/`).

export type Page = 'home' | 'about';

/** each page's folder, relative to the site root */
const FOLDER: Record<Page, string> = { home: '', about: 'about/' };
/** the way from each page's folder back up to the site root */
const UP: Record<Page, string> = { home: '', about: '../' };

/** the href of page `to` as written on page `from`: `./`, `about/`, `../` */
export function pageHref(from: Page, to: Page): string {
  return from === to ? './' : UP[from] + FOLDER[to] || './';
}

/** the href of a file at the site root (e.g. the favicon) as written on `page` */
export function rootHref(page: Page, file: string): string {
  return UP[page] + file;
}
