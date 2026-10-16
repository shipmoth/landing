/**
 * The swarm and crew canvases only ever draw real glyphs.
 *
 * A requestAnimationFrame callback receives the frame's start time, which can be EARLIER than a
 * performance.now() read a moment before (at init, while a long script or the first layout was
 * still running). The wingbeat phase is (timestamp - init time), so the first frames see a negative
 * phase; indexing the four wing frames with it would draw the literal text "undefined" (a flash on
 * load). mothFrame() in src/scripts/lib/moth.ts falls back to the first frame.
 *
 * Here every rAF timestamp lags performance.now() by LAG ms, and CanvasRenderingContext2D.fillText
 * is wrapped to record what each canvas draws.
 */
import { test, expect } from '../support/fixtures';
import { BELT, CREW_BIOS, PAGE_NAMES, WING_FRAMES } from '../support/expected';

/** how far rAF timestamps trail performance.now(): one long first frame */
const LAG = 500;

/** single characters of the two light ramps (swarm lamp, crew light) */
const LIGHT_RAMP = ' .·:;~+*oO0@';
const ALLOWED: Record<string, Set<string>> = {
  swarm: new Set([...WING_FRAMES, ...LIGHT_RAMP]),
  crew: new Set([...WING_FRAMES, ...Object.keys(CREW_BIOS), ...LIGHT_RAMP]),
};

declare global {
  interface Window {
    __glyphs?: Record<string, Record<string, number>>;
  }
}

for (const name of PAGE_NAMES) {
  test(`${name}: the swarm${name === 'about' ? ' and crew' : ''} canvas draw${name === 'about' ? '' : 's'} only moth glyphs, even when frame timestamps run behind`, async ({
    site,
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      const seen: Record<string, Record<string, number>> = {};
      window.__glyphs = seen;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, text: string, ...rest: [number, number, number?]) {
        const id = this.canvas.id || 'other';
        const counts = (seen[id] ??= {});
        const key = String(text);
        counts[key] = (counts[key] ?? 0) + 1;
        return fillText.call(this, text, ...rest);
      } as CanvasRenderingContext2D['fillText'];
    });
    await site.open(name, { rafLag: LAG });
    // the first frames (where the phase is negative), then a few seconds, then on screen at the belt
    await site.advance(1500);
    await page.locator('footer').scrollIntoViewIfNeeded();
    await site.advance(BELT.tick * 4);
    const glyphs = await page.evaluate(() => window.__glyphs ?? {});

    const canvases = name === 'about' ? ['swarm', 'crew'] : ['swarm'];
    for (const id of canvases) {
      const drawn = Object.keys(glyphs[id] ?? {});
      expect(drawn.length, `#${id} drew something`).toBeGreaterThan(0);
      const strange = drawn.filter((g) => !ALLOWED[id]?.has(g));
      expect(strange, `#${id} drew text that is not a moth, a name or the light`).toEqual([]);
    }
    // and no canvas at all ever draws a stringified non-value
    const bad = Object.entries(glyphs).flatMap(([id, counts]) =>
      Object.keys(counts)
        .filter((g) => /undefined|null|NaN|\[object/.test(g))
        .map((g) => `#${id}: ${JSON.stringify(g)} x${counts[g]}`),
    );
    expect(bad).toEqual([]);
  });
}
