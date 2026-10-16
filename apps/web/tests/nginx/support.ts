/**
 * Helpers for tests/nginx: the pages and their representations, a raw HTTP client for requests
 * Playwright's API cannot make (it always sends Accept and Accept-Encoding), and the real curl.
 */
import { execFile, spawnSync } from 'node:child_process';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { test, expect, type APIResponse } from '@playwright/test';
import { BASE_URL, COMPOSE_ARGS, COMPOSE_ENV, EXTERNAL_BASE_URL, REPO_ROOT, SKIP_ENV } from './env';

export { BASE_URL };

/** Call at the top of every spec: skips the file when the global setup could not start the stack. */
export function requireStack(): void {
  const reason = process.env[SKIP_ENV];
  test.skip(!!reason, reason);
}

/** For specs that inspect the container itself. */
export function requireCompose(): void {
  requireStack();
  test.skip(!!EXTERNAL_BASE_URL, 'NGINX_BASE_URL is set: there is no compose stack to inspect');
}

export type Format = 'html' | 'md' | 'txt' | 'ansi';

export const CONTENT_TYPES: Record<Format, string> = {
  html: 'text/html; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  // (text/plain, so curl prints it and a browser shows it)
  ansi: 'text/plain; charset=utf-8',
};

export interface Page {
  name: string;
  path: string;
  /** the files behind it, by format, when they can be requested by name (/index.html redirects to /) */
  files: Partial<Record<Format, string>>;
}

export const PAGES: Page[] = [
  { name: 'home', path: '/', files: { md: '/index.md', txt: '/index.txt', ansi: '/index.ansi' } },
  { name: 'about', path: '/about/', files: { html: '/about/index.html', md: '/about/index.md', txt: '/about/index.txt', ansi: '/about/index.ansi' } },
];

export const ESC = '\x1b';
/** an SGR escape (colours, bold, underline, reset) */
export const SGR = /\x1b\[[0-9;]*m/g;

/** a line of terminal art once its escapes are gone: half blocks and spaces */
const ART_LINE = /^ *[▀▄█][ ▀▄█]*$/;

/** the coloured text as plain text: escapes gone, the art lines and the empty line under each block taken out */
export function withoutColour(ansi: string): string {
  const lines = ansi.replace(SGR, '').split('\n');
  const isArt = (line: string | undefined) => line !== undefined && ART_LINE.test(line);
  return lines.filter((line, i) => !isArt(line) && !(line === '' && isArt(lines[i - 1]))).join('\n');
}

/**
 * What a body is, by its shape: html has a doctype, markdown starts with a heading, coloured text
 * has escapes (SGR only), plain text is none of these.
 */
export function formatOf(body: string): Format | 'unknown' {
  if (/^\s*<!doctype html>/i.test(body)) return 'html';
  if (body.startsWith('# ')) return 'md';
  // (before the markup check: the ascii art on top of the coloured text may well contain "<a")
  if (body.includes(ESC)) return body.replace(SGR, '').includes(ESC) ? 'unknown' : 'ansi';
  if (/<[a-z!/]/i.test(body)) return 'unknown';
  return 'txt';
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
export const CURL_UA = 'curl/8.7.1';

/** all values of a header (they may be repeated, e.g. Vary from gzip_vary and from add_header) */
export function headerValues(response: APIResponse | RawResponse, name: string): string[] {
  const list = typeof response.headersArray === 'function' ? response.headersArray() : response.headersArray;
  return list.filter((h) => h.name.toLowerCase() === name.toLowerCase()).map((h) => h.value);
}

/** the Vary tokens, lower-cased, from every Vary header */
export function varyOf(response: APIResponse | RawResponse): string[] {
  return headerValues(response, 'vary').flatMap((v) => v.split(',')).map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export function expectNegotiatedVary(response: APIResponse | RawResponse): void {
  expect(varyOf(response)).toEqual(expect.arrayContaining(['accept', 'user-agent']));
}

export function expectNoNegotiationVary(response: APIResponse | RawResponse): void {
  const vary = varyOf(response);
  expect(vary).not.toContain('accept');
  expect(vary).not.toContain('user-agent');
}

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  headersArray: { name: string; value: string }[];
  body: Buffer;
  text: string;
}

/**
 * One request with exactly these headers (Node adds only Host and Connection), and the body as
 * received (not decompressed).
 */
export function raw(path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<RawResponse> {
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest(new URL(path, BASE_URL), { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        const headersArray: { name: string; value: string }[] = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          headersArray.push({ name: res.rawHeaders[i] ?? '', value: res.rawHeaders[i + 1] ?? '' });
        }
        resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, headersArray, body, text: body.toString('utf8') });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

export function gunzip(body: Buffer): string {
  return gunzipSync(body).toString('utf8');
}

/** the body of a file fetched by name, uncompressed */
export async function fileBody(path: string): Promise<string> {
  const response = await raw(path, { 'User-Agent': BROWSER_UA });
  expect(response.status, `${path} should exist`).toBe(200);
  return response.text;
}

export const CURL_AVAILABLE = spawnSync('curl', ['--version'], { encoding: 'utf8' }).status === 0;

/** Runs the real curl binary (its own User-Agent and Accept) and returns stdout. */
export function curl(args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile('curl', ['--silent', '--show-error', ...args], { encoding: 'utf8', timeout: 15_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`curl ${args.join(' ')} failed: ${stderr || error.message}`));
      else resolvePromise(stdout);
    });
  });
}

/** Runs `docker compose <args>` against the stack under test. */
export function compose(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('docker', [...COMPOSE_ARGS, ...args], { cwd: REPO_ROOT, env: COMPOSE_ENV, encoding: 'utf8', timeout: 60_000 });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
