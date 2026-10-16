/* ---------- ascii frames: real "+", "-" and "|" characters around every box ----------
   boxes are transparent so the light and the moths show through. a title set into an edge
   (like "[ lride ]") gets a gap in the line exactly its width, instead of a black patch. */

import { withoutAltText } from '../lib/css-content';

const BOX_SELECTOR = 'main .prod, main .mate, main .wall figure, main .flow li';
const TOP_SELECTOR = ':scope > h2, :scope > h3';
const BOTTOM_SELECTOR = ':scope > p:last-child, :scope > .tag, :scope > figcaption';

// far more characters than any box needs; the frame is clipped by the box itself
const DASH = '-'.repeat(400);
const PIPE = '|\n'.repeat(160);

/** One horizontal edge: corner, line, a gap sized to the title, line, corner. */
function edge(cls: string): string {
  return '<span class="' + cls + '"><i>+</i><span class="ab-h ab-hl">' + DASH + '</span><span class="ab-gap"></span>' +
         '<span class="ab-h">' + DASH + '</span><i>+</i></span>';
}

function frameHtml(): string {
  return edge('ab-t') + edge('ab-b') + '<span class="ab-l">' + PIPE + '</span><span class="ab-r">' + PIPE + '</span>';
}

function gapWidth(el: Element | null): string {
  return el ? el.getBoundingClientRect().width + 'px' : '0px';
}

/** The flowchart number is a ::before, so measure its text with a stand-in element. */
function numberWidth(li: Element, probe: HTMLSpanElement): string {
  const cs = getComputedStyle(li, '::before');
  // (only the outer quotes are stripped, so the probe measures `[ " 00 " ]`, inner quotes and all:
  // the gap comes out a little wider than the number, which is the look the frames are drawn for)
  probe.textContent = withoutAltText(cs.content || '').replace(/^"|"$/g, '').replace(/counter\(.*?\)/, '00') || '[ 00 ]';
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:' + cs.fontSize + ';padding:' + cs.padding;
  li.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  li.removeChild(probe);
  return w + 'px';
}

export function initAsciiFrames(): void {
  const boxes = document.querySelectorAll(BOX_SELECTOR);
  if (!boxes.length) return;
  const html = frameHtml();
  const probe = document.createElement('span');

  function measure(): void {
    boxes.forEach((box) => {
      const frame = box.querySelector<HTMLElement>(':scope > .ab');
      if (!frame) return;
      const top = box.matches('.flow li') ? numberWidth(box, probe) : gapWidth(box.querySelector(TOP_SELECTOR));
      frame.style.setProperty('--gt', top);
      frame.style.setProperty('--gb', gapWidth(box.querySelector(BOTTOM_SELECTOR)));
    });
  }

  boxes.forEach((box) => {
    const frame = document.createElement('span');
    frame.className = 'ab';
    frame.setAttribute('aria-hidden', 'true');
    frame.innerHTML = html;
    box.insertBefore(frame, box.firstChild);
  });
  document.documentElement.classList.add('ascii');
  measure();
  addEventListener('resize', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
}
