/* ---------- about page: shuffle the team so nobody is always first, and give each a fresh line ---------- */

import { BIOS, type CrewName } from '../../content/bios';

function isName(name: string | null): name is CrewName {
  return name !== null && Object.prototype.hasOwnProperty.call(BIOS, name);
}

/** Fisher-Yates, in place. */
function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    const a = items[i] as T;
    const b = items[k] as T;
    items[i] = b;
    items[k] = a;
  }
}

function pickLine(lines: readonly string[]): string {
  return lines[(Math.random() * lines.length) | 0] ?? '';
}

export function initCrew(): void {
  const team = document.querySelector('.crew');
  if (!team) return;
  const kids = [...team.children];
  shuffle(kids);
  kids.forEach((el) => team.appendChild(el));
  // the line in the html stays as the no-js default: the first of that person's BIOS options
  kids.forEach((el) => {
    const name = el.getAttribute('data-name');
    const bio = el.querySelector('.bio');
    if (isName(name) && bio) bio.textContent = pickLine(BIOS[name]);
  });
}
