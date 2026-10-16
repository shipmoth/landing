/**
 * A deterministic page: the same seed and the same simulated time give the same moths, the same
 * frames and the same pixels on every run. Every e2e, a11y and visual spec opens pages this way
 * (through the `site` and `twin` fixtures in fixtures.ts).
 *
 *  1. Math.random is replaced, before any page script runs, by a seeded mulberry32 PRNG. The page
 *     scripts draw their random numbers in a fixed order, so a seed fixes the moths, the shuffles,
 *     the flicker and the sparkle.
 *  2. page.clock is installed and paused *before* navigation. Date, performance.now, setTimeout,
 *     setInterval and requestAnimationFrame are all fake, so nothing moves until a spec calls
 *     `advance()` (clock.runFor). Real time spent loading, screenshotting or waiting never leaks in.
 *     One wrinkle: Playwright's fake performance.now() ("ticks") also counts the *real* milliseconds
 *     between clock.install and clock.pauseAt, and it aligns requestAnimationFrame to multiples of
 *     16 ticks. That offset differs per run, so both are re-based on the (exact) fake Date.now():
 *     performance.now() = Date.now() - START_TIME + PERF_BASE, and rAF becomes a fake setTimeout to
 *     the next 16ms boundary of that timeline, called with that timestamp (same ordering rules as
 *     Playwright's own rAF timers, which are plain timers too).
 *  3. Things the fake clock does not control are flushed with `settle()`: it waits for
 *     document.fonts.ready (the frame gaps are re-measured once fonts settle) and for one
 *     IntersectionObserver delivery (the idea line only runs while #belt intersects; IO callbacks are
 *     real-time browser work, so we wait for them before stepping the clock again).
 *  4. A full-page screenshot in Chromium temporarily grows the viewport and then fires `resize`
 *     at the page, which would clear every canvas and re-run layouts. A capture-phase listener
 *     installed first swallows resize events while `holdResize` is on (`withResizeHeld`).
 *  5. CSS animations run on the document timeline (real time), which the fake clock does not drive:
 *     `freezeCssAnimations` pauses every one of them at a chosen currentTime.
 *  6. Viewport and deviceScaleFactor are fixed per project or spec (so devicePixelRatio is fixed),
 *     the site uses no web fonts, and Chromium runs with --disable-lcd-text (playwright.config.ts),
 *     so text pixels only depend on the machine's fonts.
 */
import type { BrowserContext, Page, Response } from '@playwright/test';

export const DEFAULT_SEED = 20261014;
/** an arbitrary fixed wall-clock start, so Date.now() is the same on every run */
export const START_TIME = new Date('2026-10-14T09:00:00Z').getTime();
/** what performance.now() reads when the clock is paused, as if the page took a second to load */
export const PERF_BASE = 1000;
/** how long before START_TIME the fake clock is installed (see makeDeterministic) */
const CLOCK_INSTALL_LEAD = 3_600_000;

declare global {
  interface Window {
    __deterministic?: { holdResize: boolean; heldResizes: number; resizes: number };
  }
}

interface InitArgs {
  seed: number;
  noClipboard: boolean;
  rejectClipboard: boolean;
}

/** runs in the page before any of its scripts */
function initScript({ seed, noClipboard, rejectClipboard }: InitArgs): void {
  let a = seed >>> 0;
  Math.random = function mulberry32(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const state = { holdResize: false, heldResizes: 0, resizes: 0 };
  window.__deterministic = state;
  window.addEventListener(
    'resize',
    (e) => {
      state.resizes++;
      if (!state.holdResize) return;
      state.heldResizes++;
      e.stopImmediatePropagation();
    },
    true,
  );
  if (noClipboard) Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => undefined });
  if (rejectClipboard) {
    // the API exists but refuses, as when permission is denied or the document is not focused
    const refuse = (): Promise<never> => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
    const clipboard = { writeText: refuse, write: refuse, readText: refuse, read: refuse };
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => clipboard });
  }
}

export interface DeterministicOptions {
  seed?: number;
  /** remove navigator.clipboard, like an old or insecure browser */
  noClipboard?: boolean;
  /** keep navigator.clipboard, but every call rejects with NotAllowedError (permission refused) */
  rejectClipboard?: boolean;
  /** requestAnimationFrame timestamps lag this many ms behind performance.now(). Real browsers pass
   *  the frame's start time, which can be earlier than a performance.now() read moments before
   *  (e.g. at init, while a long script was still running). Default 0. */
  rafLag?: number;
}

