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

test('photo type schema supports configurable active options with idempotent seed', () => {
  const sql = allMigrationSql();

  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+photo_type_options/i);
  assert.match(sql, /is_system\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i);
  assert.match(sql, /is_active\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+true/i);
  assert.match(sql, /sort_order\s+integer\s+NOT\s+NULL\s+DEFAULT\s+999/i);
  assert.match(sql, /'GENERAL_OTHER'/);
  assert.match(sql, /ON\s+CONFLICT\s+\(type\)\s+DO\s+UPDATE/i);
});

test('Vero prompt schema keeps versioned server-managed profiles and evidence snapshots', () => {
  const sql = allMigrationSql();

  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+vero_prompt_profiles/i);
  assert.match(sql, /'PHOTO_QUALITY_GATE'/);
  assert.match(sql, /'PHOTO_ANALYSIS'/);
  assert.match(sql, /quality_prompt_hash/i);
  assert.match(sql, /prompt_instruction/i);
  assert.match(sql, /verification_mode/i);
  assert.match(sql, /output_schema/i);
  assert.match(sql, /result_json/i);
  assert.match(sql, /validation_status/i);
});
