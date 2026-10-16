/** Waits this long after the last resize event before re-laying out (ms). */
const SETTLE_MS = 120;

/** Calls `layout` once the window has stopped resizing, for layouts too costly to redo every event. */
export function onResizeSettled(layout: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(layout, SETTLE_MS);
  });
}
