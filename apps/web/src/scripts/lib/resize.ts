/** Waits this long after the last resize event before re-laying out (ms). */
const SETTLE_MS = 120;

/**
 * Calls `layout` once the window has stopped resizing, for layouts too costly to redo every event.
 * Also when the device pixel ratio changes without a resize (a window dragged to a screen of
 * another density): canvases size their backing store, and choose glyphs or blocks, by it.
 */
export function onResizeSettled(layout: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(layout, SETTLE_MS);
  };
  addEventListener('resize', schedule);
  // a resolution query matches only the current ratio: when it stops matching, re-arm for the new one
  (function watchRatio(): void {
    const mq = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    mq.addEventListener('change', () => { schedule(); watchRatio(); }, { once: true });
  })();
}
