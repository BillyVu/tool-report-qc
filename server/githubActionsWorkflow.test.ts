import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url);

test('deploy workflow automatically deploys main commits to the VPS after verification', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*-\s*main/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /docker compose config/);
  assert.match(workflow, /secrets\.VPS_SSH_KEY/);
  assert.match(workflow, /secrets\.VPS_HOST/);
  assert.match(workflow, /secrets\.VPS_APP_DIR/);
  assert.match(workflow, /git reset --hard/);
  assert.match(workflow, /\$\{GITHUB_SHA\}/);
  assert.match(workflow, /docker compose up -d --build/);
  assert.match(workflow, /curl --fail http:\/\/127\.0\.0\.1:3020\/api\/health/);
});
