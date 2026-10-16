/** Colour tokens from styles/global.css that a box can take as its accent (`--c`). */
export type Colour = 'y' | 'v' | 'p' | 't';

/** The inline style that hands a box its accent colour, e.g. `--c:var(--y)`. */
export function accent(colour: Colour): string {
  return `--c:var(--${colour})`;
}

/**
 * Joins ascii art lines for a <pre>. Writing art as one quoted string per line keeps
 * trailing spaces visible and safe from editors that trim whitespace.
 */
export function art(...lines: string[]): string {
  return lines.join('\n');
}
