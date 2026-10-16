/**
 * Where the site under test lives and where it is served. Shared by playwright.config.ts and the specs.
 *
 *   WEB_DIR    the folder to serve (default apps/web/dist). Point it at another build, e.g. a
 *              deliberately broken copy, to check that the suite notices.
 *   WEB_PORT   the port to serve it on (default 4610), so several runs can go at once. Give each
 *              run its own --output folder too.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const WEB_DIR = resolve(APP_DIR, process.env['WEB_DIR'] ?? 'dist');
export const WEB_PORT = Number(process.env['WEB_PORT'] ?? 4610);
export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

/** a file:// URL for a file in the built site (e.g. PAGES.about.file) */
export function fileUrl(file: string): string {
  return pathToFileURL(resolve(WEB_DIR, file)).href;
}

export function isBuilt(): boolean {
  return existsSync(resolve(WEB_DIR, 'index.html'));
}

export const MISSING_BUILD = `the built site is missing (${WEB_DIR}/index.html). run \`pnpm -C apps/web build\` first.`;
