/**
 * End-to-end tests of the Docker image: nginx serving the built site with content negotiation
 * (tests/nginx). The global setup builds and starts the compose stack from the repository root
 * (`docker compose up -d --build --wait`) and stops it afterwards, so this needs Docker but no
 * local build.
 *
 *   pnpm test:nginx                       # from the repository root (through turbo)
 *   pnpm -C apps/web exec playwright test -c playwright.nginx.config.ts --grep curl
 *
 * Env
 *   NGINX_TEST_PORT   host port for the stack under test (default 8089, bound to 127.0.0.1); the
 *                     compose project is `shipmoth-nginx-test`, so a `docker compose up` of your
 *                     own on 8080 is left alone
 *   NGINX_SITE_DIR    serve this folder instead of the site built into the image (through
 *                     docker/compose.site.yaml), e.g. a hand-made fixture
 *   NGINX_COMPOSE_FILES  extra compose files to layer on top (separated by the OS path delimiter),
 *                     e.g. one that mounts a modified nginx config
 *   NGINX_KEEP=1      leave the stack running after the tests
 *   NGINX_BASE_URL    test an already running server instead (no docker; the image checks skip)
 *
 * Without a working `docker compose` every test skips with the reason (printed once).
 */
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/nginx/env';

export default defineConfig({
  testDir: './tests/nginx',
  testMatch: /\.spec\.ts$/,
  globalSetup: './tests/nginx/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: process.env['CI'] ? 2 : 4,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env['CI'] ? [['list']] : [['line']],
  outputDir: './test-results/nginx',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
});
