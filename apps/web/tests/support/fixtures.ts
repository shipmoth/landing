/**
 * `test` for every e2e, a11y and visual spec. Adds:
 *   seed            the Math.random seed (default DEFAULT_SEED)
 *   site            the default page, made deterministic (seeded + paused clock, see
 *                   deterministic-page.ts), with helpers to open and step it
 *   twin            opens extra, identically prepared pages in fresh contexts, for A/B comparisons
 *                   (e.g. a page that was poked against one that was not)
 *   pageOptions     the current project's context options (viewport, scale, motion...), for specs
 *                   that build their own context
 * Every spec fails with a clear message when the site has not been built.
 */
import { test as base, expect, type BrowserContextOptions, type Page } from '@playwright/test';
import { advance, makeDeterministic, settle, skip, visit, DEFAULT_SEED, type DeterministicOptions } from './deterministic-page';
import { isBuilt, MISSING_BUILD } from './env';
import { PAGES, type PageName } from './expected';

export interface Options {
  seed: number;
}

export interface Site {
  page: Page;
  open(name: PageName, opts?: DeterministicOptions): Promise<Page>;
  advance(ms: number): Promise<void>;
  skip(ms: number): Promise<void>;
  settle(): Promise<void>;
}

export interface Twin {
  /** a fresh context + page, made deterministic and opened */
  open(name: PageName, opts?: DeterministicOptions): Promise<Page>;
}

interface Fixtures {
  site: Site;
  twin: Twin;
  pageOptions: BrowserContextOptions;
}

export const test = base.extend<Fixtures & Options>({
  seed: [DEFAULT_SEED, { option: true }],

  pageOptions: async ({ baseURL, viewport, deviceScaleFactor, reducedMotion, colorScheme, hasTouch }, use) => {
    await use({
      ...(baseURL ? { baseURL } : {}),
      viewport,
      hasTouch,
      deviceScaleFactor: deviceScaleFactor ?? 1,
      reducedMotion: reducedMotion ?? 'no-preference',
      colorScheme: colorScheme ?? 'dark',
    });
  },

  site: async ({ page, context, seed }, use) => {
    if (!isBuilt()) throw new Error(MISSING_BUILD);
    let prepared = false;
    const site: Site = {
      page,
      async open(name, opts = {}) {
        if (!prepared) await makeDeterministic(context, page, { seed, ...opts });
        prepared = true;
        await visit(page, PAGES[name].url);
        return page;
      },
      advance: (ms) => advance(page, ms),
      skip: (ms) => skip(page, ms),
      settle: () => settle(page),
    };
    await use(site);
  },

  twin: async ({ browser, seed, pageOptions }, use) => {
    if (!isBuilt()) throw new Error(MISSING_BUILD);
    const pages: Page[] = [];
    await use({
      async open(name, opts = {}) {
        const context = await browser.newContext(pageOptions);
        const page = await context.newPage();
        await makeDeterministic(context, page, { seed, ...opts });
        pages.push(page);
        await visit(page, PAGES[name].url);
        return page;
      },
    });
    await Promise.all(pages.map((p) => p.context().close()));
  },
});

export { expect };
