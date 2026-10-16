/**
 * Everything but the negotiation itself: files requested by name, types and charsets, caching and
 * revalidation, compression, 404s and the hardening headers.
 */
import { test, expect } from '@playwright/test';
import {
  BROWSER_UA, CONTENT_TYPES, CURL_UA, PAGES, expectNegotiatedVary, expectNoNegotiationVary, formatOf, gunzip, raw,
  requireStack, varyOf, type Format,
} from './support';

requireStack();

test.describe('files requested by name', () => {
  const files = PAGES.flatMap((page) => Object.entries(page.files) as [Format, string][]);
  for (const [format, path] of files) {
    for (const accept of ['text/html', 'text/markdown', 'text/plain', '*/*']) {
      test(`${path} is ${format} whatever the Accept (${accept})`, async () => {
        const response = await raw(path, { Accept: accept, 'User-Agent': CURL_UA });
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(CONTENT_TYPES[format]);
        expect(formatOf(response.text)).toBe(format);
        expect(response.headers['cache-control']).toBe('no-cache');
        expect(response.headers['etag']).toBeTruthy();
        // one URL, one representation: no Vary on Accept / User-Agent
        expectNoNegotiationVary(response);
      });
    }
  }
});

test.describe('favicon.svg', () => {
  test('is an svg with a day of caching and no negotiation', async ({ request }) => {
    const response = await request.get('/favicon.svg', { headers: { Accept: 'text/markdown' } });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/svg+xml');
    expect(response.headers()['cache-control']).toBe('public, max-age=86400');
    expect(response.headers()['etag']).toBeTruthy();
    expectNoNegotiationVary(response);
    expect(await response.text()).toContain('<svg');
  });
});

test.describe('caching', () => {
  for (const page of PAGES) {
    const requests: Record<string, string>[] = [{ Accept: 'text/html' }, { Accept: 'text/markdown' }, { Accept: 'text/plain' }, { 'User-Agent': CURL_UA }];
    for (const headers of requests) {
      test(`${page.path} (${JSON.stringify(headers)}) revalidates to a 304 with the same headers`, async () => {
        const first = await raw(page.path, headers);
        const etag = first.headers['etag'];
        expect(etag).toBeTruthy();
        const again = await raw(page.path, { ...headers, 'If-None-Match': etag! });
        expect(again.status).toBe(304);
        expect(again.body.length).toBe(0);
        expect(again.headers['etag']).toBe(etag);
        expect(again.headers['cache-control']).toBe('no-cache');
        expectNegotiatedVary(again);

        const since = await raw(page.path, { ...headers, 'If-Modified-Since': first.headers['last-modified']! });
        expect(since.status).toBe(304);
      });
    }

    test(`${page.path}: the coloured and the plain text have different ETags`, async () => {
      const ansi = await raw(page.path, { 'User-Agent': CURL_UA });
      const txt = await raw(page.path, { 'User-Agent': CURL_UA, Accept: 'text/plain', 'If-None-Match': ansi.headers['etag']! });
      expect(formatOf(ansi.text)).toBe('ansi');
      expect(txt.status).toBe(200);
      expect(formatOf(txt.text)).toBe('txt');
    });

    test(`${page.path}: another representation's ETag does not match`, async () => {
      const html = await raw(page.path, { Accept: 'text/html' });
      const md = await raw(page.path, { Accept: 'text/markdown', 'If-None-Match': html.headers['etag']! });
      expect(md.status).toBe(200);
      expect(formatOf(md.text)).toBe('md');
    });
  }
});

test.describe('compression', () => {
  const targets: [string, Record<string, string>, string][] = [
    ['/', { Accept: 'text/html' }, 'text/html'],
    ['/', { Accept: 'text/markdown' }, 'text/markdown'],
    ['/', { 'User-Agent': CURL_UA }, 'text/plain'],          // index.ansi
    ['/about/', { 'User-Agent': 'Wget' }, 'text/plain'],      // index.ansi
    ['/about/index.ansi', {}, 'text/plain'],
    ['/about/', { Accept: 'text/html' }, 'text/html'],
    ['/about/', { Accept: 'text/markdown' }, 'text/markdown'],
    ['/about/', { Accept: 'text/plain' }, 'text/plain'],
    ['/about/index.md', {}, 'text/markdown'],
    ['/favicon.svg', {}, 'image/svg+xml'],
  ];
  for (const [path, headers, type] of targets) {
    test(`${path} ${JSON.stringify(headers)} is gzipped on request`, async () => {
      const plain = await raw(path, headers);
      const gzipped = await raw(path, { ...headers, 'Accept-Encoding': 'gzip, deflate, br' });
      expect(gzipped.status).toBe(200);
      expect(gzipped.headers['content-encoding']).toBe('gzip');
      expect(gzipped.headers['content-type']).toContain(type);
      expect(varyOf(gzipped)).toContain('accept-encoding');
      expect(gunzip(gzipped.body)).toBe(plain.text);
      expect(gzipped.body.length).toBeLessThan(plain.body.length);
      // the precompressed copy keeps a strong ETag (on-the-fly gzip would weaken it to W/"...")
      expect(gzipped.headers['etag']).toMatch(/^"/);
      expect(plain.headers['content-encoding']).toBeUndefined();
    });
  }
});

test.describe('errors and hardening', () => {
  for (const path of ['/nope', '/nope/', '/about/nope.md', '/index.htm', '/about/index.md.gz', '/index.html.gz']) {
    test(`${path} is a 404`, async () => {
      const response = await raw(path, { 'User-Agent': BROWSER_UA });
      expect(response.status).toBe(404);
    });
  }

  test('a 404 for a missing directory URL still says it depends on Accept', async () => {
    const response = await raw('/nope/', { Accept: 'text/markdown' });
    expect(response.status).toBe(404);
    expectNegotiatedVary(response);
  });

  test('the Server header has no version (server_tokens off)', async () => {
    for (const path of ['/', '/nope']) {
      const response = await raw(path);
      expect(response.headers['server']).toBe('nginx');
      expect(response.text).not.toMatch(/nginx\/\d/);
    }
  });

  test('every response says nosniff', async () => {
    for (const path of ['/', '/about/index.md', '/favicon.svg', '/nope', '/about']) {
      expect((await raw(path)).headers['x-content-type-options'], path).toBe('nosniff');
    }
  });

  test('/healthz answers ok and is not cached', async () => {
    const response = await raw('/healthz');
    expect(response.status).toBe(200);
    expect(response.text).toBe('ok\n');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test('only GET and HEAD are allowed on files', async () => {
    const response = await raw('/about/', { Accept: 'text/html' }, 'POST');
    expect(response.status).toBe(405);
  });
});
