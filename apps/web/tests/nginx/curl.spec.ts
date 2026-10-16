/**
 * The acceptance checks, run with the real curl binary (its own User-Agent, and Accept: any type),
 * exactly as written but against the stack under test instead of https://example.com:
 *
 *   curl https://example.com/about/                                  # default curl -> coloured text
 *   curl -H "Accept: text/plain" https://example.com/about/         # plain text, no escape codes
 *   curl -H "Accept: text/markdown" https://example.com/about/       # markdown
 *   curl -H "Accept: text/html" https://example.com/about/           # html
 *   curl -I -H "Accept: text/markdown" https://example.com/about/    # MIME + caching headers
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, CURL_AVAILABLE, ESC, PAGES, curl, fileBody, formatOf, requireStack, withoutColour } from './support';

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
    test(`curl ${url}  -> coloured text`, async () => {
      const out = await curl([url]);
      expect(formatOf(out), out.slice(0, 200)).toBe('ansi');
      expect(out).toContain(`${ESC}[`);
      expect(out).not.toMatch(/<!doctype|<\/html>/i);
      expect(out).toBe(await fileBody(page.files.ansi!));
      // the same text as the plain version, once the colours and the art are taken out
      expect(withoutColour(out)).toBe(await fileBody(page.files.txt!));
    });

    test(`curl -H "Accept: text/plain" ${url}  -> plain text, no escape codes`, async () => {
      const out = await curl(['-H', 'Accept: text/plain', url]);
      expect(formatOf(out), out.slice(0, 200)).toBe('txt');
      expect(out).not.toContain(ESC);
      expect(out).toBe(await fileBody(page.files.txt!));
    });

    test(`curl ${url}index.txt and ${url}index.ansi  -> each by name`, async () => {
      expect(await curl([`${url}index.txt`])).toBe(await fileBody(page.files.txt!));
      expect(await curl([`${url}index.ansi`])).toBe(await fileBody(page.files.ansi!));
      expect(await curl([`${url}index.ansi`])).toContain(ESC);
    });

    test(`curl -I ${url}  -> text/plain with utf-8, negotiated and revalidated`, async () => {
      const { status, headers } = parseHead(await curl(['-I', url]));
      expect(status).toBe(200);
      expect(headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(headers['cache-control']).toBe('no-cache');
      expect(headers['vary']?.toLowerCase()).toContain('accept, user-agent');
      expect(Number(headers['content-length'])).toBe(Buffer.byteLength(await fileBody(page.files.ansi!)));
    });

    test(`curl --compressed ${url}  -> the same coloured text, gzipped on the wire`, async () => {
      const { headers } = parseHead(await curl(['-I', '--compressed', url]));
      expect(headers['content-encoding']).toBe('gzip');
      expect(await curl(['--compressed', url])).toBe(await fileBody(page.files.ansi!));
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

test('curl -L http://.../about.html  -> follows the old URL to the coloured text page', async () => {
  const out = await curl(['-L', `${BASE_URL}/about.html`]);
  expect(out).toBe(await fileBody('/about/index.ansi'));
});

test('curl -sf http://.../nope  -> fails with 404', async () => {
  await expect(curl(['-f', `${BASE_URL}/nope`])).rejects.toThrow(/404/);
});
