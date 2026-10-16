import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { ink } from '../support/canvas';
import { CREW_BIOS, WING_FRAMES } from '../support/expected';

const NAMES = Object.keys(CREW_BIOS).sort();

async function crew(page: Page): Promise<{ name: string; bio: string; heading: string }[]> {
  return page.locator('.crew > .mate').evaluateAll((els) =>
    els.map((el) => ({
      name: el.getAttribute('data-name') ?? '',
      bio: el.querySelector('.bio')?.textContent ?? '',
      heading: el.querySelector('h3')?.textContent ?? '',
    })),
  );
}

test.describe('about crew', () => {
  test('all four are always there, each with one of their own lines', async ({ twin }) => {
    const orders = new Set<string>();
    const bios = new Map<string, Set<string>>(NAMES.map((n) => [n, new Set()]));
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const page = await twin.open('about', { seed });
      const members = await crew(page);
      expect(members.map((m) => m.name).sort()).toEqual(NAMES);
      expect(await page.locator('.crew').evaluate((ul) => ul.children.length)).toBe(4);
      for (const m of members) {
        expect(m.heading).toBe(m.name);
        expect(CREW_BIOS[m.name], `${m.name}'s bio "${m.bio}"`).toContain(m.bio);
        bios.get(m.name)?.add(m.bio);
      }
      orders.add(members.map((m) => m.name).join(','));
      await page.context().close();
    }
    // nobody is always first, and the lines change from visit to visit
    expect(orders.size).toBeGreaterThan(2);
    for (const [name, seen] of bios) expect(seen.size, name).toBeGreaterThan(1);
  });

  test('four moths circle the light on the crew canvas', async ({ site, page, context }) => {
    // where each person's label is drawn (the light's sparkle alone changes the bitmap every frame,
    // so a changed fingerprint would not show that the moths move)
    await context.addInitScript(() => {
      const at: Record<string, [number, number]> = {};
      (window as unknown as { __labels: typeof at }).__labels = at;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, ...rest: [number?]) {
        if (this.canvas.id === 'crew') at[String(text)] = [x, y];
        return fillText.call(this, text, x, y, ...rest);
      } as CanvasRenderingContext2D['fillText'];
    });
    await site.open('about');
    const cv = page.locator('#crew');
    await expect(cv).toHaveAttribute('role', 'img');
    await site.advance(50);
    expect(await ink(cv)).toBeGreaterThan(1000);
    const labels = () => page.evaluate(() => ({ ...(window as unknown as { __labels: Record<string, [number, number]> }).__labels }));
    const before = await labels();
    expect(Object.keys(before).filter((k) => NAMES.includes(k)).sort()).toEqual(NAMES);
    await site.advance(500);
    const after = await labels();
    const box = await cv.evaluate((el: HTMLCanvasElement) => ({ w: el.clientWidth, h: el.clientHeight }));
    for (const name of NAMES) {
      const [[x0, y0], [x1, y1]] = [before[name] ?? [0, 0], after[name] ?? [0, 0]];
      expect(Math.hypot(x1 - x0, y1 - y0), `${name}'s moth moved`).toBeGreaterThan(5);
      // around the light in the middle of the canvas, not off it
      for (const [x, y] of [[x0, y0], [x1, y1]] as const) {
        expect(x, name).toBeGreaterThan(0);
        expect(x, name).toBeLessThan(box.w);
        expect(y, name).toBeGreaterThan(0);
        expect(y, name).toBeLessThan(box.h);
      }
    }
  });

  test("hovering a crew card lights that person's moth, and only theirs", async ({ site, page, context }) => {
    // every glyph the crew canvas draws, with the style it is drawn in
    await context.addInitScript(() => {
      const log: { text: string; fill: string; blur: number }[] = [];
      (window as unknown as { __crew: typeof log }).__crew = log;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, text: string, ...rest: [number, number, number?]) {
        if (this.canvas.id === 'crew') log.push({ text: String(text), fill: String(this.fillStyle), blur: this.shadowBlur });
        return fillText.call(this, text, ...rest);
      } as CanvasRenderingContext2D['fillText'];
    });
    await site.open('about');
    await page.locator('.crew').scrollIntoViewIfNeeded();
    await site.settle();
    /** whose moth (wing glyph and name label) is drawn lit, white with a glow, over the next 100ms */
    const lit = async () => {
      await page.evaluate(() => void ((window as unknown as { __crew: unknown[] }).__crew.length = 0));
      await site.advance(100);
      const log = await page.evaluate(() => (window as unknown as { __crew: { text: string; fill: string; blur: number }[] }).__crew);
      expect(log.length, 'the crew canvas drew').toBeGreaterThan(8);
      const glowing = (e: { fill: string; blur: number } | undefined) => !!e && e.fill.toLowerCase() === '#ffffff' && e.blur > 0;
      const names = new Set<string>();
      log.forEach((e, i) => {
        if (!NAMES.includes(e.text) || !glowing(e)) return;
        // its moth is drawn just before its label, in the same light
        expect(WING_FRAMES, `the glyph before ${e.text}'s label`).toContain(log[i - 1]?.text);
        expect(glowing(log[i - 1]), `${e.text}'s moth glows with its label`).toBe(true);
        names.add(e.text);
      });
      // nothing else on the canvas is drawn in that light
      expect(log.filter((e, i) => glowing(e) && !names.has(e.text) && !names.has(log[i + 1]?.text ?? '')).map((e) => e.text)).toEqual([]);
      return [...names];
    };
    expect(await lit(), 'nobody is lit before a card is hovered').toEqual([]);
    for (const name of ['alan', 'jose', 'arjun']) {
      const card = await page.locator(`.crew > .mate[data-name="${name}"]`).boundingBox();
      if (!card) throw new Error(`no card for ${name}`);
      await page.mouse.move(card.x + card.width / 2, card.y + 20);
      expect(await lit(), `hovering ${name}'s card`).toEqual([name]);
    }
    await page.mouse.move(5, 5);
    expect(await lit(), 'nobody is lit once the pointer leaves the cards').toEqual([]);
  });
});
