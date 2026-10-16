import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { FRAMED, PAGE_NAMES } from '../support/expected';

const DASHES = '-'.repeat(400);
const PIPES = '|\n'.repeat(160);

for (const name of PAGE_NAMES) {
  test(`${name}: every box gets a frame of + - | characters`, async ({ site, page }) => {
    await site.open(name);
    await expect(page.locator('html')).toHaveClass(/(^|\s)ascii(\s|$)/);
    const boxes = page.locator(FRAMED);
    const count = await boxes.count();
    expect(count).toBeGreaterThan(name === 'index' ? 7 : 11); // 3 products + 5 steps / 4 crew + 8 photos
    const frames = await boxes.evaluateAll((els) =>
      els.map((b) => {
        const f = b.firstElementChild;
        const part = (cls: string) => f?.querySelector(`:scope > .${cls}`)?.textContent ?? null;
        return {
          isFrame: f?.matches('span.ab') ?? false,
          hidden: f?.getAttribute('aria-hidden'),
          frames: b.querySelectorAll(':scope > .ab').length,
          top: part('ab-t'),
          bottom: part('ab-b'),
          left: part('ab-l'),
          right: part('ab-r'),
        };
      }),
    );
    for (const f of frames) {
      expect(f).toEqual({
        isFrame: true,
        hidden: 'true',
        frames: 1,
        top: `+${DASHES}${DASHES}+`,
        bottom: `+${DASHES}${DASHES}+`,
        left: PIPES,
        right: PIPES,
      });
    }
  });

  test(`${name}: titles set into a frame edge get a gap exactly their width`, async ({ site, page }) => {
    await site.open(name);
    expectGapsFit(await measureGaps(page));
  });

  // nothing on these pages changes a title's width with the window width alone, so this makes the
  // type bigger (as a text-size setting would) and then resizes: the frames must follow
  test(`${name}: frame gaps are re-measured when the window is resized`, async ({ site, page }) => {
    await site.open(name);
    const before = await measureGaps(page);
    await page.addStyleTag({ content: BIGGER_TYPE });
    await page.setViewportSize({ width: 1000, height: 800 });
    await site.advance(300);
    const after = await measureGaps(page);
    expect(after.length).toBe(before.length);
    after.forEach((r, i) => {
      const was = before[i];
      // the titles (or step numbers) really grew, or this would prove nothing
      expect(r.flow ? r.top : r.title, r.box).toBeGreaterThan((was ? (r.flow ? was.top : was.title) : 0) + 5);
    });
    expectGapsFit(after);
  });
}

const BIGGER_TYPE =
  'main .prod h2, main .prod > p:last-child, main .mate h3, main .mate .tag, main .wall figcaption, main .flow li { font-size: 21px !important; }';

interface GapRow {
  box: string;
  flow: boolean;
  top: number;
  bottom: number;
  title: number;
  caption: number;
}

/** every visible framed box: its title/caption widths and the gaps its frame leaves for them */
function measureGaps(page: Page): Promise<GapRow[]> {
  return page.locator(FRAMED).evaluateAll((els) =>
    els
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => {
        const width = (el: Element | null) => (el ? el.getBoundingClientRect().width : 0);
        const gap = (edge: string) => width(b.querySelector(`:scope > .ab > .${edge} > .ab-gap`));
        return {
          box: b.className || b.tagName,
          flow: b.matches('.flow li'),
          top: gap('ab-t'),
          bottom: gap('ab-b'),
          title: width(b.querySelector(':scope > h2, :scope > h3')),
          caption: width(b.querySelector(':scope > p:last-child, :scope > .tag, :scope > figcaption')),
        };
      }),
  );
}

function expectGapsFit(rows: GapRow[]): void {
  expect(rows.length).toBeGreaterThan(3);
  for (const r of rows) {
    if (r.flow) {
      // the step number is a ::before ("01" in brackets plus padding), measured with a stand-in
      expect(r.top, r.box).toBeGreaterThan(30);
      expect(r.top, r.box).toBeLessThan(140);
      expect(r.top, 'all step numbers are the same width').toBe(rows.find((x) => x.flow)?.top);
      expect(r.bottom, r.box).toBe(0);
    } else {
      expect(r.title, r.box).toBeGreaterThan(0);
      expect(r.top, r.box).toBeCloseTo(r.title, 1);
      expect(r.bottom, r.box).toBeCloseTo(r.caption, 1);
    }
  }
}
