import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { idleMothFlying } from '../support/canvas';
import { IDLE_MS, PAGE_NAMES, WING_FRAMES } from '../support/expected';

/** steps real frames until the idle moth has landed (it flies there; that takes a few seconds) */
async function waitForPerch(page: Page, advance: (ms: number) => Promise<void>, maxMs = 20_000): Promise<boolean> {
  const perch = page.locator('#perch');
  for (let t = 0; t < maxMs; t += 1000) {
    if (!(await perch.evaluate((el) => (el as HTMLElement).hidden))) return true;
    await advance(1000);
  }
  return !(await perch.evaluate((el) => (el as HTMLElement).hidden));
}

for (const name of PAGE_NAMES) {
  test(`${name}: after 30s without input a moth lands on a word, and takes off on input`, async ({ site, page }) => {
    await site.open(name);
    // the moth only lands on words that are on screen: bring some text into view first
    // (on the index page at 1280x800 the hero fills the whole first screen)
    await page.locator('main section > p').nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await site.settle();
    const perch = page.locator('#perch');
    await expect(perch).toBeHidden();
    await expect(perch).toHaveAttribute('aria-hidden', 'true');
    await site.skip(IDLE_MS - 1000);
    await site.advance(500);
    await expect(perch).toBeHidden();
    await site.skip(1500);
    expect(await waitForPerch(page, site.advance), 'the idle moth lands within 20s of flying').toBe(true);

    await expect(perch).toBeVisible();
    expect(WING_FRAMES).toContain(await perch.textContent());
    // it sits on a word inside the text column
    const onWord = await perch.evaluate((el) => {
      const x = parseFloat(el.style.left);
      const y = parseFloat(el.style.top);
      const hit = [...document.querySelectorAll('main p, main li, main h2')].find((t) => {
        const b = t.getBoundingClientRect();
        return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
      });
      return { x, y, on: hit?.tagName ?? null };
    });
    expect(onWord.on, JSON.stringify(onWord)).not.toBeNull();
    // resting wings beat slowly: the frame changes over time
    const frames = new Set<string>();
    for (let i = 0; i < 8; i++) {
      frames.add((await perch.textContent()) ?? '');
      await site.advance(200);
    }
    expect(frames.size).toBeGreaterThan(1);

    await page.mouse.move(200, 200);
    await site.settle();
    await expect(perch).toBeHidden();
  });
}

test('about: any input restarts the 30s idle countdown', async ({ site, page }) => {
  await site.open('about');
  await page.locator('main section > p').nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await site.settle();
  await site.skip(IDLE_MS - 10_000);
  await page.keyboard.press('Shift');
  await site.settle();
  // 30.5s after load, but only 10.5s after the key press
  await site.skip(10_500);
  // give a moth that wrongly took off plenty of frames to arrive
  const landed = await waitForPerch(page, site.advance, 12_000);
  expect(landed, 'no moth may land before 30s of stillness').toBe(false);
});

for (const name of PAGE_NAMES) {
  test(`${name}: the idle moth sets off after exactly 30s of stillness, not before`, async ({ site, page }) => {
    await site.open(name);
    await page.locator('main section > p').nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await site.settle();
    // the countdown starts at the last input (the scroll above, at t=0)
    await site.skip(IDLE_MS - 500);
    await site.advance(32);
    expect(await idleMothFlying(page), 'still waiting at 29.5s').toBe(false);
    await site.skip(1000);
    await site.advance(32);
    expect(await idleMothFlying(page), 'on its way at 30.5s').toBe(true);
  });
}

test.describe('on a touch screen without pointer events', () => {
  test.use({ hasTouch: true });

  test('about: a touch restarts the idle countdown', async ({ site, page, context }) => {
    // a touch browser that predates Pointer Events (e.g. iOS Safari 12): taps arrive as touch events
    // (and compatibility mouse events) only. Swallowing touch-type pointer events reproduces that, so
    // only `touchstart` can tell the swarm that someone is there.
    await context.addInitScript(() => {
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointerover', 'pointerenter', 'pointercancel']) {
        addEventListener(
          type,
          (e) => {
            if ((e as PointerEvent).pointerType === 'touch') e.stopImmediatePropagation();
          },
          true,
        );
      }
    });
    await site.open('about');
    await page.locator('main section > p').nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await site.settle();
    await site.skip(IDLE_MS - 10_000);
    const p = await page.locator('main section > p').nth(1).boundingBox();
    if (!p) throw new Error('no paragraph');
    await page.touchscreen.tap(p.x + 20, p.y + p.height / 2);
    await site.settle();
    // 30.5s after load, but only 10.5s after the touch
    await site.skip(10_500);
    await site.advance(32);
    expect(await idleMothFlying(page), 'no moth sets off 10.5s after a touch').toBe(false);
    await site.skip(20_000);
    await site.advance(32);
    expect(await idleMothFlying(page), 'but one does 30s after it').toBe(true);
  });
});
