// Writes sample.ans: a small 24-bit .ans exercising every parsing rule of ans2js.py.
// sample.ans2js.js next to it is what the original Python converter, ans2js.py (which
// tools/ans.ts ports), wrote for this sample.ans. It is a fixed golden reference: the tests check
// tools/ans2json.ts against it. ans2js.py is not part of this repository, so if this script
// changes, sample.ans2js.js has to be regenerated with that tool, not with ours.
import { writeFileSync } from 'node:fs';
const E = '\x1b[';
const fg = (r, g, b) => `${E}38;2;${r};${g};${b}m`;
let rainbow = '';
for (let i = 0; i < 80; i++) rainbow += fg(i % 2 ? 250 - i : i, (i * 37) % 256, (i * 91) % 256) + '#';
const lines = [
  '      ',                                                     // blank lines at the top are dropped
  `${E}0m   ${E}m`,                                             // ...even when they only hold SGR codes
  `   ${fg(200, 30, 10)}^^  ${fg(10, 2, 7)}..${E}0m    `,       // coloured trailing spaces, reset, trailing spaces
  `  ${E}1;38;2;255;0;10m&<>"'${E}48;2;0;5;0m\\/${E}38;2;10;20;30;48;2;9;9;9m\t|`, // bold+fg, bg only (its 0s are not resets), fg+bg, escapes
  '',                                                           // empty line in the middle survives
  `    ${fg(7, 7, 7)}█▓░ ${fg(255, 226, 170)}x  y${E}38;5;196mz`,   // BMP glyphs, spaces join the run before them, 256-colour ignored
  `  ${E}38;5;0m  ${fg(1, 2, 3)}q${E}38;2;0;0;12;1mw`,            // 38;5;0 resets via its 0; colour then attribute
  `  ${rainbow}`,                                               // big palette jumps (escape codes)
  `${E}0m      `,                                               // blank lines at the bottom are dropped
  '   ',
];
writeFileSync(new URL('./sample.ans', import.meta.url), lines.join('\r\n').replace('\r\n\r\n', '\r\n\n') + '\n');
