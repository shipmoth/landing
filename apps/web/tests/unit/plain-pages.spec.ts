/**
 * The markdown and plain-text versions of a page (src/build), on small html fixtures shaped like
 * the built pages. The markdown is read back with a real CommonMark/GFM parser (marked), so
 * "renders as intended" is checked, not just "looks right".
 */
import { expect, test } from '@playwright/test';
import { DomUtils, parseDocument } from 'htmlparser2';
import { Lexer, marked, type Token } from 'marked';
import { plainVersions } from '../../src/build/plain-pages';

const HEADER = `<header class="top"><nav class="nav"><a href="./" aria-current="page">home</a> <span aria-hidden="true">/</span> <a href="about/">about</a></nav> <span class="dim"><span id="spin" aria-hidden="true">|</span> a small strap</span></header>`;

function html(main: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>a page</title><meta name="description" content="what it is about"><style>p{}</style></head><body><canvas id="swarm" aria-hidden="true"></canvas>${HEADER}<main>${main}</main><script>if (1 < 2) document.title = 'x'</script></body></html>`;
}

/** the terminal width the plain text promises (README: every line at most 80 columns) */
const WIDTH = 80;

const md = (main: string) => plainVersions(html(main)).md;
const txt = (main: string) => plainVersions(html(main)).txt;

/** the markdown rendered by marked, as text (what a reader of the rendered markdown sees) */
function renderedText(markdown: string): string {
  // (a hard break is a line break on screen; textContent alone would glue its two lines together)
  const rendered = parseDocument(marked.parse(markdown, { async: false }).replaceAll('<br>', '<br>\n'));
  return DomUtils.textContent(rendered).replace(/\s+/g, ' ').trim();
}

function tokens(markdown: string): Token[] {
  const all: Token[] = [];
  marked.walkTokens(Lexer.lex(markdown), (t) => void all.push(t));
  return all;
}

function headings(markdown: string): string[] {
  return tokens(markdown).flatMap((t) => (t.type === 'heading' ? [`h${t.depth} ${t.text}`] : []));
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

test.describe('what is read', () => {
  const main = `
    <section class="hero"><div id="orbit" role="img" aria-label="a moth"></div>
      <h1 class="title"><span class="sr">shipmoth</span><canvas class="word" aria-hidden="true"></canvas></h1>
      <p class="type"><span id="typed"><noscript>odd ideas in. less friction out.</noscript></span><span class="caret" aria-hidden="true">&#9612;</span></p>
    </section>
    <p hidden>a hidden line</p>
    <div hidden><p>a hidden wall</p></div>
    <p>shown <span aria-hidden="true">decoration</span>text</p>
    <noscript><p>a block for readers without scripts</p></noscript>
    <section id="contact"><h2>contact</h2><p>write to <b id="mail">hello@shipmoth.com</b> <button type="button" id="copy">[ copy ]</button></p>
      <p>sign up below.</p><form id="form"><label for="e">&gt;</label><input id="e"><button>[ subscribe ]</button></form><pre id="out"></pre></section>
    <footer><p class="dim belt-cap">the idea line &middot; <span id="shipped">0</span> shipped</p><pre id="belt" role="img" aria-label="a belt"></pre></footer>`;

  for (const [format, out] of [['markdown', () => renderedText(md(main))], ['plain text', () => flat(txt(main))]] as const) {
    test(`${format}: the .sr title and the noscript tagline are in, decoration and script-only parts are not`, () => {
      const text = out();
      expect(text).toContain('shipmoth');
      expect(text).toContain('odd ideas in. less friction out.');
      expect(text).toContain('shown text');
      expect(text).toContain('a block for readers without scripts');
      expect(text).toContain('write to hello@shipmoth.com');
      for (const gone of ['hidden line', 'hidden wall', 'decoration', '▌', '[ copy ]', 'subscribe', 'sign up below', 'idea line', 'shipped', '&gt;', 'document.title', 'p{}']) {
        expect(text, gone).not.toContain(gone);
      }
    });
  }

  test('the address becomes a mailto link in markdown', () => {
    expect(md(main)).toContain('write to [hello@shipmoth.com](mailto:hello@shipmoth.com)');
  });

  test('an element without a rule fails loudly instead of being dropped', () => {
    expect(() => md('<p>a <marquee>new</marquee> thing</p>')).toThrow(/no rule for <marquee>/);
    expect(() => md('<section><table><tr><td>x</td></tr></table></section>')).toThrow(/no rule for <table>/);
    expect(() => md('<section>loose words</section>')).toThrow(/loose text/);
  });
});

test.describe('markdown', () => {
  test('headings follow the html outline, product cards one level under their section', () => {
    const out = md('<h1>top</h1><section><h2>off the line</h2></section><section class="prod" id="a"><h2>lride</h2><p>x</p></section><ul class="crew"><li><h3>arjun</h3><p>bio</p></li></ul>');
    expect(headings(out)).toEqual(['h1 top', 'h2 off the line', 'h3 lride', 'h3 arjun']);
    // a list of cards (items with headings) reads as sections, not as list items
    expect(tokens(out).some((t) => t.type === 'list')).toBe(false);
  });

  test('lists: bullets, numbered steps with bold names, labels on their own line', () => {
    const out = md(`
      <ul class="feat"><li class="was"><span>before</span><s>the old way.</s></li><li class="now"><span>after</span>the new way.</li></ul>
      <ol class="flow"><li><b>find a friction</b><span>something slow.</span></li><li><b>fix it</b><span>small.</span></li></ol>
      <ul><li>plain <i>item</i></li></ul>`);
    expect(out).toContain('- before\\\n  ~~the old way.~~\n- after\\\n  the new way.');
    expect(out).toContain('1. **find a friction**\\\n   something slow.\n2. **fix it**\\\n   small.');
    expect(out).toContain('- plain *item*');
    const lists = tokens(out).filter((t): t is Extract<Token, { type: 'list' }> => t.type === 'list');
    expect(lists.map((l) => [l.ordered, l.items.length])).toEqual([[false, 2], [true, 2], [false, 1]]);
    expect(renderedText(out)).toContain('before the old way. after the new way. find a friction something slow.');
  });

  test('inline styling: emphasis, strong, links kept relative; links to their own section dropped', () => {
    const out = md(`<p>one helps you <i class="y">learn to drive</i>, <b>less time</b>, see <a href="../">home</a>.</p>
      <section class="prod" id="lride"><h2>lride</h2><p><a class="go" href="#lride">[ open lride ]</a></p></section>`);
    expect(out).toContain('one helps you *learn to drive*, **less time**, see [home](../).');
    expect(out).not.toContain('open lride');
  });

  test('text that looks like markdown stays text', () => {
    const tricky = [
      '# not a heading',
      '- not a list',
      '+ nor this',
      '1. not numbered',
      '2026) not either',
      '> not a quote',
      '--- not a rule',
      '= not an underline',
      'stars *a* and __b__ and `code` and ~~gone~~ and [x](y) and <b>tag</b> and a|b',
      'entities: &amp; &copy; &#169; stay as typed, and a \\ backslash',
    ];
    for (const line of tricky) {
      const escaped = line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const out = md(`<p>${escaped}</p>`);
      const [first] = Lexer.lex(out);
      expect(first?.type, line).toBe('paragraph');
      const inner: string[] = [];
      if (first) marked.walkTokens([first], (t) => void inner.push(t.type));
      // nothing but text and backslash escapes inside: no emphasis, code, link, html, …
      expect(inner.filter((type) => !['paragraph', 'text', 'escape'].includes(type)), line).toEqual([]);
      expect(renderedText(out), line).toContain(line);
    }
  });

  test('a <pre> becomes a fenced block whose fence outlasts any backticks inside', () => {
    const out = md('<pre class="dim signed">-----BEGIN-----\n  ``` inside\n<span class="mid"><i class="y">lride</i></span>\n-----END-----</pre>');
    expect(out).toContain('````\n-----BEGIN-----\n  ``` inside\nlride\n-----END-----\n````');
    const code = tokens(out).find((t) => t.type === 'code');
    expect(code?.type === 'code' && code.text).toBe('-----BEGIN-----\n  ``` inside\nlride\n-----END-----');
  });

  test('starts with the h1 and the tagline, quotes the description, ends with links to the rest', () => {
    const out = md('<h1>top</h1><p>tagline.</p><hr><p>body</p>');
    expect(out.startsWith('# top\n\ntagline.\n\n> what it is about\n\n---\n\nbody\n\n---\n\n')).toBe(true);
    expect(out.endsWith('pages: [home](./) · [about](about/)\n\nthis page as [html](./) or [plain text](index.txt)\n')).toBe(true);
    expect(tokens(out).some((t) => t.type === 'html')).toBe(false);
  });
});