/** runs after Playwright's clock script: re-bases performance.now and rAF on the fake Date */
function timelineScript({ start, base, lag }: { start: number; base: number; lag: number }): void {
  const now = (): number => Date.now() - start + base;
  const fakeSetTimeout = window.setTimeout.bind(window);
  const fakeClearTimeout = window.clearTimeout.bind(window);
  Object.defineProperty(window.performance, 'now', { configurable: true, value: now });
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    fakeSetTimeout(() => cb(now() - lag), 16 - (now() % 16));
  window.cancelAnimationFrame = (id: number): void => fakeClearTimeout(id);
  const stamp = Symbol('timeStamp');
  Object.defineProperty(Event.prototype, 'timeStamp', {
    configurable: true,
    get(this: Event & { [stamp]?: number }) {
      return (this[stamp] ??= now());
    },
  });
}

/** seeds Math.random and pauses a fake clock. call once per context, before the first goto. */
export async function makeDeterministic(context: BrowserContext, page: Page, opts: DeterministicOptions = {}): Promise<void> {
  await context.addInitScript(initScript, {
    seed: opts.seed ?? DEFAULT_SEED,
    noClipboard: opts.noClipboard ?? false,
    rejectClipboard: opts.rejectClipboard ?? false,
  });
  // install lets time flow; pausing at START_TIME then freezes it at the same instant on every run.
  // pauseAt must lie in the future of the running fake clock, so install well before it: with a
  // one-second lead, a busy machine taking longer than that between the two calls failed with
  // "Cannot fast-forward to the past". The lead itself never reaches a page: this context's pages
  // replay the clock log on load, which sets the paused time directly (and the real delay that
  // leaks into performance.now's ticks is re-based by timelineScript below).
  await page.clock.install({ time: START_TIME - CLOCK_INSTALL_LEAD });
  await page.clock.pauseAt(START_TIME);
  await context.addInitScript(timelineScript, { start: START_TIME, base: PERF_BASE, lag: opts.rafLag ?? 0 });
}

/** navigates, insists on a 200, and waits until the page's scripts and observers have run */
export async function visit(page: Page, path: string): Promise<Response> {
  const response = await page.goto(path, { waitUntil: 'load' });
  if (!response || response.status() !== 200) {
    const body = response ? await response.text() : 'no response';
    throw new Error(`GET ${path} -> ${response?.status() ?? '?'}: ${body}`);
  }
  await settle(page);
  return response;
}

/** waits for work the fake clock does not drive: font loading and IntersectionObserver delivery */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve) => {
        const io = new IntersectionObserver(() => {
          io.disconnect();
          resolve();
        });
        io.observe(document.documentElement);
      });
    }
  });
}

/** steps the fake clock, firing every timer and animation frame on the way. settles first, so input
 *  that was just sent (Chromium delivers pointer moves with the next rendered frame) lands before
 *  the clock moves, and again after. */
export async function advance(page: Page, ms: number): Promise<void> {
  await settle(page);
  if (ms > 0) await page.clock.runFor(ms);
  await settle(page);
}

/** jumps the clock; due timers fire at most once (cheap way to sit idle for a long time) */
export async function skip(page: Page, ms: number): Promise<void> {
  await settle(page);
  await page.clock.fastForward(ms);
  await settle(page);
}

/** fakes a tab switch: document.hidden flips and visibilitychange fires */
export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** pauses every CSS animation (and transition) on the page at the same point of its own timeline */
export async function freezeCssAnimations(page: Page, ms: number): Promise<number> {
  return page.evaluate((t) => {
    const all = document.getAnimations();
    for (const a of all) {
      a.pause();
      a.currentTime = t;
    }
    return all.length;
  }, ms);
}

/**
 * Runs `fn` (a full-page capture) with resize events kept from the page's own listeners, so the
 * temporary viewport growth does not clear canvases or re-run layouts. Throws if one got through.
 */
export async function withResizeHeld<T>(page: Page, fn: () => Promise<T>): Promise<T> {
  const hold = (on: boolean) =>
    page.evaluate((h) => {
      const state = window.__deterministic;
      if (!state) throw new Error('deterministic init script missing');
      state.holdResize = h;
      return state.resizes - state.heldResizes;
    }, on);
  const leakedBefore = await hold(true);
  try {
    return await fn();
  } finally {
    await settle(page); // the capture's resize event is delivered (and swallowed) in the next frame
    const leakedAfter = await hold(false);
    if (leakedAfter !== leakedBefore) throw new Error('a resize event reached the page during the full-page capture');
  }
}
