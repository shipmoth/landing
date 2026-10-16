# shipmoth

Brand site for shipmoth and its three products: lride, lwatch, lglow. Black screen, one
monospace face, one column; the colour lives in the ascii drawings.

The site is static: [Astro](https://astro.build) renders two HTML pages at build time and the
browser runs a little vanilla TypeScript (no framework, no web fonts).

## Why a monorepo

The ascii art is going to be served outside the browser too: a terminal / `curl shipmoth.com`
API is planned (a future `apps/api`). So the art data and its decoder live in their own
framework-free, DOM-free package that both the site and that API can import.

    apps/web              the website (Astro, static output)
    packages/ascii-art    @shipmoth/ascii-art: compact ANSI art data, decoder, .ans converter

pnpm workspaces + turborepo. Node 22.18 or newer (the test server and tools run TypeScript directly via Node's type stripping).

## Commands

    pnpm install
    pnpm dev                      # dev server on http://localhost:4321
    pnpm build                    # everything; the site lands in apps/web/dist
    pnpm typecheck
    pnpm test                     # unit tests: packages/ascii-art and the site's DOM-free modules
    pnpm test:e2e                 # builds the site, then Playwright: behaviour, a11y, visual snapshots
    pnpm test:nginx               # the Docker image: nginx and its content negotiation (needs Docker)

    pnpm -C apps/web build        # just the site
    pnpm -C apps/web preview      # serve the built site
    pnpm -C apps/web test:unit    # just the site's unit tests
    pnpm -C apps/web test:e2e:update   # re-record the visual snapshots (see Tests)

`pnpm typecheck` runs TypeScript 7 (`tsc`) over every package's `.ts` files, tests and configs included.
The frontmatter of `.astro` files is not typechecked: that needs `astro check` (`@astrojs/check`),
which does not support TypeScript 7 yet (0.9.10 has a peer dependency on `typescript ^5 || ^6`).
Keep logic in `.ts` modules and the frontmatter down to imports and props.

`dist/` is self-contained, with clean URLs: each page is a folder with one `index.html` (its CSS
and its script inlined) and the same page as `index.md` and `index.txt` (see *Markdown and plain
text* below), plus `favicon.svg` at the root:

    dist/index.html  index.md  index.txt          /
    dist/about/index.html  index.md  index.txt    /about/
    dist/favicon.svg

Every URL in it is relative (the nav links `./`, `about/` and `../`, from `src/layouts/links.ts`), so
it works from any host and from a sub-path (`example.com/shipmoth/`). Each page also renders
straight from disk (open `dist/index.html` or `dist/about/index.html`), but over `file://` the nav
does not take you to the other page: a folder link opens the browser's directory listing, since
only a web server turns `about/` into `about/index.html`. That is the accepted price of clean URLs;
the `file://` tests open each page by its file.

## Layout of the site

    apps/web/
      astro.config.ts           static build: dist/index.html, dist/about/index.html, CSS and the
                                one bundled script per page inlined; browser targets
      public/favicon.svg
      src/
        pages/index.astro       home page
        pages/about.astro       about page: light hero, the crew, the lab photo wall
        layouts/Base.astro      <head>, swarm canvas, header, and the idea line footer
        layouts/links.ts        the relative links between the pages (and to the favicon)
        components/             Header, IdeaLine (footer), Contact, MailCopy, GoalTile,
                                ProductCard, CrewCard, LabTile
        content/                the repeated copy as typed data: home.ts (goals, products,
                                flowchart steps), about.ts (crew, lab photos), bios.ts (crew bios),
                                taglines.ts (the typewriter lines)
        art/portraits/*.html    the crew's coloured ascii self-portraits
        styles/global.css       colour tokens and all layout (one stylesheet)
        scripts/pages/          one entry per page: calls the features it needs, in order
        scripts/features/       one module per behaviour, each exporting a single init…()
        scripts/lib/            shared helpers (reduced motion, the ascii light, the idea belt,
                                moth frames, html escaping)
        build/                  build time only: the markdown and plain-text versions of each
                                page (plain-pages.ts is the Astro integration; see below)
      tests/                    Playwright suites (see Tests)

Both pages share most feature modules, but each page's bundle carries its own copy instead of
importing a shared chunk, so a page never waits on a second script (see `astro.config.ts`).

## Editing

- **Copy.** One-off paragraphs sit in `src/pages/*.astro`. Anything with a repeated shape is
  data in `src/content/`: the three "what we go after" tiles, the product cards, the flowchart
  steps, the crew and the lab photos. Each box sets its colour with a token (`'y'`, `'v'`, `'p'`,
  `'t'`), which becomes `--c` in its style attribute. The typewriter lines under the heroes are in
  `src/content/taglines.ts`: the home page's is the typewriter's default, the about page sets its
  own with `data-line` on `#typed`. Both pages also print their line in a `<noscript>` there.
- **Crew bios.** Each person's lines are `BIOS` in `src/content/bios.ts`. The first one is printed
  in the html (the no-JavaScript default); on load `scripts/features/crew.ts` swaps in a random one.
- **Product links.** The `[ open lride ]` style links point at their own section. Set `href` on
  each product in `src/content/home.ts` when the real URLs exist.
- **Signup form.** It only prints a reply locally. Point the submit handler in
  `src/scripts/features/contact.ts` at your mailing-list provider, and give the form a real
  `action` (`method="post"`); then the rule hiding it without JavaScript in `layouts/Base.astro`
  can go.
- **Ascii art in data files** is written one quoted string per line (`art('…', '…')`), so trailing
  spaces survive editors that trim whitespace. Escape backslashes as `\\`.
- **Hero moth and wordmark.** Convert a 24-bit colour .ans file to the package's compact JSON
  (then update the room kept for them in `global.css` if the art's size changed; see *Without
  JavaScript / slow connections* below):

      cd packages/ascii-art
      node --experimental-strip-types tools/ans2json.ts ~/Downloads/some-art.ans src/data/hero.json
      node --experimental-strip-types tools/ans2json.ts ~/Downloads/some-word.ans src/data/wordmark.json

- **Moths.** The wingbeat drawing is `MOTH_FRAMES` in `src/scripts/lib/moth.ts` (used by the
  swarm, the crew orbit and the stamp on the idea line). `COLOURS` in `features/swarm.ts` is the
  palette the swarm picks from. A page can ask for fewer moths with `data-moths` on `<body>` (the
  about page passes `moths="0.35"` to the layout).
- **The ascii light** (press and hold anywhere): glyphs (`RAMP`), colour stops and grid size
  (`CELL_W`, `CELL_H`) are at the top of `src/scripts/lib/ascii-light.ts`.
- **Wordmark mouse response**: `RADIUS`, `PUSH`, `SPRING` and `DAMP` at the top of
  `src/scripts/features/wordmark.ts`; the `RIPPLE_` settings beside them control the soft rings
  that pass through the letters while hovering.

## Easter eggs

- **Idle moth.** After 30 seconds without input, one moth lands on a word in the text and rests
  there, flapping slowly, until the visitor moves. `IDLE_MS` in `features/swarm.ts`.
- **Tab title.** Switching tabs changes the title to "come back, the moth misses you"
  (`features/tab-title.ts`).
- **The idea line.** The footer conveyor carries half-baked ideas past a QA stamp. Edit `WEIRD`
  (always shipped) and `NORMAL` (always binned) in `features/idea-line.ts` to change the crates;
  `WEIRD_EVERY` in `lib/idea-belt.ts` sets how often a weird one comes along.

## About page

- **Hero.** Four moths (one per person) circle the swirling ascii light; hovering a crew card makes
  that person's moth glow (`features/crew-orbit.ts`). The cards are shuffled on load and each gets
  a fresh bio line (`features/crew.ts`).
- **Crew portraits** are hidden for now: drop `hidden` on the "real photos soon" line and the
  `no-pics` class on the list in `src/pages/about.astro` (a comment marks the spot). Each card
  shows the ascii self-portrait in `src/art/portraits/<name>.html` (colours inline, as
  `<i style="color:#…">` spans). To use a photo, put it in `apps/web/public/img/` and, in
  `src/components/CrewCard.astro`, replace the `<pre>` inside `<div class="portrait art">` with
  an `<img>` such as `<img src="img/arjun.jpg" alt="Arjun">` (a comment there marks the spot).
  Photos show as 4:5 portraits.
- **The lab** photo wall is hidden for now: remove the wrapper `<div hidden>` in
  `src/pages/about.astro`. Tile n's photo is `public/img/lab-n.jpg`: in
  `src/components/LabTile.astro`, replace the `<pre>` inside `<div class="pic">` with the `<img>`
  (its caption doubles as the alt text). Tile shapes come from `ratio` in `src/content/about.ts`
  (4/5 portrait, 3/2 landscape, …).

## Ascii frames

Boxes (product cards, crew cards, photo tiles, flowchart steps) get a frame of real characters,
`+` corners with `-` and `|` edges, added by `src/scripts/features/ascii-frames.ts`. To frame a
new kind of box, add its selector to the list there and give the box `position: relative`.
Dividers (`<hr>` and the lines inside cards) are drawn with `-` and `|` characters in
`global.css`, so every line matches the page font. Without JavaScript the plain CSS borders stay
as a fallback.

## Markdown and plain text

Every page also exists as markdown (`index.md`, for agents and readers that want text/markdown) and
as plain text (`index.txt`, for `curl` and terminals), next to its `index.html`. A server can pick one
by the request's `Accept` header (or a curl User-Agent), so `/about/` stays the one URL for all three.
Each page's `<head>` points at both with `<link rel="alternate">`.

They are written at the end of the build (`astro:build:done`) by `src/build/plain-pages.ts`, from the
built html itself, so their copy cannot drift from the page:

- `build/read-page.ts` parses the html (htmlparser2) into a small model (`build/page-model.ts`):
  the title, description and header, and the headings, paragraphs, lists and `<pre>` blocks of
  `<main>` as a visitor without JavaScript reads them. It skips `[hidden]` and `aria-hidden`
  subtrees, scripts, styles, canvases, the signup form, `[ copy ]`, and what only the script fills
  in (the hero moth, the idea line and its caption: the same list as the `<noscript>` styles in
  `layouts/Base.astro`), plus links to their own section (`[ open lride ]`, until the products have
  URLs). The `.sr` h1 text and the `<noscript>` tagline are read. An element with no rule fails the
  build with its name: give new markup a rule there (one function per element kind).
- `build/markdown.ts`: CommonMark (plus GFM `~~strikethrough~~`), no front matter, no html. The h1,
  the tagline, the meta description as a quote, then the page; product cards are `###` under
  "off the line", steps are a numbered list with bold names, the address is a `mailto:` link, the
  signed message a fenced block. Links stay relative to the page (`../`, `about/`, `index.txt`).
- `build/plain-text.ts`: UTF-8, no escape codes, every line at most 80 columns (`WIDTH`), LF
  endings. A banner, `## ` headings like the site, numbered steps, labels in a column (before /
  after), the "what we go after" icons side by side, and links (relative to the page) at the end.
  A `<pre>` wider than 80 columns fails the build rather than wrapping.

The output is a pure function of the html, so it is byte-identical across builds. To look at it,
`pnpm -C apps/web build`, then open `apps/web/dist/index.md` and `apps/web/dist/about/index.md` in a
markdown viewer, and `cat apps/web/dist/index.txt` in an 80-column terminal.

## Docker / nginx

    docker compose up -d --build --wait    # http://localhost:8080 (NGINX_PORT=127.0.0.1:9000 to change)
    pnpm test:nginx                         # builds + starts the stack, runs Playwright + real curl, stops it

    curl http://localhost:8080/about/                               # curl -> plain text
    curl -H "Accept: text/markdown" http://localhost:8080/about/    # markdown
    curl -H "Accept: text/html" http://localhost:8080/about/        # html
    curl -I -H "Accept: text/markdown" http://localhost:8080/about/ # type + caching headers

One URL per page; nginx picks `index.html`, `index.md` or `index.txt` (`docker/nginx/default.conf`):

- `Accept: text/markdown` -> md, `text/plain` -> txt, `text/html` -> html. If several are listed the
  order is md, txt, html (q-values are ignored).
- Otherwise curl, wget and HTTPie get txt, and everything else (browsers, `*/*`, `application/json`)
  gets html; never a 406. A page without that file falls back to its `index.html`.
- Documents: `Content-Type` with `charset=utf-8`, `Cache-Control: no-cache` (revalidated with ETag /
  Last-Modified: one URL has several representations) and `Vary: Accept, User-Agent`. Files asked
  for by name (`/about/index.md`) are served as-is. The favicon is cached for a day.
- `/about` -> 301 `/about/`; the old site's `/about.html` and `/index.html` -> 301 to `/about/` and `/`.
- Image (`docker/web.Dockerfile`): built in `node:22-alpine`, served by `nginx-unprivileged`
  alpine-slim, about 19 MB, running as uid 101 on port 8080 with a read-only filesystem. Text files
  are precompressed (`gzip_static`). `/healthz` backs the healthcheck.
- Deploying (e.g. Coolify): `compose.yaml` publishes no host port, only `expose: 8080`; point the
  platform's domain/proxy at container port 8080. The host port for local use lives in
  `compose.override.yaml`, which a plain `docker compose up` loads automatically and
  `docker compose -f compose.yaml` (what platforms run) does not.
- Test env: `NGINX_TEST_PORT`, `NGINX_SITE_DIR` (serve a host folder, see `docker/compose.site.yaml`),
  `NGINX_COMPOSE_FILES`, `NGINX_KEEP=1` (leave the stack running).

## Browsers

The build targets Chrome/Edge 87+, Firefox 78+ and Safari/iOS 14+ (`BROWSERS` in
`apps/web/astro.config.ts`). That stops the minifiers from rewriting the code into newer syntax
(Vite's default would turn `@media (max-width:…)` into `(width<=…)`, which Safari before 16.4
ignores) and has Lightning CSS expand `inset`, `margin-inline` and `clamp()` for Safari 14.0.
It does not polyfill anything: a few decorative touches (`color-mix()` frame tints, container-unit
portrait sizing) need newer browsers and simply fall back there.

The narrowest screen supported is 320px wide (a 280px text column): from there up nothing is cut
off or sticks out of the column (`tests/e2e/layout.spec.ts` checks 300 to 1920px). Text wraps; the
`<pre>` lines that must not (the signed message, the flowchart's "back to 01" line) shrink their
type with the column below about 400px instead (`main` is their size container, `global.css`). The
wordmark's canvas is wider than the column, its art plus 70px of transparent room a side for the
letters the pointer pushes; that room spills into the page gutter, centred, and `html` clips it.

## Without JavaScript / slow connections

- *Without JavaScript* (`<noscript>` styles in `layouts/Base.astro`): the h1's "shipmoth" shows as
  the home page title in place of the wordmark canvas, and each page prints its tagline inside
  `#typed`. Things that only exist through the script are hidden instead of left blank: the hero
  moth (`#orbit`), the swarm and crew-orbit canvases (and their then untrue `aria-label`s), the
  idea line's caption and belt, `[ copy ]`, and the signup form with its paragraph and `#out`
  (with no `action`, it would submit as a GET and put the address in the URL). The address itself
  stays as text, and the boxes keep their css-border fallback. With JavaScript on, the
  `<noscript>` content is inert.
- *Before the script runs* (`global.css`): the hero moth, the wordmark and the crew orbit get
  their final room up front (`#orbit:empty`, `.title .word:not([style])`, `#crew:not([style])`),
  so the content does not jump down when they are drawn (cumulative layout shift on a slow
  connection: home 0.003, about 0.0001, against 0.171 and 0.042 without the room kept). Each rule
  stops matching once the script has drawn (it adds the `.stage`, or the inline size). The sizes
  are the scripts' formulas: hero height = `#orbit` width x `H` x 1.05 / (`W` x 0.6) with `W`,
  `H` = 314, 102 (the hero art) and `MAX_CELL` in `features/hero-moth.ts`; wordmark = min(`SHARE`
  80% of `.title`, `W` x `MAX_CELL` = 315 x 1.75px) wide at an aspect ratio of `W` x 0.6 : `H` x
  1.05 (art 315 x 34, `features/wordmark.ts`), where `.title` is the text column's width; crew =
  `MAX_WIDTH` and the 0.48 / 260-340px clamp in `features/crew-orbit.ts`. 0.6 is the monospace font's `M` advance per px of
  font size, which css cannot measure: exact for Menlo/SF Mono/DejaVu/Liberation, a slight
  undershoot for Consolas (0.55). Keep these numbers in sync when the art or those constants
  change; `tests/e2e/layout-shift.spec.ts` fails if the room kept drifts off.

## Tests

`pnpm test` runs the fast suites; `pnpm test:e2e` builds the site and runs Playwright in
Chromium; `pnpm test:nginx` tests the Docker image. Install the browser once with
`pnpm -C apps/web exec playwright install chromium` (add `firefox webkit` for `CROSS_BROWSER`).

- `packages/ascii-art/test` (`pnpm test`, `node:test`): the committed hero and wordmark JSON are
  in canonical form (decoding and re-encoding gives the same bytes) and trimmed like converter
  output; random art survives encode -> decode; malformed data is rejected; and
  `tools/ans2json.ts` turns `test/fixtures/sample.ans` into exactly what the original Python
  converter (`ans2js.py`) made of it (`sample.ans2js.js`, a fixed golden file).
- `apps/web/tests/unit` (`pnpm test`, Playwright runner, no browser): the DOM-free modules (ascii
  light, idea belt), the markdown / plain-text generator on small html fixtures, and
  `art-room.spec.ts`: the space `global.css` reserves for the hero moth and wordmark matches the
  art's size, so new art fails `pnpm test` until `global.css` is updated.
- `apps/web/tests/e2e` (project `chromium`, 1280x800 unless a spec says otherwise): behaviour of
  the built site: the canvases and their timing, the swarm and its lamp, the idle moth, the idea
  line, the crew, the forms and buttons, hover and selection colours, the CSS animations, layout
  at every width from 300 to 1920px (nothing cut off, the home hero centred on the column) and at
  each breakpoint, a resized window matching a fresh load,
  the pages over `file://`, with JavaScript off and over a throttled connection, and the built
  `index.md` / `index.txt` against their page.
- `apps/web/tests/a11y` (project `chromium`): axe (zero violations; the one accepted rule is
  listed with its nodes and reason in `axe.spec.ts`), keyboard order and focus indicators, and
  what Chromium's accessibility tree exposes.
- `apps/web/tests/visual` (project `visual`): a few screenshots compared pixel for pixel with
  committed baselines: the home page (top and full page) and the about page (full page) at
  1280x800 and at 390x844 @2x, the home page with reduced motion, and the about page with the
  lamp held down.
- `apps/web/tests/nginx` (`pnpm test:nginx`, its own config): the image, nginx's headers,
  redirects and content negotiation, in a browser and with real curl.

Every e2e, a11y and visual spec opens pages through `tests/support/deterministic-page.ts`:
`Math.random` is seeded and the clock is a paused fake one, stepped by the spec, so moths,
frames and pixels are the same on every run. The expected copy and timings live in
`tests/support/expected.ts`, written down independently of `src/`.

**Visual snapshots.** Baselines are per platform (`tests/visual/__snapshots__/<name>-<platform>.png`,
e.g. `-win32`), because fonts and text rasterisation differ between operating systems; the
committed ones were recorded on Windows. After a deliberate visual change, re-record and review
the diff:

    pnpm -C apps/web build
    pnpm -C apps/web test:e2e:update

On another OS, or in CI, record that platform's baselines the same way and commit them (a missing
baseline fails the test and writes the actual image), or run the suite inside the Playwright Docker
image (`mcr.microsoft.com/playwright:v1.64.0-noble`) so every machine renders like CI. When a
snapshot fails, the expected, actual and diff images are in `apps/web/test-results`.

`pnpm test:e2e` serves `apps/web/dist` itself (`tests/support/serve.ts`). Env:

    WEB_DIR          what to test as the site (default apps/web/dist), e.g. a deliberately
                     broken copy, to check that a spec notices
    WEB_PORT         port for the site (default 4610); give parallel runs their own port and --output
    CROSS_BROWSER=1  also run the e2e specs in Firefox and WebKit (slower)

e.g. `pnpm -C apps/web test:e2e tests/e2e/swarm.spec.ts`.
