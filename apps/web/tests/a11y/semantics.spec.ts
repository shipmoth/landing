/**
 * What assistive tech gets: landmarks, headings, the live region, and the decoration kept out of it.
 *
 *   - #belt and pre.loop carry an aria-label; on a plain <pre> it would be ignored and the raw
 *     characters read out, so they also have role="img".
 *   - decoration drawn with CSS `content` (hr dashes, "##" before headings, "[ ]" around card titles,
 *     the "|" rails between list items) would be part of the accessible name/text, so it carries CSS
 *     alternative text, e.g. `content: "## " / ""`.
 */
import { exposedText } from '../support/ax';
import { test, expect } from '../support/fixtures';
import { CONTACT, PAGES, PAGE_NAMES } from '../support/expected';

const SIGNED = ['-----BEGIN SHIPMOTH SIGNED MESSAGE-----', '------END SHIPMOTH SIGNED MESSAGE------'];

for (const name of PAGE_NAMES) {
  test.describe(`${name} semantics`, () => {
    test('has one banner, one navigation, one main, and a single h1', async ({ site, page }) => {
      await site.open(name);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('navigation')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(PAGES[name].h1);
    });

    test('heading levels never skip', async ({ site, page }) => {
      await site.open(name);
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
          .filter((h) => !h.closest('[hidden], [aria-hidden="true"]'))
          .map((h) => Number(h.tagName[1])),
      );
      expect(levels[0]).toBe(1);
      for (let i = 1; i < levels.length; i++) expect(levels[i] ?? 0).toBeLessThanOrEqual((levels[i - 1] ?? 0) + 1);
    });

    test('canvases and ascii drawings are hidden from assistive tech, or labelled as one image', async ({ site, page }) => {
      await site.open(name);
      await site.advance(500);
      const report = await page.evaluate(() => {
        const exposed: string[] = [];
        const label = (el: Element) => el.getAttribute('aria-label') ?? '';
        const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}`;
        const hidden = (el: Element) => !!el.closest('[aria-hidden="true"], [hidden]');
        const insideImage = (el: Element) => {
          const img = el.parentElement?.closest('[role="img"]');
          return !!img && label(img).length > 0;
        };
        const art = document.querySelectorAll(
          'canvas, .ab, pre.ico, .meter, .caret, .portrait pre, .pic pre, #perch',
        );
        for (const el of art) {
          if (hidden(el) || insideImage(el)) continue;
          if (el.getAttribute('role') === 'img' && label(el)) continue;
          exposed.push(describe(el));
        }
        return { exposed, count: art.length };
      });
      expect(report.count).toBeGreaterThan(5);
      expect(report.exposed).toEqual([]);
    });

    test('the idea line is announced by its label, not its characters', async ({ site, page }) => {
      await site.open(name);
      await expect(page.getByRole('img', { name: /conveyor belt carrying half-baked ideas/ })).toHaveCount(1);
      // Chromium's accessibility tree: the children of an image are presentational, so none of the
      // characters (belt, bin, crates, the "back to 01" arrow) may be exposed
      const tree = await exposedText(page);
      expect(tree).not.toContain('__|__');
      expect(tree).not.toContain('| bin |');
      if (name === 'index') {
        await expect(page.getByRole('img', { name: 'then back to step one' })).toHaveCount(1);
        expect(tree).not.toContain('back to 01');
      }
    });

    test('CSS decoration is not read out', async ({ site, page }) => {
      await site.open(name);
      let tree = await exposedText(page);
      for (const s of SIGNED) tree = tree.split(s).join('');
      expect(tree).not.toMatch(/-{5,}/);
      expect(tree).not.toMatch(/(\| ){3,}/);
      expect(tree).not.toMatch(/heading "##/);
      expect(tree).not.toMatch(/heading "\[/);
    });
  });
}

test('form results are announced through a polite live region', async ({ site, page }) => {
  await site.open('index');
  const out = page.locator('#out');
  const live = await out.evaluate((el) => ({ live: el.getAttribute('aria-live'), role: el.getAttribute('role') }));
  expect(live.live === 'polite' || live.role === 'status', JSON.stringify(live)).toBe(true);
  // the region exists, empty, before anything is announced
  await expect(out).toHaveText('');
  const email = page.getByRole('textbox', { name: 'your email address' });
  await email.fill('nope');
  await email.press('Enter');
  await expect(out).toHaveText(CONTACT.invalid('nope'), { useInnerText: true });
  await email.fill('moth@shipmoth.com');
  await email.press('Enter');
  await expect(out).toHaveText(CONTACT.valid('moth@shipmoth.com'), { useInnerText: true });
  // the input keeps an accessible name once cleared
  await expect(email).toHaveAccessibleName('your email address');
});
