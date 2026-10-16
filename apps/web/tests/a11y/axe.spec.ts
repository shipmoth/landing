/**
 * axe-core scans of both pages after their scripts have run (frames inserted, typewriter done,
 * idea line rendered).
 *
 * Zero violations, apart from entries in ACCEPTED. Every entry names a rule AND the nodes it
 * covers, never a whole rule. The only one is permanent:
 *   - decorative frame rails (colour contrast): accepted for good (see the entry).
 * ARIA rules that axe cannot decide on its own ("incomplete", e.g. aria-prohibited-attr for an
 * aria-label on a role-less element) count as failures too: they are always fixable.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../support/fixtures';
import { PAGE_NAMES, type PageName } from '../support/expected';

type Result = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

interface Accepted {
  page: PageName;
  rule: string;
  /** only these nodes (matched against the axe target selector, joined with spaces) */
  target: RegExp;
  /** why */
  reason: string;
}

/** the ascii frame rails (.ab-l / .ab-r) drawn inside each box by scripts/features/ascii-frames.ts */
const FRAME_RAIL = /\.ab\[aria-hidden="true"\] > \.ab-[lr]$/;

/** accepted violations: a rule plus the nodes it covers */
const ACCEPTED: Accepted[] = PAGE_NAMES.map(
  (page): Accepted => ({
    page,
    rule: 'color-contrast',
    target: FRAME_RAIL,
    reason:
      'frame rails are aria-hidden, pure decoration (the boxes read the same without them): exempt from contrast as decoration (WCAG 1.4.3 incidental text, 1.4.11 graphics not needed to understand content). Their 55% product-colour blend measures 3.05-3.89:1.',
  }),
);

function describe(results: Result[]): string[] {
  return results.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact ?? '?'}): ${n.target.join(' ')}`));
}

function unaccepted(page: PageName, results: Result[]): Result[] {
  return results
    .map((v) => {
      const rules = ACCEPTED.filter((a) => a.page === page && a.rule === v.id);
      const nodes = v.nodes.filter((n) => !rules.some((a) => a.target.test(n.target.join(' '))));
      return { ...v, nodes };
    })
    .filter((v) => v.nodes.length > 0);
}

for (const name of PAGE_NAMES) {
  test(`${name}: axe finds no accessibility violations`, async ({ site, page }) => {
    await site.open(name);
    await site.advance(4000);
    // axe schedules its own work with timers, so let the clock run from here on
    await page.clock.resume();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    // ARIA rules that axe cannot decide on its own still count: they are always fixable invisibly
    const ariaReview = results.incomplete.filter((v) => v.id.startsWith('aria-'));

    expect(describe(unaccepted(name, results.violations))).toEqual([]);
    expect(describe(ariaReview)).toEqual([]);
    // and every acceptance is still needed (a stale one would quietly cover a future regression)
    for (const a of ACCEPTED.filter((x) => x.page === name)) {
      const hits = results.violations.filter((v) => v.id === a.rule).flatMap((v) => v.nodes).filter((n) => a.target.test(n.target.join(' ')));
      expect(hits.length, `accepted ${a.rule} on ${a.target} still occurs`).toBeGreaterThan(0);
    }
  });
}
