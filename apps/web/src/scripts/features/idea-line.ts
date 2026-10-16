/* ---------- the idea line: crates of half-baked ideas ride a belt past a QA stamp ----------
   most get stamped "nope" and drop into the bin at the end. now and then one gets "shipped"
   and rolls off the edge into the world.

   the belt itself (state, step, render to an html string) is lib/idea-belt.ts; this is the
   view: it measures the <pre>, draws into it and runs the timer. */

import { addCrate, createBelt, renderBelt, step } from '../lib/idea-belt';
import type { Ideas } from '../lib/idea-belt';
import { reducedMotion } from '../lib/motion';

/* ---------- ideas (edit freely) ---------- */

// the strange ones. QA always ships these.
const WEIRD = [
  'umbrella that texts you', 'group chat that ends itself', 'auto-reply: i am a moth',
  'plant that asks for water', 'lost sock matchmaker', 'unsend for spoken words',
  'doorbell that screens guests', 'playlist for awkward silences',
  'captcha for your own fridge', 'alarm that bribes you', 'neighbour noise translator',
  'tab closer with feelings', 'pet translator (beta)', 'bus that admits it is late',
  'fridge inventory by vibes', 'moth-proof jumper tracker',
  'sock pairing as a service', 'reminder to drink water, rudely',
  'keys that beep back', 'calendar that says no for you', 'to-do list that does one',
  'wardrobe weather oracle', 'auto-mute for loud chewers', '"on my way" that means it',
  'gps for the remote', 'tupperware lid finder', 'smart fridge, dumber guilt',
  'ticket for the slow lift'
];

// the sensible ones. QA always bins these.
const NORMAL = [
  'another to-do app', 'notes app, but with folders', 'a slightly faster calendar',
  'dashboard for dashboards', 'ai that summarises ai', 'dark mode for dark mode',
  'find my charger', 'wifi password sharer', 'fridge that orders milk',
  'parking spot predictor', 'queue skipper for the dmv', 'split the bill, no maths',
  'receipt that files itself', 'leftovers recipe roulette', 'one tap to call mum',
  'tl;dr for terms and conditions', 'printer that just works',
  'pre-filled forms for everything', 'return-it-for-me button',
  'plant sitter on demand', 'boarding pass that finds you',
  'birthday reminder with gift', 'one password, zero resets', 'pizza split calculator',
  'dmv appointment sniper', 'queue that holds your place',
  'charger that remembers you', 'recipe that skips the story',
  'lost and found for earbuds', 'cab that waits politely',
  'meeting summary in 3 words', 'unsubscribe from everything',
  'parking meter that texts', 'email that writes the reply',
  'uber for borrowing a ladder', 'alarm with a snooze budget',
  'meeting that could be an email', 'shoelace untangle service',
  'laundry fold-o-meter', 'roommate chore roulette'
];

const IDEAS: Ideas = { weird: WEIRD, normal: NORMAL };

/* ---------- settings ---------- */

const TICK = 130;        // ms per step
const MIN_WIDTH = 30;    // belt width in characters, clamped to this range
const MAX_WIDTH = 72;

/** How many characters fit across the belt's <pre>. */
function measureWidth(pre: HTMLElement): number {
  const probe = document.createElement('span');
  probe.textContent = 'MMMMMMMMMM';
  pre.appendChild(probe);
  const cw = probe.getBoundingClientRect().width / 10;
  pre.removeChild(probe);
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(pre.clientWidth / cw)));
}

export function initIdeaLine(): void {
  const pre = document.getElementById('belt');
  const shippedEl = document.getElementById('shipped');
  const binnedEl = document.getElementById('binned');
  if (!pre || !shippedEl || !binnedEl) return;
  const belt = createBelt(IDEAS);

  const render = (): void => {
    pre.innerHTML = renderBelt(belt, Date.now());
    shippedEl.textContent = String(belt.shipped);
    binnedEl.textContent = String(belt.binned);
  };

  belt.width = measureWidth(pre);
  // start mid-shift: a few crates already on the line
  addCrate(belt);
  for (let i = 0; i < belt.width * 1.5; i++) step(belt);
  render();
  addEventListener('resize', () => {
    belt.width = measureWidth(pre);
    render();
  });
  if (reducedMotion) return;
  // only run while the footer is on screen
  let visible = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      const latest = entries[0];
      if (latest) visible = latest.isIntersecting;
    }).observe(pre);
  } else {
    visible = true;
  }
  setInterval(() => {
    if (visible && !document.hidden) {
      step(belt);
      render();
    }
  }, TICK);
}
