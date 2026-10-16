/**
 * Where the stack under test lives, shared by playwright.nginx.config.ts, the global setup and the
 * specs. See playwright.nginx.config.ts for the env variables.
 */
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

export const PORT = Number(process.env['NGINX_TEST_PORT'] ?? 8089);
/** an already running server to test instead of starting the compose stack */
export const EXTERNAL_BASE_URL = process.env['NGINX_BASE_URL']?.replace(/\/$/, '');
export const BASE_URL = EXTERNAL_BASE_URL ?? `http://127.0.0.1:${PORT}`;
export const SITE_DIR = process.env['NGINX_SITE_DIR'] ? resolve(REPO_ROOT, process.env['NGINX_SITE_DIR']) : undefined;

export const PROJECT = 'shipmoth-nginx-test';
export const SERVICE = 'nginx';

/** a page with only index.html, mounted into the docroot by compose.test.yaml (the fallback test) */
export const HTML_ONLY_PATH = '/__html-only/';

const extraFiles = (process.env['NGINX_COMPOSE_FILES'] ?? '').split(delimiter).filter(Boolean);

/** `docker compose` arguments selecting the stack under test */
export const COMPOSE_ARGS: string[] = [
  'compose',
  '-p', PROJECT,
  '-f', resolve(REPO_ROOT, 'compose.yaml'),
  // the host port (an explicit -f stops compose loading the override by itself)
  '-f', resolve(REPO_ROOT, 'compose.override.yaml'),
  ...(SITE_DIR ? ['-f', resolve(REPO_ROOT, 'docker', 'compose.site.yaml')] : []),
  '-f', resolve(dirname(fileURLToPath(import.meta.url)), 'compose.test.yaml'),
  ...extraFiles.flatMap((file) => ['-f', resolve(file)]),
];

/** environment for every `docker compose` call (the compose files read these) */
export const COMPOSE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  NGINX_PORT: `127.0.0.1:${PORT}`,
  ...(SITE_DIR ? { NGINX_SITE_DIR: SITE_DIR } : {}),
  NGINX_TEST_FIXTURES: FIXTURES,
};

/** set by the global setup when the stack cannot run; every spec skips with it */
export const SKIP_ENV = 'NGINX_E2E_SKIP';
