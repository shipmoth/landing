/**
 * Content negotiation: which representation each kind of request gets, for every page, with the
 * headers that go with it. The rules (docker/nginx/default.conf):
 *   1. Accept naming text/markdown, text/plain or text/html picks it; with several, the first of
 *      md, txt, html (in that order) wins, whatever the q-values.
 *   2. Otherwise (no Accept, any type, any text type, application/json, ...) terminal clients (curl, wget,
 *      HTTPie) get txt and everyone else html. Never a 406.
 *   3. A page without the chosen file falls back to its index.html.
 */
import { test, expect } from '@playwright/test';
import {
  BROWSER_ACCEPT, BROWSER_UA, CONTENT_TYPES, CURL_UA, PAGES, expectNegotiatedVary, fileBody, formatOf, raw,
  requireStack, type Format, type RawResponse,
} from './support';
import { HTML_ONLY_PATH } from './env';

requireStack();

interface Case {
  name: string;
  /** exactly the request headers sent (no Accept unless listed) */
  headers: Record<string, string>;
  expected: Format;
}

const CASES: Case[] = [
  // fallback by User-Agent: no Accept, or one that names none of our formats
  { name: 'no Accept, browser User-Agent', headers: { 'User-Agent': BROWSER_UA }, expected: 'html' },
  { name: 'no Accept, no User-Agent', headers: {}, expected: 'html' },
  { name: 'curl defaults (Accept */*, curl UA)', headers: { 'User-Agent': CURL_UA, Accept: '*/*' }, expected: 'txt' },
  { name: 'curl UA without Accept', headers: { 'User-Agent': CURL_UA }, expected: 'txt' },
  { name: 'GNU wget defaults', headers: { 'User-Agent': 'Wget/1.21.4', Accept: '*/*' }, expected: 'txt' },
  { name: 'busybox wget', headers: { 'User-Agent': 'Wget' }, expected: 'txt' },
  { name: 'HTTPie defaults', headers: { 'User-Agent': 'HTTPie/3.2.4', Accept: '*/*' }, expected: 'txt' },
  { name: 'a UA merely containing "curl"', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; notcurl/1.0)', Accept: '*/*' }, expected: 'html' },
  { name: 'browser Accept header', headers: { 'User-Agent': BROWSER_UA, Accept: BROWSER_ACCEPT }, expected: 'html' },
  { name: 'unknown type application/json (browser UA): html, not 406', headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' }, expected: 'html' },
  { name: 'unknown type application/json (curl UA)', headers: { 'User-Agent': CURL_UA, Accept: 'application/json' }, expected: 'txt' },
  { name: 'text/* (browser UA)', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/*' }, expected: 'html' },
  // explicit Accept wins over the User-Agent
  { name: 'Accept text/markdown (browser UA)', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/markdown' }, expected: 'md' },
  { name: 'Accept text/markdown (curl UA)', headers: { 'User-Agent': CURL_UA, Accept: 'text/markdown' }, expected: 'md' },
  { name: 'Accept text/plain (browser UA)', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/plain' }, expected: 'txt' },
  { name: 'Accept text/html (curl UA)', headers: { 'User-Agent': CURL_UA, Accept: 'text/html' }, expected: 'html' },
  { name: 'browser Accept header with a curl UA', headers: { 'User-Agent': CURL_UA, Accept: BROWSER_ACCEPT }, expected: 'html' },
  { name: 'media types are case-insensitive', headers: { 'User-Agent': BROWSER_UA, Accept: 'Text/Markdown' }, expected: 'md' },
  { name: 'with parameters', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/markdown; charset=utf-8; variant=GFM' }, expected: 'md' },
  // several of ours: the map's order (md, txt, html), q-values ignored
  { name: 'markdown before html', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/markdown, text/html;q=0.9' }, expected: 'md' },
  { name: 'html before markdown: markdown still wins (map order)', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html, text/markdown' }, expected: 'md' },
  { name: 'q-values are ignored', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html;q=1, text/markdown;q=0.1' }, expected: 'md' },
  { name: 'plain and html: plain', headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html, text/plain' }, expected: 'txt' },
  { name: 'plain and markdown: markdown', headers: { 'User-Agent': CURL_UA, Accept: 'text/plain, text/markdown' }, expected: 'md' },
];

/** what every negotiated 200 must look like */
async function expectRepresentation(response: RawResponse, expected: Format, file: string | undefined): Promise<void> {
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toBe(CONTENT_TYPES[expected]);
  expectNegotiatedVary(response);
  expect(response.headers['cache-control']).toBe('no-cache');
  expect(response.headers['etag']).toMatch(/^(W\/)?"[^"]+"$/);
  expect(response.headers['last-modified']).toBeTruthy();
  expect(response.headers['content-encoding']).toBeUndefined();
  expect(formatOf(response.text), `body should be ${expected}:\n${response.text.slice(0, 200)}`).toBe(expected);
  if (file) expect(response.text).toBe(await fileBody(file));
}

for (const page of PAGES) {
  test.describe(`${page.name} page ${page.path}`, () => {
    for (const c of CASES) {
      test(`${c.name} -> ${c.expected}`, async () => {
        const response = await raw(page.path, c.headers);
        await expectRepresentation(response, c.expected, page.files[c.expected]);
      });
    }

    for (const [accept, expected] of [['text/markdown', 'md'], ['text/plain', 'txt'], ['text/html', 'html']] as const) {
      test(`HEAD with Accept ${accept}`, async () => {
        const get = await raw(page.path, { Accept: accept });
        const head = await raw(page.path, { Accept: accept }, 'HEAD');
        expect(head.status).toBe(200);
        expect(head.body.length).toBe(0);
        expect(head.headers['content-type']).toBe(CONTENT_TYPES[expected]);
        expect(head.headers['content-length']).toBe(String(get.body.length));
        expect(head.headers['etag']).toBe(get.headers['etag']);
        expect(head.headers['cache-control']).toBe('no-cache');
        expectNegotiatedVary(head);
      });
    }

    test('the query string does not change the negotiation', async () => {
      const response = await raw(`${page.path}?utm_source=test`, { Accept: 'text/markdown' });
      await expectRepresentation(response, 'md', page.files.md);
    });
  });
}

test.describe('a page that only has index.html', () => {
  for (const headers of [{ Accept: 'text/markdown' }, { Accept: 'text/plain' }, { 'User-Agent': CURL_UA }, { 'User-Agent': BROWSER_UA }]) {
    test(`falls back to html for ${JSON.stringify(headers)}`, async () => {
      const response = await raw(HTML_ONLY_PATH, headers);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe(CONTENT_TYPES.html);
      expectNegotiatedVary(response);
      expect(response.text).toContain('NGINX-TEST-HTML-ONLY');
    });
  }
});
