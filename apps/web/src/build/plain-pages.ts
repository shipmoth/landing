// Writes index.md, index.txt and index.ansi next to every built index.html, from that html
// (read-page.ts), so the markdown, plain-text and coloured-text versions always say what the page
// says. A server can then pick one by the request's Accept header and User-Agent: GET /about/ is
// about/index.html, .md, .txt or .ansi.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { toAnsiText, type PageArt } from './ansi-text';
import { toMarkdown } from './markdown';
import { toPlainText } from './plain-text';
import { readPage } from './read-page';
import { artFor } from './terminal-art';

/** every page of a built site: dist/index.html, dist/about/index.html, … (paths relative to it) */
export async function builtPages(dir: string): Promise<string[]> {
  const files = await readdir(dir, { recursive: true });
  return files
    .filter((file) => basename(file) === 'index.html')
    .map((file) => file.split(sep).join('/'))
    .sort();
}

/** the text versions of one page's html; `art`: the coloured one's art (terminal-art.ts) */
export function plainVersions(html: string, art: PageArt = {}): { md: string; txt: string; ansi: string } {
  const page = readPage(html);
  return { md: toMarkdown(page), txt: toPlainText(page), ansi: toAnsiText(page, art) };
}

export function plainPages(): AstroIntegration {
  return {
    name: 'shipmoth:plain-pages',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        for (const file of await builtPages(root)) {
          const html = join(root, file);
          const { md, txt, ansi } = plainVersions(await readFile(html, 'utf8'), artFor(file));
          await writeFile(html.replace(/\.html$/, '.md'), md, 'utf8');
          await writeFile(html.replace(/\.html$/, '.txt'), txt, 'utf8');
          await writeFile(html.replace(/\.html$/, '.ansi'), ansi, 'utf8');
          logger.info(`${file.replace(/\.html$/, '')}.{md,txt,ansi}`);
        }
      },
    },
  };
}
