import { test, expect } from '../support/fixtures';
import { setHidden } from '../support/deterministic-page';
import { AWAY_TITLE, PAGES, PAGE_NAMES } from '../support/expected';

for (const name of PAGE_NAMES) {
  test(`${name}: the tab title misses you while you are away`, async ({ site, page }) => {
    await site.open(name);
    await expect(page).toHaveTitle(PAGES[name].title);
    await setHidden(page, true);
    await expect(page).toHaveTitle(AWAY_TITLE);
    await setHidden(page, false);
    await expect(page).toHaveTitle(PAGES[name].title);
    // a second round trip works too
    await setHidden(page, true);
    await expect(page).toHaveTitle(AWAY_TITLE);
    await setHidden(page, false);
    await expect(page).toHaveTitle(PAGES[name].title);
  });
}
