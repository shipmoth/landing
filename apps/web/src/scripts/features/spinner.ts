/* ---------- spinner ---------- */

import { reducedMotion } from '../lib/motion';

const FRAMES = '|/-\\';
const SPIN_MS = 240;

export function initSpinner(): void {
  const spin = document.getElementById('spin');
  if (!spin || reducedMotion) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % FRAMES.length;
    spin.textContent = FRAMES.charAt(i);
  }, SPIN_MS);
}
