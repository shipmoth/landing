/**
 * How the compose files resolve, asked of `docker compose config` itself. compose.yaml alone is what
 * deployment platforms run (`docker compose -f compose.yaml`, e.g. Coolify): it must publish no host
 * port, because the platform's proxy routes to the container and may already hold :8080 on the host.
 * A plain `docker compose up` in the repository also loads compose.override.yaml, which publishes it.
 */
import { spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { requireCompose } from './support';
import { REPO_ROOT, SERVICE } from './env';

requireCompose();

interface Port { target: number; published?: string }
interface Service { ports?: Port[]; expose?: string[] }

/** the resolved nginx service for these compose arguments, with NGINX_PORT unset */
function resolved(files: string[]): Service {
  const env = { ...process.env };
  delete env['NGINX_PORT'];
  const result = spawnSync('docker', ['compose', ...files.flatMap((f) => ['-f', f]), 'config', '--format', 'json'], {
    cwd: REPO_ROOT, env, encoding: 'utf8', timeout: 60_000,
  });
  expect(result.status, result.stderr).toBe(0);
  const service = (JSON.parse(result.stdout) as { services: Record<string, Service> }).services[SERVICE];
  expect(service, `no ${SERVICE} service`).toBeDefined();
  return service as Service;
}

test('compose.yaml on its own publishes no host port, and exposes 8080 to the network', async () => {
  const service = resolved(['compose.yaml']);
  expect(service.ports ?? []).toEqual([]);
  expect(service.expose).toContain('8080');
});

test('a plain `docker compose` in the repository publishes the site on host port 8080', async () => {
  const service = resolved([]);
  expect(service.ports?.map((p) => [p.published, p.target])).toEqual([['8080', 8080]]);
});
