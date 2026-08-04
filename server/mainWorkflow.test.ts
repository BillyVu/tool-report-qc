import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/main.yml', import.meta.url);

test('main workflow verifies code and creates releases for the VPS watcher', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*-\s*main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /docker compose config/);
  assert.match(workflow, /gh release create "\$RELEASE_TAG"/);
  assert.match(workflow, /--target "\$GITHUB_SHA"/);
  assert.match(workflow, /tool-report-qc-release-updater\.timer/);
});
