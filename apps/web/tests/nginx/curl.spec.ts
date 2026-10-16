/**
 * The acceptance checks, run with the real curl binary (its own User-Agent, and Accept: any type),
 * exactly as written but against the stack under test instead of https://example.com:
 *
 *   curl https://example.com/about/                                  # default curl -> text
 *   curl -H "Accept: text/markdown" https://example.com/about/       # markdown
 *   curl -H "Accept: text/html" https://example.com/about/           # html
 *   curl -I -H "Accept: text/markdown" https://example.com/about/    # MIME + caching headers
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, CURL_AVAILABLE, PAGES, curl, fileBody, formatOf, requireStack } from './support';

requireStack();
test.skip(!CURL_AVAILABLE, 'curl is not on PATH');

/** "HTTP/1.1 200 OK\r\nName: value..." -> status and lower-cased headers (repeated ones joined) */
function parseHead(output: string): { status: number; headers: Record<string, string> } {
  const [statusLine = '', ...lines] = output.trim().split(/\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return { status: Number(statusLine.split(' ')[1]), headers };
}

for (const page of PAGES) {
  const url = `${BASE_URL}${page.path}`;

  test.describe(`curl ${page.path}`, () => {
    test(`curl ${url}  -> plain text`, async () => {
      const out = await curl([url]);
      expect(formatOf(out), out.slice(0, 200)).toBe('txt');
      expect(out).not.toContain('<');
      expect(out).toBe(await fileBody(page.files.txt!));
    });

    test(`curl -H "Accept: text/markdown" ${url}  -> markdown`, async () => {
      const out = await curl(['-H', 'Accept: text/markdown', url]);
      expect(out.startsWith('# '), out.slice(0, 200)).toBe(true);
      expect(out).toBe(await fileBody(page.files.md!));
    });

    test(`curl -H "Accept: text/html" ${url}  -> html`, async () => {
      const out = await curl(['-H', 'Accept: text/html', url]);
      expect(out).toMatch(/^<!doctype html>/i);
      expect(out).toContain('</html>');
    });

    test(`curl -I -H "Accept: text/markdown" ${url}  -> MIME and caching headers`, async () => {
      const { status, headers } = parseHead(await curl(['-I', '-H', 'Accept: text/markdown', url]));
      expect(status).toBe(200);
      expect(headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(headers['cache-control']).toBe('no-cache');
      expect(headers['vary']?.toLowerCase()).toContain('accept, user-agent');
      expect(headers['etag']).toMatch(/^"[^"]+"$/);
      expect(headers['last-modified']).toBeTruthy();
      expect(Number(headers['content-length'])).toBe(Buffer.byteLength(await fileBody(page.files.md!)));
    });
  });
}

test('curl -I http://.../about  -> 301 to /about/ (a path, not a host)', async () => {
  const { status, headers } = parseHead(await curl(['-I', `${BASE_URL}/about`]));
  expect(status).toBe(301);
  expect(headers['location']).toBe('/about/');
});

test('curl -L http://.../about.html  -> follows the old URL to the text page', async () => {
  const out = await curl(['-L', `${BASE_URL}/about.html`]);
  expect(out).toBe(await fileBody('/about/index.txt'));
});

test('curl -sf http://.../nope  -> fails with 404', async () => {
  await expect(curl(['-f', `${BASE_URL}/nope`])).rejects.toThrow(/404/);
});
