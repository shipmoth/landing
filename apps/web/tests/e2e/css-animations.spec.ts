/**
 * The CSS animations: the blinking caret, the draining meters, the flowchart pulse walking down the
 * boxes and arrows and back along the return line. They run on the document timeline (real time,
 * which the fake clock does not drive), so they are checked as data here (which animation runs on
 * which element, with which timing) and as pixels, paused at a fixed moment, in tests/visual.
 */
import { test, expect } from '../support/fixtures';
import { PAGE_NAMES, type PageName } from '../support/expected';

/** each running animation as `name on target(::pseudo): duration +delay xiterations playState` */
function running(): string[] {
  // tag.classes, list items by position (with their list), and a list item's direct children with it
  const where = (el: Element): string => {
    const self = el.id ? `#${el.id}` : el.tagName.toLowerCase() + [...el.classList].map((c) => '.' + c).join('');
    const parent = el.parentElement;
    if (!parent) return self;
    if (el.tagName === 'LI') return `${where(parent)} > ${self}:nth-child(${[...parent.children].indexOf(el) + 1})`;
    return parent.tagName === 'LI' ? `${where(parent)} > ${self}` : self;
  };
  return document.getAnimations().map((a) => {
    const effect = a.effect instanceof KeyframeEffect ? a.effect : null;
    const t = effect?.getComputedTiming();
    const name = a instanceof CSSAnimation ? a.animationName : a.constructor.name;
    const target = effect?.target ? where(effect.target) + (effect.pseudoElement ?? '') : '(none)';
    return `${name} on ${target}: ${t?.duration}ms +${t?.delay}ms x${t?.iterations} ${a.playState}`;
  });
}

const flow = (n: number) => [
  `flowbox on ol.flow > li:nth-child(${n}): 6000ms +${(n - 1) * 1200}ms xInfinity running`,
  `flowarrow on ol.flow > li:nth-child(${n})::after: 6000ms +${(n - 1) * 1200 + 600}ms xInfinity running`,
  // the ascii frame inherits its box's delay
  `flowframe on ol.flow > li:nth-child(${n}) > span.ab: 6000ms +${(n - 1) * 1200}ms xInfinity running`,
];

const EXPECTED: Record<PageName, string[]> = {
  index: [
    'blink on span.caret: 1000ms +0ms xInfinity running',
    // three meters, a little out of step
    'drain on span.fill: 5000ms +0ms xInfinity running',
    'drain on span.fill: 5000ms +400ms xInfinity running',
    'drain on span.fill: 5000ms +800ms xInfinity running',
    // one pass down the five steps every 6s, then the return line
    ...[1, 2, 3, 4, 5].flatMap(flow),
    'flowarrow on pre.loop: 6000ms +5700ms xInfinity running',
  ],
  about: ['blink on span.caret: 1000ms +0ms xInfinity running'],
};

for (const name of PAGE_NAMES) {
  test(`${name}: the intended CSS animations run, with their timing`, async ({ site, page }) => {
    await site.open(name);
    expect((await page.evaluate(running)).sort()).toEqual([...EXPECTED[name]].sort());
  });
}

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const name of PAGE_NAMES) {
    test(`${name}: no CSS animation runs, and the meters rest drained`, async ({ site, page }) => {
      await site.open(name);
      expect(await page.evaluate(running)).toEqual([]);
      if (name === 'index') {
        // (3 of 10 blocks: the meters show where they would settle)
        const widths = await page.locator('main .gofor .fill').evaluateAll((els) => els.map((el) => getComputedStyle(el).width));
        const ch = await page.locator('main .gofor .track').first().evaluate((el) => parseFloat(getComputedStyle(el).width) / 10);
        expect(widths.map((w) => Math.round(parseFloat(w) / ch))).toEqual([3, 3, 3]);
      }
    });
  }
});
