/**
 * Converts a 24-bit colour .ans file to the compact JSON form (successor of ans2js.py).
 * usage: node --experimental-strip-types tools/ans2json.ts input.ans output.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ansToCompact } from './ans.ts';
import { formatCompact } from './json.ts';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node --experimental-strip-types tools/ans2json.ts input.ans output.json');
  process.exit(2);
}
// like ans2js.py: invalid UTF-8 becomes U+FFFD and a BOM is kept as a character
const src = new TextDecoder('utf-8', { ignoreBOM: true }).decode(readFileSync(input));
const art = ansToCompact(src);
const json = formatCompact(art);
writeFileSync(output, json);
console.log(output, 'lines', art.h, 'width', art.w, 'colours', art.palette.length / 6, 'bytes', Buffer.byteLength(json));
