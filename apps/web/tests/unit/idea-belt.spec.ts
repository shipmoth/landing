import { expect, test } from '@playwright/test';
import { addCrate, beltEnd, createBelt, renderBelt, ROWS, stampX, step } from '../../src/scripts/lib/idea-belt';
import type { Belt, Crate, Ideas } from '../../src/scripts/lib/idea-belt';
import { seedRandom } from './seeded-random';

const IDEAS: Ideas = {
  weird: ['umbrella that texts you', 'keys that beep back', 'lost sock matchmaker'],
  normal: ['another to-do app', 'find my charger', 'printer that just works', 'dark mode for dark mode'],
};

let restoreRandom: () => void = () => {};
test.beforeEach(() => { restoreRandom = seedRandom(1234); });
test.afterEach(() => restoreRandom());

function beltOf(width: number, ideas: Ideas = IDEAS): Belt {
  const belt = createBelt(ideas);
  belt.width = width;
  addCrate(belt);
  return belt;
}

/** Steps the belt `steps` times and reports every crate that left it, and how. */
function run(belt: Belt, steps: number, check: (belt: Belt) => void = () => {}): Crate[] {
  const gone: Crate[] = [];
  for (let i = 0; i < steps; i++) {
    const before = belt.crates.slice();
    step(belt);
    check(belt);
    for (const c of before) if (!belt.crates.includes(c)) gone.push(c);
  }
  return gone;
}

