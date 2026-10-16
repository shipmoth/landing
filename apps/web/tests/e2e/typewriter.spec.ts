import { test, expect } from '../support/fixtures';
import { PAGES, PAGE_NAMES, TYPE_DELAY, typedLength, typingDuration } from '../support/expected';

for (const name of PAGE_NAMES) {
  const { line } = PAGES[name];

  test(`${name}: types its own line out, pausing on full stops`, async ({ site, page }) => {
    await site.open(name);
    const typed = page.locator('#typed');
    await expect(typed).toHaveText('');

    // check midway between keystrokes, so a timer firing on the boundary cannot make it ambiguous
    let elapsed = 0;
    const firstStop = line.indexOf('.');
    const step = async (at: number, expected: string) => {
      await site.advance(at - elapsed);
      elapsed = at;
      expect(await typed.textContent(), `after ${at}ms`).toBe(expected);
    };
    await step(TYPE_DELAY * 3.5, line.slice(0, 3));
    await step(TYPE_DELAY * (firstStop + 0.5), line.slice(0, firstStop));
    // a full stop is held back for 300ms: 150ms after the word before it, it still has not appeared
    await step(TYPE_DELAY * firstStop + 150, line.slice(0, firstStop));
    await step(2000, line.slice(0, typedLength(line, 2000)));

    const total = typingDuration(line);
    await site.advance(total - 10 - elapsed);
    expect(await typed.textContent()).not.toBe(line);
    await site.advance(20);
    await expect(typed).toHaveText(line);
    // and it stays put
    await site.advance(2000);
    await expect(typed).toHaveText(line);
  });
}
