/* ---------- typewriter ---------- */

import { HOME_TAGLINE } from '../../content/taglines';
import { reducedMotion } from '../lib/motion';

const DEFAULT_LINE = HOME_TAGLINE;
const CHAR_MS = 36;
const PERIOD_MS = 300;   // a beat after each full stop

export function initTypewriter(): void {
  const typed = document.getElementById('typed');
  if (!typed) return;
  // a page can set its own line with data-line="..."
  const line = typed.dataset.line || DEFAULT_LINE;
  // (both paths below replace the whole content of #typed, including the <noscript> copy of the
  // line the page prints for visitors without JavaScript, on the first call)
  if (reducedMotion) {
    typed.textContent = line;
    return;
  }
  type(typed, line, 0);
}

function type(el: HTMLElement, line: string, count: number): void {
  el.textContent = line.slice(0, count);
  if (count < line.length) {
    setTimeout(() => type(el, line, count + 1), line.charAt(count) === '.' ? PERIOD_MS : CHAR_MS);
  }
}