/** The text of the rendered belt: tags dropped, entities decoded. */
function text(html: string): string {
  return html.replace(/<\/?span[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

test('QA ships every weird idea and bins every normal one, and the counters agree', () => {
  const belt = beltOf(60);
  const [shippedBefore, binnedBefore] = [belt.shipped, belt.binned];
  const gone = run(belt, 4000);
  const shipped = gone.filter((c) => c.weird);
  const binned = gone.filter((c) => !c.weird);
  expect(shipped.length).toBeGreaterThan(20);
  expect(binned.length).toBeGreaterThan(40);
  for (const c of shipped) {
    expect(c.verdict).toBe('ok');
    expect(c.x).toBeGreaterThan(belt.width);       // rolled off the far edge
  }
  for (const c of binned) {
    expect(c.verdict).toBe('no');
    expect(c.fall).toBe(4);                        // dropped into the bin first
  }
  expect(belt.shipped).toBe(shippedBefore + shipped.length);
  expect(belt.binned).toBe(binnedBefore + binned.length);
});

test('nothing gets past the stamp unjudged, and a verdict never changes', () => {
  const belt = beltOf(72);
  const verdicts = new Map<Crate, string>();
  run(belt, 3000, (b) => {
    for (const c of b.crates) {
      if (c.x > stampX(b) + 2) expect(c.verdict, `crate "${c.label}" at x=${c.x}`).not.toBeNull();
      const seen = verdicts.get(c);
      if (seen) expect(c.verdict).toBe(seen);
      else if (c.verdict) verdicts.set(c, c.verdict);
    }
  });
  expect(verdicts.size).toBeGreaterThan(50);
});

test('a crate the stamp missed (the belt shrank under it) is still judged as it passes', () => {
  const belt = beltOf(72);
  while ((belt.crates[0]?.x ?? 0) < 25) step(belt);
  const crate = belt.crates[0];
  expect(crate?.verdict).toBeNull();               // still short of the stamp at 39
  belt.width = 30;                                 // the stamp is now at 16, behind it
  step(belt);
  expect(crate?.verdict).toBe(crate?.weird ? 'ok' : 'no');
});

test('the stamp stops the line for six steps when a crate is centred under it', () => {
  const belt = beltOf(60);
  const stamp = stampX(belt);
  const centred = (c: Crate): boolean => c.x + Math.floor((c.label.length + 4) / 2) === stamp;
  while (!belt.crates.some(centred)) step(belt);
  const crate = belt.crates.find(centred);
  expect(crate?.verdict).toBeNull();
  const x = crate?.x;
  const drops: number[] = [];
  for (let i = 0; i < 6; i++) {
    step(belt);
    drops.push(belt.stampDrop);
    expect(crate?.x).toBe(x);                      // nothing moves while the stamp is down
  }
  expect(drops).toEqual([1, 1, 2, 2, 1, 0]);
  expect(crate?.verdict).toBe(crate?.weird ? 'ok' : 'no');
  step(belt);
  expect(crate?.x).toBe((x ?? 0) + 1);             // and then the belt moves on
});

test('a weird idea comes after every two or three normal ones', () => {
  const belt = createBelt(IDEAS);
  const runs: number[] = [];
  let normals = 0;
  for (let i = 0; i < 400; i++) {
    addCrate(belt);
    const crate = belt.crates[belt.crates.length - 1];
    if (crate?.weird) { runs.push(normals); normals = 0; } else normals++;
  }
  expect(new Set(runs)).toEqual(new Set([2, 3]));
});

test('each deck deals every idea once before it is reshuffled', () => {
  const belt = createBelt(IDEAS);
  for (let i = 0; i < 60; i++) addCrate(belt);
  const labels = (weird: boolean): string[] => belt.crates.filter((c) => c.weird === weird).map((c) => c.label);
  for (const [dealt, deck] of [[labels(true), IDEAS.weird], [labels(false), IDEAS.normal]] as const) {
    for (let i = 0; i + deck.length <= dealt.length; i += deck.length) {
      expect(dealt.slice(i, i + deck.length).sort()).toEqual(deck.slice().sort());
    }
  }
});

test('long ideas are cut to fit the belt, ending in an ellipsis', () => {
  const ideas = (label: string): Ideas => ({ weird: [label], normal: [label] });
  const label = (width: number, idea: string): string | undefined => beltOf(width, ideas(idea)).crates[0]?.label;
  // the label may take width - 22 characters, but never fewer than 10
  expect(label(72, 'x'.repeat(50))).toBe('x'.repeat(50));
  expect(label(72, 'x'.repeat(51))).toBe('x'.repeat(49) + '…');
  expect(label(30, 'abcdefghijklmnop')).toBe('abcdefghi…');
  expect(label(30, 'abcdefghij')).toBe('abcdefghij');
  // a new crate starts just off the left end of the belt
  expect(beltOf(30, ideas('abcdefghijklmnop')).crates[0]?.x).toBe(-14);
});

test('the render is ROWS lines of exactly the belt width, with ideas escaped', () => {
  const tricky: Ideas = { weird: ['<b>moth</b> & co'], normal: ['a < b > c'] };
  for (const width of [30, 47, 72]) {
    const belt = beltOf(width, tricky);
    for (let i = 0; i < 400; i++) {
      step(belt);
      const html = renderBelt(belt, i * 130);
      expect(html.replace(/<\/?span[^>]*>/g, '')).not.toMatch(/[<>]/);   // only our own tags
      const lines = text(html).split('\n');
      expect(lines).toHaveLength(ROWS);
      for (const line of lines) expect(line).toHaveLength(width);
    }
  }
});

test('the render draws the stamp, its flapping moth, the belt, its rollers and the bin', () => {
  const belt = beltOf(60);
  const lines = (now: number): string[] => text(renderBelt(belt, now)).split('\n');
  const x = stampX(belt);
  expect(lines(0)[0]?.slice(x - 2, x + 3)).toBe('__|__');
  expect(lines(0)[1]?.slice(x - 1, x + 2)).toBe('}o{');
  expect(lines(180)[1]?.slice(x - 1, x + 2)).toBe(')o(');
  expect(lines(360)[1]?.slice(x - 1, x + 2)).toBe('|o|');
  expect(lines(720)[1]?.slice(x - 1, x + 2)).toBe('}o{');
  const end = beltEnd(belt);
  expect(lines(0)[5]?.slice(end + 1, end + 8)).toBe('| bin |');
  expect(lines(0)[5]?.slice(0, end)).toMatch(/^(?:-=)+-?$|^(?:=-)+=?$/);
  expect(lines(0)[4]?.slice(end + 1, end + 8)).toBe('|     |');
  expect(lines(0)[6]?.slice(end + 1, end + 8)).toBe("'-----'");
  expect(lines(0)[6]?.slice(0, end)).toMatch(/^(?: \([o0]\)  )+ *$/);   // rollers every 6 columns under it
});

test('crates are drawn with their verdict and in their own colour class', () => {
  const belt = createBelt(IDEAS);
  belt.crates = [
    { x: 2, label: 'ship this one', weird: true, verdict: 'ok', fall: 0 },
    { x: 20, label: 'binme', weird: false, verdict: 'no', fall: 0 },
    { x: 40, label: 'hmm', weird: false, verdict: null, fall: 0 },
    { x: 50, label: 'abcd', weird: false, verdict: 'no', fall: 0 },
  ];
  const html = renderBelt(belt, 0);
  const rows = text(html).split('\n');
  expect(rows[2]?.slice(2, 19)).toBe('+-[shipped]-----+');
  expect(rows[3]?.slice(2, 19)).toBe('| ship this one |');
  expect(rows[4]?.slice(2, 19)).toBe('+---------------+');
  expect(rows[2]?.slice(20, 29)).toBe('+-[nope]+');           // a tag that only just fits
  expect(rows[2]?.slice(40, 47)).toBe('+-----+');             // not judged yet: no tag
  expect(rows[2]?.slice(50, 58)).toBe('+------+');            // judged, but the tag would not fit
  expect(html).toContain('<span class="ok">| ship this one |</span>');
  expect(html).toContain('<span class="no">| </span><span class="lab">binme</span><span class="no"> |</span>');
  expect(html).toContain('<span class="k">| </span><span class="lab">hmm</span><span class="k"> |</span>');
});

test('a binned crate tips over the end of the belt and sinks into the bin', () => {
  const belt = createBelt(IDEAS);
  const end = beltEnd(belt);
  const crate: Crate = { x: end - 3, label: 'binme', weird: false, verdict: 'no', fall: 0 };
  belt.crates = [crate];
  const binnedBefore = belt.binned;
  const falls: number[] = [];
  while (belt.crates.includes(crate)) {
    step(belt);
    falls.push(crate.fall);
    if (crate.fall === 1) {
      // one row down, the lid slid right and the base left: tipping over the edge
      const rows = text(renderBelt(belt, 0)).split('\n');
      expect(rows[3]?.slice(crate.x + 1, crate.x + 10)).toBe('+-[nope]+');
      expect(rows[4]?.slice(crate.x, crate.x + 9)).toBe('| binme |');
      expect(rows[5]?.slice(crate.x - 1, crate.x + 8)).toBe('+-------+');
    }
  }
  expect(falls).toEqual([0, 1, 2, 3, 4]);
  expect(belt.binned).toBe(binnedBefore + 1);
});