test('two rules around a skipped section read as one, in both versions', () => {
  const main = '<p>before</p><hr><section hidden><p>gone</p></section><hr><p>after</p>';
  expect(md(main)).toContain('> what it is about\n\n---\n\nafter');   // (the description goes before the first rule)
  expect(txt(main)).toContain(`before\n\n${'-'.repeat(WIDTH)}\n\nafter`);
});

test.describe('plain text', () => {
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');

  test(`is hard-wrapped at ${WIDTH} columns, keeping every word, with hanging indents`, () => {
    const out = txt(`<h2>${long}</h2><p>${long}</p><ul><li>${long}</li></ul><ol><li><b>step</b><span>${long}</span></li></ol><p>${'x'.repeat(200)}</p>`);
    const lines = out.split('\n');
    for (const line of lines) expect([...line].length, line).toBeLessThanOrEqual(WIDTH);
    expect(flat(out)).toContain(`## ${long}`);
    expect(flat(out)).toContain(long);
    expect(out).toContain('x'.repeat(WIDTH));
    // continuation lines line up under the text, not under the marker
    const bullet = lines.findIndex((l) => l.startsWith('- word0'));
    expect(lines[bullet + 1]).toMatch(/^ {2}word/);
    const step = lines.findIndex((l) => l === '01  step');
    expect(lines[step + 1]).toMatch(/^ {4}word0 /);
    expect(lines[step + 2]).toMatch(/^ {4}word/);
  });

  test('looks like the site: banner, ## headings, numbered steps, labels in a column, icons side by side', () => {
    const out = txt(`<h1>top</h1><section><h2>what we go after</h2><ul class="gofor">
      <li><pre class="ico" aria-hidden="true">.___.\n \\ / </pre> <b>time</b> <span class="meter" aria-hidden="true">[##]</span> <span class="txt">slow tabs.</span></li>
      <li><pre class="ico" aria-hidden="true">+--+\n|  |</pre> <b>space</b> <span class="txt">five apps.</span></li></ul></section>
      <ul class="feat"><li class="was"><span>before</span><s>the old way.</s></li><li class="now"><span>after</span>the new way.</li></ul>
      <ol class="flow"><li><b>find a friction</b><span>something slow.</span></li></ol>`);
    const lines = out.split('\n');
    expect(lines[0]).toBe(`+${'-'.repeat(WIDTH - 2)}+`);
    expect(lines[1]).toMatch(/^\| \}o\{ {2}a page +a small strap \|$/);
    expect(lines[1]).toHaveLength(WIDTH);
    expect(lines).toContain('# top');
    expect(lines).toContain('## what we go after');
    // the two icons, centred in two 40-column halves
    expect(lines).toContain(`${' '.repeat(17)}.___.${' '.repeat(36)}+--+`);
    expect(lines).toContain('  time    slow tabs.');
    expect(lines).toContain('  space   five apps.');
    expect(lines).toContain('  before   the old way.');
    expect(lines).toContain('  after    the new way.');
    expect(out).toContain('01  find a friction\n    something slow.');
    expect(out).not.toContain('[##]');
    expect(out).not.toContain('|  a small strap'); // the spinner glyph is decoration
  });

  test('is plain: no markup, no escapes, no ANSI, LF lines, one trailing newline', () => {
    const out = txt('<h1>top</h1><p>a <b>bold</b> and <i>em</i> and <s>gone</s> and <a href="../">home</a> &amp; *stars* [x]</p><pre>  keep   spacing</pre>');
    expect(out).toContain('a bold and em and gone and home (../) & *stars* [x]');
    expect(out).toContain('\n    keep   spacing\n');
    expect(out).not.toMatch(/<\/?[a-z]|&[a-z]+;|\x1b|\r/);
    expect(out.endsWith('\n') && !out.endsWith('\n\n')).toBe(true);
    for (const line of out.split('\n')) expect(line).toBe(line.trimEnd());
  });

  test(`uses the full ${WIDTH} columns, and not one more`, () => {
    const fits = `${'a'.repeat(WIDTH - 2)} b`;
    const over = `${'a'.repeat(WIDTH - 1)} b`;
    expect(txt(`<p>${fits}</p>`)).toContain(`\n${fits}\n`);
    expect(txt(`<p>${over}</p>`)).toContain(`\n${'a'.repeat(WIDTH - 1)}\nb\n`);
  });

  test('a <pre> too wide for the terminal fails the build instead of wrapping', () => {
    expect(() => txt(`<pre>${'#'.repeat(WIDTH)}</pre>`)).toThrow(/wider than 80 columns/);
  });

  test('ends with where to go: the pages, the markdown version, the html', () => {
    const out = txt('<p>x</p>');
    expect(out.endsWith('  home       ./ (this page)\n  about      about/\n  markdown   index.md (or ask for text/markdown)\n  html       ./ (what a browser gets)\n')).toBe(true);
  });
});
