import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import type { AstroIntegration, ViteUserConfig } from 'astro';
import { builtPages, plainPages } from './src/build/plain-pages';

/** A Vite plugin object (vite itself is not a direct dependency of this package). */
type Plugin = Extract<NonNullable<ViteUserConfig['plugins']>[number], { name: string }>;

/**
 * Oldest browsers the output must keep working in (see the README). The source sticks to syntax
 * these support, so mostly this stops the minifiers rewriting it into newer forms: with Vite's
 * default (Safari 16.4+), Lightning CSS turns `@media (max-width:480px)` into `(width<=480px)`,
 * which Safari before 16.4 ignores outright. With it, Lightning CSS also expands a few newer
 * properties (`inset`, `margin-inline`, `clamp()`) into equivalents Safari 14.0 understands.
 */
const BROWSERS = ['chrome87', 'edge87', 'firefox78', 'safari14', 'ios14'];
/**
 * Lightning CSS's `Features.LightDark` (lightningcss is not a direct dependency, hence the number).
 * For old targets it pairs every `color-scheme` with two custom properties that only matter to
 * `light-dark()`, which the stylesheet never uses.
 */
const LIGHT_DARK = 1 << 20;

/** The bundled <script> of a page, e.g. `/src/pages/about.astro?astro&type=script&index=0&lang.ts`. */
const PAGE_SCRIPT = /\/src\/pages\/([\w-]+)\.astro\?astro&type=script/;
/** The tag this plugin adds to every module a page's script pulls in. */
const PAGE_TAG = /[?&]page=([\w-]+)/;
/**
 * Only script modules are tagged. Rolldown's native JSON plugin does not accept a query
 * (`hero.json?page=index` is parsed as JavaScript and fails), so a JSON file, like any other
 * untagged module, must only ever be imported by one page; the bundle check below enforces it.
 */
const SCRIPT_FILE = /\.[cm]?[jt]s$/;

/** The page a module belongs to: from its tag, or for a page's own script, from its path. */
function pageOf(id: string): string | undefined {
  return (PAGE_TAG.exec(id) ?? PAGE_SCRIPT.exec(id.replaceAll('\\', '/')))?.[1];
}

/**
 * One self-contained script per page.
 *
 * Both pages import many of the same feature modules. Left alone, Rolldown moves those into a
 * shared chunk that each page script imports, and the browser only discovers that second request
 * after the first one arrives. Tagging each module with the page that imports it (`?page=index`)
 * makes the two module graphs disjoint, so every page gets one bundle with its own copy of the
 * shared code, which Astro can then inline into the page (see inlinePageScripts below).
 *
 * The tag is only an id suffix: Vite strips the query when it loads the file, so the code is
 * the same; Rolldown just sees two different modules. Should anything still end up shared (a
 * module type that cannot be tagged, a dynamic import), the build fails rather than quietly
 * shipping a second request.
 */
function oneScriptPerPage(): Plugin {
  return {
    name: 'shipmoth:one-script-per-page',
    apply: 'build',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    async resolveId(source, importer, options) {
      const page = importer && pageOf(importer);
      if (!page) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external || !SCRIPT_FILE.test(resolved.id)) return resolved;
      return { ...resolved, id: `${resolved.id}?page=${page}` };
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        const imports = [...file.imports, ...file.dynamicImports];
        if (!file.isEntry || imports.length) {
          const why = file.isEntry ? `imports ${imports.join(', ')}` : 'is shared by several pages';
          this.error(`${file.fileName} ${why}; every page must load exactly one self-contained script`);
        }
        // Astro copies the bundle verbatim into the page (see inlinePageScripts below)
        const unsafe = unsafeInHtml(file.code, (code) => this.parse(code));
        if (typeof unsafe === 'number') {
          this.error(`${file.fileName} has "</script" or "<!--" outside a string at offset ${unsafe}; it cannot be inlined`);
        }
        file.code = unsafe;
      }
    },
  };
}

/** What would end an inline <script> early (`</script`) or change how the rest of it is parsed (`<!--`). */
const HTML_UNSAFE = /<(?=\/script|!--)/gi;

interface Node {
  type: string;
  start: number;
  end: number;
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Partial<Node>).type === 'string';
}

