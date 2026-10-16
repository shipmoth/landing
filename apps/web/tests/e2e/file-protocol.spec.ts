/**
 * Both pages work when opened straight from disk (file://), e.g. by double-clicking index.html in a
 * download of the site. Module scripts loaded with src= are blocked there (file:// has an opaque
 * origin, so the module fetch fails CORS), which is why the build inlines each page's script.
 *
 * Each page is opened by its own file (dist/index.html, dist/about/index.html). Moving between
 * them over file:// is not tested, on purpose: the site's nav links are clean folder URLs
 * (`about/`, `../`), which a web server answers with the folder's index.html but a browser on
 * file:// shows as a directory listing. That is the accepted price of clean URLs (see the README).
 */
import { test, expect } from '../support/fixtures';
import { ink } from '../support/canvas';
import { fileUrl } from '../support/env';
import { makeDeterministic, settle } from '../support/deterministic-page';
import { BELT, PAGES, PAGE_NAMES, typingDuration } from '../support/expected';

for (const name of PAGE_NAMES) {
  test(`${name}: works when opened from disk`, async ({ site, page, context }) => {
    void site; // (fails clearly when the site is not built)
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
    await makeDeterministic(context, page);
    const url = fileUrl(PAGES[name].file);
    await page.goto(url, { waitUntil: 'load' });
    await settle(page);
    expect(page.url()).toMatch(/^file:\/\//);

    // ascii frames were inserted
    await expect(page.locator('html')).toHaveClass(/(^|\s)ascii(\s|$)/);
    expect(await page.locator('span.ab[aria-hidden="true"]').count()).toBeGreaterThan(3);
    // the idea line was rendered (its warm-up runs at load, before it is ever on screen)
    const rows = await page.locator('#belt').evaluate((el) => (el.textContent ?? '').split('\n'));
    expect(rows).toHaveLength(BELT.rows);
    expect(rows.join('\n')).toContain('| bin |');
    // the typewriter typed its line
    await page.clock.runFor(typingDuration(PAGES[name].line) + 100);
    await settle(page);
    await expect(page.locator('#typed')).toHaveText(PAGES[name].line);
    // the canvases were drawn
    const canvases = name === 'index' ? ['#orbit .wl', '#orbit .wb', '#orbit .wr', '.title canvas.word', '#swarm'] : ['#crew', '#swarm'];
    for (const sel of canvases) expect(await ink(page.locator(sel)), `${sel} has ink`).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
}
