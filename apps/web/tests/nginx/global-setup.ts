/**
 * Builds and starts the compose stack for tests/nginx, and returns the teardown that stops it.
 * Without Docker it does not fail the run: it records the reason in SKIP_ENV (workers inherit the
 * environment) and every spec skips with it.
 */
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { existsSync, mkdirSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, COMPOSE_ARGS, COMPOSE_ENV, EXTERNAL_BASE_URL, HTML_ONLY_PATH, SITE_DIR, SKIP_ENV, TXT_ONLY_PATH } from './env';

function docker(args: string[], options: Omit<SpawnSyncOptionsWithStringEncoding, 'encoding'> = {}) {
  return spawnSync('docker', args, { cwd: REPO_ROOT, env: COMPOSE_ENV, ...options, encoding: 'utf8' });
}

/** why the stack cannot run here, or undefined if it can */
function dockerProblem(): string | undefined {
  const compose = docker(['compose', 'version'], { timeout: 30_000 });
  if (compose.error || compose.status !== 0) return 'the `docker compose` command is not available';
  // (`docker info` exits 0 even when it cannot reach the engine)
  const info = docker(['version', '--format', '{{.Server.Version}}'], { timeout: 30_000 });
  if (info.error || info.status !== 0 || !info.stdout.trim()) return `the Docker engine is not reachable (${(info.stderr || String(info.error)).trim().split('\n')[0]})`;
  return undefined;
}

export default async function globalSetup(): Promise<(() => Promise<void>) | void> {
  if (EXTERNAL_BASE_URL) {
    console.log(`[nginx] testing ${EXTERNAL_BASE_URL} (NGINX_BASE_URL); not starting the compose stack`);
    return;
  }
  const problem = dockerProblem();
  if (problem) {
    const message = `skipping the nginx tests: ${problem}. They need Docker with Compose v2.`;
    console.warn(`[nginx] ${message}`);
    process.env[SKIP_ENV] = message;
    return;
  }

  // A read-only bind mount (NGINX_SITE_DIR) cannot get the fallback pages mounted into it unless the
  // mountpoints already exist. Create them for the run (empty), remove them afterwards.
  const siteDir = SITE_DIR;
  const madeMountpoints = siteDir
    ? [HTML_ONLY_PATH, TXT_ONLY_PATH].map((path) => resolve(siteDir, `.${path}`)).filter((dir) => !existsSync(dir))
    : [];
  for (const dir of madeMountpoints) mkdirSync(dir, { recursive: true });

  const down = async () => {
    if (process.env['NGINX_KEEP'] === '1') {
      console.log(`[nginx] NGINX_KEEP=1: leaving the stack running (docker ${COMPOSE_ARGS.join(' ')} down)`);
      return;
    }
    docker([...COMPOSE_ARGS, 'down', '--remove-orphans', '--timeout', '5'], { stdio: 'ignore' });
    for (const dir of madeMountpoints) rmdirSync(dir);
  };

  // (output kept for the error below; a fresh image build takes about a minute)
  console.log(`[nginx] docker ${[...COMPOSE_ARGS, 'up', '-d', '--build', '--wait'].join(' ')}`);
  const start = () =>
    docker([...COMPOSE_ARGS, 'up', '-d', '--build', '--wait', '--wait-timeout', '120'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60_000,
    });
  let up = start();
  // the build resolves the base image tags on Docker Hub every time; ride out one network hiccup
  if (up.status !== 0 && /failed to (authorize|resolve|fetch|do request)|TLS|timeout/i.test(up.stderr)) {
    console.warn('[nginx] docker compose up failed on the registry, retrying once');
    up = start();
  }
  if (up.status !== 0) {
    const logs = docker([...COMPOSE_ARGS, 'logs', '--no-color', '--tail', '50']);
    await down();
    throw new Error(`docker compose up failed (exit ${up.status ?? up.error}).\n${up.stdout ?? ''}${up.stderr ?? ''}\n${logs.stdout ?? ''}${logs.stderr ?? ''}`);
  }
  return down;
}
