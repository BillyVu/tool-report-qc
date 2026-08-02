import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const composePath = new URL('../docker-compose.yml', import.meta.url);

test('qc-api is reachable from the existing Traefik public network', () => {
  const compose = readFileSync(composePath, 'utf8');

  assert.match(compose, /qc-api:\n(?:    .*\n)*?    container_name: tool-report-qc-app/);
  assert.match(compose, /qc-api:\n(?:    .*\n)*?    networks:\n(?:      .*\n)*?      - traefik_public/);
  assert.match(compose, /networks:\n(?:  .*\n)*?  traefik_public:\n(?:    .*\n)*?    external: true/);
});
