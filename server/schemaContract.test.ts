import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDirectory = new URL('./migrations/', import.meta.url);

function allMigrationSql() {
  return readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(migrationsDirectory.pathname, file), 'utf8'))
    .join('\n');
}

test('inspection job schema supports admin list and frontend template ids', () => {
  const sql = allMigrationSql();

  assert.match(sql, /export_count/i);
  assert.match(sql, /last_exported_at/i);
  assert.match(sql, /ALTER\s+TABLE\s+inspection_jobs\s+ALTER\s+COLUMN\s+template_id\s+TYPE\s+text/i);
});
