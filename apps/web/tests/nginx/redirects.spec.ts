/**
 * Redirects: directory URLs without their slash, and the old site's /index.html and /about.html.
 * Every Location is a path (absolute_redirect off): behind Docker's port mapping nginx would
 * otherwise send its own port (http://localhost:8080/about/ for a site published on another one).
 */
import { test, expect } from '@playwright/test';
import { BROWSER_UA, CURL_UA, expectNoNegotiationVary, formatOf, raw, requireStack } from './support';

requireStack();

const REDIRECTS: [from: string, to: string][] = [
  ['/about', '/about/'],
  ['/about.html', '/about/'],
  ['/index.html', '/'],
  ['/about.html?ref=old', '/about/?ref=old'],
  ['/index.html?ref=old', '/?ref=old'],
];

for (const [from, to] of REDIRECTS) {
  for (const headers of [{ 'User-Agent': BROWSER_UA }, { 'User-Agent': CURL_UA, Accept: 'text/markdown' }]) {
    test(`${from} -> 301 ${to} (${headers.Accept ?? 'browser'})`, async () => {
      for (const method of ['GET', 'HEAD']) {
        const response = await raw(from, headers, method);
        expect(response.status, method).toBe(301);
        expect(response.headers['location'], method).toBe(to);
        expect(response.headers['cache-control'], method).toBe('public, max-age=3600');
        expectNoNegotiationVary(response);
      }
    });
  }
}

test('following the redirects lands on the negotiated page', async ({ request }) => {
  for (const [from, to] of REDIRECTS) {
    const response = await request.get(from, { headers: { Accept: 'text/markdown' } });
    expect(response.status(), from).toBe(200);
    expect(new URL(response.url()).pathname + new URL(response.url()).search, from).toBe(to);
    expect(formatOf(await response.text()), from).toBe('md');
  }
});

test('the home page itself does not redirect (index -> /index.html is internal, not a loop)', async () => {
  for (const headers of [{ 'User-Agent': BROWSER_UA }, { Accept: 'text/html' }, { Accept: 'text/markdown' }, { 'User-Agent': CURL_UA }]) {
    const response = await raw('/', headers);
    expect(response.status, JSON.stringify(headers)).toBe(200);
  }
});

test('/about/index.html is served as is (only the old top-level /index.html redirects)', async () => {
  const response = await raw('/about/index.html', { 'User-Agent': BROWSER_UA });
  expect(response.status).toBe(200);
  expect(formatOf(response.text)).toBe('html');
});
