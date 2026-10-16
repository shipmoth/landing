/** Read once at startup: changing the OS setting takes effect on the next load. */
export const reducedMotion: boolean = matchMedia('(prefers-reduced-motion: reduce)').matches;
