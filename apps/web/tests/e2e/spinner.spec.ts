import { test, expect } from '../support/fixtures';
import { PAGE_NAMES, SPINNER } from '../support/expected';

for (const name of PAGE_NAMES) {
  test(`${name}: the header spinner cycles | / - \\ every 240ms`, async ({ site, page }) => {
    await site.open(name);
    const spin = page.locator('#spin');
    await expect(spin).toHaveText('|');
    const frame = (ticks: number) => SPINNER.frames[ticks % SPINNER.frames.length];
    // just before and just after each of the first eight ticks, so drift in the period shows up
    let at = 0;
    for (let k = 1; k <= 8; k++) {
      for (const [t, ticks] of [[k * SPINNER.every - 5, k - 1], [k * SPINNER.every + 5, k]] as const) {
        await site.advance(t - at);
        at = t;
        expect(await spin.textContent(), `at ${t}ms`).toBe(frame(ticks));
      }
    }
  });
}
