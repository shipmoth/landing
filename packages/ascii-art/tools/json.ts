import type { CompactArt } from '../src/index.ts';

/** Stable, diff-friendly JSON: one art row per line. */
export function formatCompact(art: CompactArt): string {
  const rows = art.rows.map((row) => JSON.stringify(row)).join(',\n');
  return `{"v":${art.v},"w":${art.w},"h":${art.h},\n"palette":${JSON.stringify(art.palette)},\n"rows":[\n${rows}\n],\n"colors":${JSON.stringify(art.colors)}}\n`;
}
