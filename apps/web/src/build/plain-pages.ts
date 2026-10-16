// Writes index.md and index.txt next to every built index.html, from that html (read-page.ts),
// so the markdown and plain-text versions always say what the page says. A server can then
// pick one by the request's Accept header: GET /about/ is about/index.html, .md or .txt.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { toMarkdown } from './markdown';
import { toPlainText } from './plain-text';
import { readPage } from './read-page';

/** every page of a built site: dist/index.html, dist/about/index.html, … (paths relative to it) */
export async function builtPages(dir: string): Promise<string[]> {
  const files = await readdir(dir, { recursive: true });
  return files
    .filter((file) => basename(file) === 'index.html')
    .map((file) => file.split(sep).join('/'))
    .sort();
}

/** the two versions of one page's html */
export function plainVersions(html: string): { md: string; txt: string } {
  const page = readPage(html);
  return { md: toMarkdown(page), txt: toPlainText(page) };
}

export function plainPages(): AstroIntegration {
  return {
    name: 'shipmoth:plain-pages',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        for (const file of await builtPages(root)) {
          const html = join(root, file);
          const { md, txt } = plainVersions(await readFile(html, 'utf8'));
          await writeFile(html.replace(/\.html$/, '.md'), md, 'utf8');
          await writeFile(html.replace(/\.html$/, '.txt'), txt, 'utf8');
          logger.info(`${file.replace(/\.html$/, '')}.{md,txt}`);
        }
      },
    },
  };
}
