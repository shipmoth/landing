/**
 * The container itself: config test, non-root, read-only filesystem, and what is in it. (Health is
 * checked by the global setup: `docker compose up --wait` fails unless the healthcheck passes.)
 */
import { test, expect } from '@playwright/test';
import { compose, requireCompose } from './support';
import { SERVICE, SITE_DIR } from './env';

requireCompose();

const exec = (...command: string[]) => compose(['exec', '-T', SERVICE, ...command]);

test('nginx -t passes without warnings', async () => {
  const result = exec('nginx', '-t');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toContain('test is successful');
  expect(result.stderr).not.toContain('[warn]');
});

test('runs as an unprivileged user', async () => {
  const result = exec('sh', '-c', 'id -u; ps -o user= -o comm= | sort -u');
  expect(result.status, result.stderr).toBe(0);
  const [uid, ...processes] = result.stdout.trim().split('\n');
  expect(uid).toBe('101');
  // master and workers alike (`user comm` per line; the check below must see nginx itself)
  const nginx = processes.map((l) => l.trim()).filter((l) => /\snginx$/.test(l));
  expect(nginx.length, result.stdout).toBeGreaterThan(0);
  for (const line of nginx) expect(line).toMatch(/^(nginx|101)\s/);
});

test('the root filesystem is read-only; /tmp is a tmpfs', async () => {
  const write = exec('sh', '-c', 'touch /usr/share/nginx/html/x');
  expect(write.status).not.toBe(0);
  expect(write.stderr).toMatch(/read-only/i);
  const tmp = exec('sh', '-c', "awk '$2 == \"/tmp\" { print $3 }' /proc/mounts");
  expect(tmp.stdout.trim()).toBe('tmpfs');
});

test('the image holds nginx and the built site only', async () => {
  expect(exec('sh', '-c', 'command -v node || command -v npm || command -v pnpm').stdout.trim()).toBe('');
  const files = exec('find', '/usr/share/nginx/html', '-type', 'f').stdout.trim().split('\n');
  expect(files.length).toBeGreaterThan(0);
  // built output (pages and their md / txt / ansi, images, the gz copies): no sources, maps or manifests
  for (const file of files) expect(file).toMatch(/\.(html|md|txt|ansi|svg|png|jpe?g|webp|avif|ico|gz)$/);
  // and every page has all four versions
  for (const page of ['/usr/share/nginx/html/index', '/usr/share/nginx/html/about/index']) {
    for (const ext of ['html', 'md', 'txt', 'ansi']) expect(files, `${page}.${ext}`).toContain(`${page}.${ext}`);
  }
});

test('every text file has a precompressed copy for gzip_static', async () => {
  test.skip(!!SITE_DIR, "NGINX_SITE_DIR replaces the image's files");
  const missing = exec(
    'sh', '-c',
    'find /usr/share/nginx/html -type f "(" -name "*.html" -o -name "*.md" -o -name "*.txt" -o -name "*.ansi" -o -name "*.svg" ")" ' +
      '-not -path "*/__html-only/*" -not -path "*/__txt-only/*" | while read -r f; do [ -f "$f.gz" ] || echo "$f"; done',
  );
  expect(missing.status, missing.stderr).toBe(0);
  expect(missing.stdout.trim()).toBe('');
});
