import { test, expect } from '../support/fixtures';
import { BASE_URL } from '../support/env';
import { CONTACT, COPY, PAGES, PAGE_NAMES } from '../support/expected';

test.describe('index signup form', () => {
  test('rejects an address without a domain and keeps what was typed', async ({ site, page }) => {
    await site.open('index');
    const email = page.getByRole('textbox', { name: 'your email address' });
    await email.fill('moth@lamp');
    await email.press('Enter');
    await expect(page.locator('#out')).toHaveText(CONTACT.invalid('moth@lamp'), { useInnerText: true });
    await expect(email).toHaveValue('moth@lamp');
    // and an empty submit too
    await email.fill('');
    await page.getByRole('button', { name: '[ subscribe ]' }).click();
    await expect(page.locator('#out')).toHaveText(CONTACT.invalid(''), { useInnerText: true });
  });

  test('accepts a valid address with spaces around it, and clears the input', async ({ site, page }) => {
    // (an email input drops surrounding spaces itself, so the reply quotes the bare address)
    await site.open('index');
    const email = page.getByRole('textbox', { name: 'your email address' });
    await email.fill('  moth@shipmoth.com  ');
    await page.getByRole('button', { name: '[ subscribe ]' }).click();
    await expect(page.locator('#out')).toHaveText(CONTACT.valid('moth@shipmoth.com'), { useInnerText: true });
    await expect(email).toHaveValue('');
    // the page did not navigate (submit is handled in place)
    await expect(page).toHaveURL(BASE_URL + PAGES.index.url);
  });

  test('pressing the prompt or the empty form area focuses the input', async ({ site, page }) => {
    await site.open('index');
    const email = page.locator('#email');
    await page.locator('#form label').click();
    await expect(email).toBeFocused();
    await email.blur();
    await expect(email).not.toBeFocused();
    await page.locator('#form').scrollIntoViewIfNeeded();
    // find a point that lands on the form itself, not on the input, the label or the button
    const spot = await page.locator('#form').evaluate((form) => {
      const b = form.getBoundingClientRect();
      for (let x = b.right - 1; x > b.left; x -= 4) {
        for (const y of [b.top + b.height / 2, b.top + 2, b.bottom - 2]) {
          if (document.elementFromPoint(x, y) === form) return { x, y };
        }
      }
      return null;
    });
    expect(spot, 'the form has some empty area to press').not.toBeNull();
    if (spot) await page.mouse.click(spot.x, spot.y);
    await expect(email).toBeFocused();
  });
});

for (const name of PAGE_NAMES) {
  test.describe(`${name} copy button`, () => {
    test('copies the address, says so, then resets after 1.5s', async ({ site, page, context, browserName }) => {
      // Chromium can grant clipboard access and read it back. Firefox and WebKit have no such
      // permissions in Playwright (writeText on a click needs none), so there the write is recorded.
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
      } else {
        await context.addInitScript(() => {
          const write = navigator.clipboard.writeText.bind(navigator.clipboard);
          navigator.clipboard.writeText = (text: string) => {
            (window as unknown as { __copied: string }).__copied = text;
            return write(text);
          };
        });
      }
      await site.open(name);
      const copy = page.locator('#copy');
      await expect(copy).toHaveText(COPY.idle);
      await copy.click();
      await expect(copy).toHaveText(COPY.copied);
      const copied =
        browserName === 'chromium'
          ? await page.evaluate(() => navigator.clipboard.readText())
          : await page.evaluate(() => (window as unknown as { __copied: string }).__copied);
      expect(copied).toBe(COPY.address);
      await site.advance(COPY.resetAfter - 50);
      await expect(copy).toHaveText(COPY.copied);
      await site.advance(100);
      await expect(copy).toHaveText(COPY.idle);
    });

    test('when the clipboard refuses to write, it selects the address instead', async ({ site, page }) => {
      await site.open(name, { rejectClipboard: true });
      const refused = await page.evaluate(() => navigator.clipboard.writeText('x').then(() => 'wrote', (e: Error) => e.name));
      expect(refused, 'the clipboard API is there but refuses').toBe('NotAllowedError');
      const copy = page.locator('#copy');
      await copy.click();
      await expect(copy).toHaveText(COPY.selected);
      expect(await page.evaluate(() => String(getSelection()))).toBe(COPY.address);
      await site.advance(COPY.resetAfter - 50);
      await expect(copy).toHaveText(COPY.selected);
      await site.advance(100);
      await expect(copy).toHaveText(COPY.idle);
    });

    test('without a clipboard API it selects the address instead', async ({ site, page }) => {
      await site.open(name, { noClipboard: true });
      expect(await page.evaluate(() => 'clipboard' in navigator && navigator.clipboard)).toBeFalsy();
      const copy = page.locator('#copy');
      await copy.click();
      await expect(copy).toHaveText(COPY.selected);
      expect(await page.evaluate(() => String(getSelection()))).toBe(COPY.address);
      await site.advance(COPY.resetAfter - 50);
      await expect(copy).toHaveText(COPY.selected);
      await site.advance(100);
      await expect(copy).toHaveText(COPY.idle);
    });
  });
}
