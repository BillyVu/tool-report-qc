import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from './db.js';

const migrationsDirectory = new URL('./migrations/', import.meta.url);

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (applied.rowCount) continue;
    const sql = await readFile(join(migrationsDirectory.pathname, file), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await db.query('COMMIT');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }
  await db.end();
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
