/**
 * The built markdown, plain-text and coloured-text versions (dist/**\/index.md, index.txt,
 * index.ansi; src/build) against their html page, as a visitor without JavaScript sees it in a
 * real browser. index.ansi is checked against index.txt: the same text plus colour (and art on top).
 *
 * Everything the html shows in <main> (each heading, paragraph and list item, by its rendered
 * text) must be in both versions. The only text left out on purpose, besides what the browser
 * itself does not show without JavaScript (the <noscript> styles hide the script-only parts):
 *   - aria-hidden decoration: the caret, the meters, the icons and portraits, the spinner;
 *   - links to their own section (`[ open lride ]`, until the products have URLs).
 * The markdown is rendered with a real CommonMark/GFM parser (marked) and read in the browser too.

 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { Lexer, marked } from 'marked';
import { plainVersions } from '../../src/build/plain-pages';
import { TERMINAL_ART, artFor } from '../../src/build/terminal-art';
import { test, expect } from '../support/fixtures';
import { WEB_DIR } from '../support/env';
import { PAGES, PAGE_NAMES } from '../support/expected';

/** the plain text is for an 80-column terminal (not imported from src/build: that would test the generator against itself) */
const WIDTH = 80;
/** an SGR escape (colour, bold, underline, reset) */
const SGR = /\x1b\[[0-9;]*m/g;
/** a line of terminal art once its escapes are gone: half blocks and spaces, at least one block */
const ART_LINE = /^ *[▀▄█][ ▀▄█]*$/;

test.use({ javaScriptEnabled: false });

const EMAIL = 'hello@shipmoth.com';

interface Outline {
  /** heading level as the markdown should have it: product cards are one level under "off the line" */
  level: number;
  text: string;
}

interface Shown {
  headings: Outline[];
  /** the rendered text of every visible heading, paragraph and list item */
  texts: string[];
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

/** runs in the page: hides the documented skips, then reads what is left */
function readShown(root: string): Shown {
  const skip = document.createElement('style');
  skip.textContent = '[aria-hidden="true"]{display:none!important}';
  document.head.append(skip);
  for (const a of document.querySelectorAll<HTMLAnchorElement>(`${root} a[href^="#"]`)) {
    if (a.closest(`[id="${a.getAttribute('href')?.slice(1)}"]`)) a.style.display = 'none';
  }
  const visible = (el: Element) => el.checkVisibility() && (el as HTMLElement).innerText.trim() !== '';
  const all = [...document.querySelectorAll(`${root} :is(h1, h2, h3, h4, h5, h6, p, li)`)].filter(visible);
  return {
    headings: all
      .filter((el) => /^H\d$/.test(el.tagName))
      .map((el) => ({ level: Number(el.tagName[1]) + (el.closest('section.prod') ? 1 : 0), text: (el as HTMLElement).innerText })),
    texts: all.map((el) => (el as HTMLElement).innerText),
  };
}

/** the markdown, rendered by marked and shown in the browser: its headings, links and text */
async function renderMarkdown(page: Page, markdown: string): Promise<{ headings: Outline[]; links: string[]; text: string }> {
  await page.setContent(marked.parse(markdown, { async: false }));
  return page.evaluate(() => ({
    headings: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => ({ level: Number(h.tagName[1]), text: (h as HTMLElement).innerText })),
    links: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
    text: document.body.innerText,
  }));
}

for (const name of PAGE_NAMES) {
  test.describe(`${name}`, () => {
    const folder = dirname(join(WEB_DIR, PAGES[name].file));
    const read = (file: string) => readFileSync(join(folder, file));

    test('the page links its markdown and plain-text versions, and the server sends them', async ({ site, page, request, baseURL }) => {
      void site; // (fails clearly when the site is not built)
      await page.goto(PAGES[name].url);
      const alternates = await page.locator('link[rel="alternate"]').evaluateAll((els) => els.map((el) => [el.getAttribute('type'), (el as HTMLLinkElement).href]));
      const here = `${baseURL}${PAGES[name].url}`;
      expect(alternates).toEqual([
        ['text/markdown', `${here}index.md`],
        ['text/plain', `${here}index.txt`],
      ]);
      for (const [type, href] of alternates) {
        const response = await request.get(href ?? '');
        expect(response.status(), href ?? '').toBe(200);
        expect(response.headers()['content-type']).toBe(`${type}; charset=utf-8`);
      }
    });

    test('both versions say everything the page shows', async ({ site, page }) => {
      void site; // (fails clearly when the site is not built)
      await page.goto(PAGES[name].url);
      const shown = await page.evaluate(readShown, 'main');
      expect(shown.texts.length).toBeGreaterThan(10);
      const markdown = await renderMarkdown(page, read('index.md').toString('utf8'));
      const text = flat(read('index.txt').toString('utf8'));
      for (const item of shown.texts) {
        expect(flat(markdown.text), `index.md has: ${item}`).toContain(flat(item));
        expect(text, `index.txt has: ${item}`).toContain(flat(item));
      }
    });

    test('the markdown has the html heading outline', async ({ site, page }) => {
      void site; // (fails clearly when the site is not built)
      await page.goto(PAGES[name].url);
      const { headings } = await page.evaluate(readShown, 'main');
      expect(headings[0]).toEqual({ level: 1, text: PAGES[name].h1 });
      const markdown = await renderMarkdown(page, read('index.md').toString('utf8'));
      expect(markdown.headings).toEqual(headings);
    });

    test('the markdown is markdown: no html, no entities, links that lead somewhere', async () => {
      const markdown = read('index.md').toString('utf8');
      const types: string[] = [];
      const hrefs: string[] = [];
      marked.walkTokens(Lexer.lex(markdown), (t) => {
        types.push(t.type);
        if (t.type === 'link') hrefs.push(t.href);
      });
      expect(types.filter((t) => t === 'html')).toEqual([]);
      expect(markdown).not.toMatch(/&(#\d+|#x[\da-f]+|[a-z]+);/i);
      expect(markdown.startsWith(`# ${PAGES[name].h1}\n\n${PAGES[name].line}\n\n`)).toBe(true);

      expect(hrefs.length).toBeGreaterThanOrEqual(5);
      for (const href of hrefs) {
        if (href.startsWith('mailto:')) {
          expect(href).toBe(`mailto:${EMAIL}`);
          continue;
        }
        // relative (so it works from a sub-path), and to a file the build made
        expect(href, href).not.toMatch(/^([a-z]+:|\/)/i);
        const target = resolve(folder, href);
        const file = existsSync(target) && statSync(target).isDirectory() ? join(target, 'index.html') : target;
        expect(existsSync(file), `${href} -> ${file}`).toBe(true);
      }
    });

    test(`the plain text fits ${WIDTH} columns and is plain UTF-8`, () => {
      const bytes = read('index.txt');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const lines = text.split('\n');
      expect(lines.pop(), 'ends with one newline').toBe('');
      expect(lines.at(-1), 'and only one').not.toBe('');
      for (const [i, line] of lines.entries()) {
        expect([...line].length, `line ${i + 1}: ${line}`).toBeLessThanOrEqual(WIDTH);
        // no ANSI escapes, carriage returns, tabs or other control characters
        expect(line, `line ${i + 1}`).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
        expect(line, `line ${i + 1}`).toBe(line.trimEnd());
      }
      expect(text).not.toMatch(/<\/?[a-z][\w-]*[\s/>]/i);
      expect(text).not.toMatch(/&(#\d+|#x[\da-f]+|[a-z]+);/i);
      // headings like the site's, the same as the markdown's
      const headings = (s: string) => s.split('\n').filter((l) => /^#{1,6} /.test(l));
      expect(headings(text)).toEqual(headings(read('index.md').toString('utf8')));
    });

    test('all three are exactly what the generator makes of the built html', () => {
      // (so they are a pure function of the page: no dates, no randomness, no stale copy)
      const { md, txt, ansi } = plainVersions(read('index.html').toString('utf8'), artFor(PAGES[name].file));
      expect(read('index.md').equals(Buffer.from(md, 'utf8'))).toBe(true);
      expect(read('index.txt').equals(Buffer.from(txt, 'utf8'))).toBe(true);
      expect(read('index.ansi').equals(Buffer.from(ansi, 'utf8'))).toBe(true);
    });

    test('the coloured text is the plain text plus colour, with art inserted on top and before the links', () => {
      const ansi = new TextDecoder('utf-8', { fatal: true }).decode(read('index.ansi'));
      const txt = read('index.txt').toString('utf8');
      expect(ansi).toContain('\x1b[');
      expect(ansi.replace(SGR, ''), 'only SGR escapes').not.toContain('\x1b');

      // stripped, every line is either a line of index.txt or art (half blocks and spaces)
      const lines = ansi.replace(SGR, '').split('\n');
      const isArt = (line: string | undefined) => line !== undefined && ART_LINE.test(line);
      /** the art blocks: [first line, rows] */
      const blocks: [number, number][] = [];
      for (const [i, line] of lines.entries()) {
        if (!isArt(line)) continue;
        const last = blocks.at(-1);
        if (last && last[0] + last[1] === i) last[1]++;
        else blocks.push([i, 1]);
      }
      // each block is followed by one empty line; take the blocks and those lines out: index.txt
      for (const [start, rows] of blocks) expect(lines[start + rows], `an empty line under the art at line ${start + 1}`).toBe('');
      const text = lines.filter((line, i) => !isArt(line) && !(line === '' && isArt(lines[i - 1])));
      expect(text.join('\n'), 'without the art, exactly index.txt').toBe(txt);

      // where: one block on top; on the home page one more just before the closing links' rule
      const linksRule = lines.lastIndexOf('-'.repeat(WIDTH));
      expect(lines[linksRule + 2]).toBe('links, relative to this page:');
      const expected: [number, number][] = [];
      if (TERMINAL_ART) {
        expected.push([0, blocks[0]?.[1] ?? -1]);
        if (name === 'index') expected.push([linksRule - 1 - (blocks[1]?.[1] ?? -1), blocks[1]?.[1] ?? -1]);
      }
      expect(blocks, 'art blocks [first line, rows]').toEqual(expected);
      if (TERMINAL_ART) {
        expect(blocks[0]?.[1], 'wordmark rows').toBeGreaterThanOrEqual(5);
        if (name === 'index') expect(blocks[1]?.[1], 'moth rows').toBeGreaterThanOrEqual(8);
      }

      const raw = ansi.split('\n');
      expect(raw.pop()).toBe('');
      for (const [i, line] of raw.entries()) {
        const visible = line.replace(SGR, '');
        expect([...visible].length, `line ${i + 1}`).toBeLessThanOrEqual(WIDTH);
        if (line.includes('\x1b')) expect(line.endsWith('\x1b[0m'), `line ${i + 1} resets: ${JSON.stringify(line)}`).toBe(true);
        expect(visible, `line ${i + 1}`).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
        // the text (not the art) in 256 colours only: reset, bold, underline, 38;5;n
        if (!isArt(visible)) {
          for (const [, params] of line.matchAll(/\x1b\[([0-9;]*)m/g)) expect(params, `line ${i + 1}`).toMatch(/^(?:(?:0|1|4|38;5;\d{1,3})(?:;|$))+$/);
        }
      }
    });
  });
}