/**
 * Makes a bundle safe to paste between <script> and </script>: every `<` that starts `</script`
 * or `<!--` becomes `\x3C`, which means the same thing inside a string, a regular expression or an
 * untagged template literal. Anywhere else (a tagged template's raw text, a comment, code) it
 * would not, so instead of the escaped code this returns the offset of the first such `<`.
 */
function unsafeInHtml(code: string, parse: (code: string) => unknown): string | number {
  const hits = [...code.matchAll(HTML_UNSAFE)].map((match) => match.index);
  if (!hits.length) return code;
  const literals: Node[] = [];
  (function collect(value: unknown, tagged: boolean): void {
    if (Array.isArray(value)) {
      for (const item of value) collect(item, tagged);
      return;
    }
    if (!isNode(value)) return;
    if (value.type === 'Literal' || (value.type === 'TemplateElement' && !tagged)) literals.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'object') collect(child, value.type === 'TaggedTemplateExpression' && key === 'quasi');
    }
  })(parse(code), false);
  // (after a backslash, `\x3C` would turn into an escaped backslash followed by "x3C")
  const outside = hits.find((at) => code[at - 1] === '\\' || !literals.some((node) => node.start < at && at < node.end));
  if (outside !== undefined) return outside;
  return code.replace(HTML_UNSAFE, '\\x3C');
}

/** A page bundle as emitted above, e.g. `_astro/about.Bx3kQ9.js`. */
const PAGE_BUNDLE = /(^|\/)_astro\/[\w-]+\.[\w-]+\.js$/;

/**
 * Lets Astro inline each page's bundle into its HTML (Astro only inlines a script that imports
 * nothing and is under `assetsInlineLimit`; every page bundle qualifies after the plugin above).
 * The page then needs no request beyond the HTML itself, and works from any sub-path or straight
 * from disk (file://). Other assets keep Vite's default limit.
 */
function inlinePageScripts(file: string): boolean | undefined {
  return PAGE_BUNDLE.test(file.replaceAll('\\', '/')) || undefined;
}

/** Anything in a built page that would make the browser fetch a script or a stylesheet. */
const EXTERNAL_ASSET = /<script\b[^>]*\ssrc=|<link\b[^>]*\srel="?(stylesheet|modulepreload)/i;

/** Fails the build if a page would still load its script or styles from a separate file. */
function selfContainedPages(): AstroIntegration {
  return {
    name: 'shipmoth:self-contained-pages',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const root = fileURLToPath(dir);
        for (const name of await builtPages(root)) {
          const html = await readFile(join(root, name), 'utf8');
          if (EXTERNAL_ASSET.test(html)) throw new Error(`${name} loads a script or stylesheet from a separate file; every page must be self-contained`);
        }
      },
    },
  };
}

// A fully static site: two self-contained pages, each with its stylesheet and its one bundled script inlined.
export default defineConfig({
  output: 'static',
  // clean URLs: dist/index.html and dist/about/index.html, served as / and /about/ (the nav's links
  // are relative, see src/layouts/links.ts). Each folder also gets index.md and index.txt.
  build: { format: 'directory', inlineStylesheets: 'always' },
  // lossless whitespace removal (keeps <pre> blocks and the spaces between inline elements)
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [selfContainedPages(), plainPages()],
  vite: {
    // the ascii art data ships as JSON.parse('…'), which parses faster than an object literal.
    // (Vite only stringifies when named exports are off; the art is imported as a default export.)
    json: { stringify: true, namedExports: false },
    css: { lightningcss: { exclude: LIGHT_DARK } },
    plugins: [oneScriptPerPage()],
    build: { cssTarget: BROWSERS, assetsInlineLimit: inlinePageScripts },
    environments: {
      // name each page's bundle after its page (_astro/index.[hash].js, as inlinePageScripts expects)
      client: {
        build: {
          target: BROWSERS,
          rolldownOptions: {
            output: {
              entryFileNames: (chunk) => `_astro/${(chunk.facadeModuleId && pageOf(chunk.facadeModuleId)) ?? chunk.name}.[hash].js`,
            },
          },
        },
      },
      // Build-time only. Vite externalises a dependency of the prerender bundle when its bare name
      // resolves from this folder, so a stray node_modules higher up the disk (e.g. in the user's
      // home) can supply an incompatible `cookie` 0.x. Bundling it keeps Astro's own copy.
      prerender: { resolve: { noExternal: ['cookie'] } },
    },
  },
});
