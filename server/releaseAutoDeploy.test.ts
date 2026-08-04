import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const scriptPath = new URL('../scripts/release-auto-deploy.sh', import.meta.url);
const servicePath = new URL('../deploy/systemd/tool-report-qc-release-updater.service', import.meta.url);
const timerPath = new URL('../deploy/systemd/tool-report-qc-release-updater.timer', import.meta.url);

test('release updater scans GitHub Releases and deploys only new tags', () => {
  const script = readFileSync(scriptPath, 'utf8');

  assert.match(script, /api\.github\.com\/repos\/\$\{REPO\}\/releases/);
  assert.match(script, /INCLUDE_PRERELEASE/);
  assert.match(script, /parse_json_field tag_name/);
  assert.match(script, /parse_json_field tarball_url/);
  assert.match(script, /STATE_FILE/);
  assert.match(script, /latest_tag" = "\$current_tag/);
  assert.match(script, /flock -n 9/);
  assert.match(script, /Authorization: Bearer/);
  assert.match(script, /create_github_deployment/);
  assert.match(script, /\/deployments/);
  assert.match(script, /\/statuses/);
  assert.match(script, /in_progress/);
  assert.match(script, /success/);
  assert.match(script, /find "\$APP_DIR" -mindepth 1 -maxdepth 1 ! -name \.env -exec rm -rf/);
  assert.match(script, /docker compose -p "\$COMPOSE_PROJECT" up -d --build/);
  assert.match(script, /curl --fail "\$INTERNAL_HEALTH_URL"/);
  assert.match(script, /curl --fail --silent --show-error "\$PUBLIC_HEALTH_URL"/);
  assert.doesNotMatch(script, /git reset --hard/);
});

test('release updater is installed as a recurring systemd timer', () => {
  const service = readFileSync(servicePath, 'utf8');
  const timer = readFileSync(timerPath, 'utf8');

  assert.match(service, /EnvironmentFile=-\/etc\/tool-report-qc-release-updater\.env/);
  assert.match(service, /ExecStart=\/opt\/tool-report-qc\/scripts\/release-auto-deploy\.sh/);
  assert.match(timer, /OnUnitActiveSec=10min/);
  assert.match(timer, /Persistent=true/);
  assert.match(timer, /WantedBy=timers\.target/);
});
