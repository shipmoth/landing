/**
 * Tiny static file server used by Playwright's `webServer`.
 *
 *   node tests/support/serve.ts <root> <port>
 *
 * Fixed, boring response headers: no caching, no compression (so the throttled-network test in
 * e2e/layout-shift.spec.ts sees the real byte counts), a fixed content type per extension. Query
 * strings are ignored. A folder is served by its index.html (`/about/`); without the trailing
 * slash it redirects there first, as web servers do, so the page's relative links resolve inside
 * the folder. (The production server is nginx, tested by tests/nginx.)
 *
 * A missing root is not fatal: the server still starts and answers every request with a 404 whose
 * body explains what is missing, so the specs fail with a readable message instead of a
 * connection error.
 *
 * Runs directly on Node 22's built-in type stripping, so it only uses erasable TypeScript syntax.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const COMMON_HEADERS = {
  'Cache-Control': 'no-store, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
};

const [rootArg, portArg] = process.argv.slice(2);
if (!rootArg || !portArg) {
  console.error('usage: node tests/support/serve.ts <root> <port>');
  process.exit(2);
}
const root = resolve(rootArg);
const port = Number(portArg);

function resolveFile(urlPath: string): string | null {
  let path = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) return null; // no escaping the root
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return file;
}

/** `/about` -> `/about/` when that is a folder with an index.html */
function folderRedirect(urlPath: string): string | null {
  const path = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  if (path.endsWith('/')) return null;
  const dir = normalize(join(root, path));
  if (dir !== root && !dir.startsWith(root + sep)) return null;
  return existsSync(join(dir, 'index.html')) && statSync(dir).isDirectory() ? `${path}/` : null;
}

const server = createServer((req, res) => {
  res.sendDate = false; // keep headers identical across runs
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, COMMON_HEADERS).end();
    return;
  }
  // The health check Playwright polls before running tests.
  if (req.url === '/__health') {
    res.writeHead(200, { ...COMMON_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('ok');
    return;
  }
  const redirect = folderRedirect(req.url ?? '/');
  if (redirect) {
    res.writeHead(301, { ...COMMON_HEADERS, Location: redirect }).end();
    return;
  }
  const file = resolveFile(req.url ?? '/');
  if (!file) {
    const why = existsSync(root) ? `not found: ${req.url}` : `root directory does not exist: ${root}`;
    res.writeHead(404, { ...COMMON_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end(why);
    return;
  }
  const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { ...COMMON_HEADERS, 'Content-Type': type, 'Content-Length': statSync(file).size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root}${existsSync(root) ? '' : ' (missing!)'} on http://127.0.0.1:${port}`);
});
