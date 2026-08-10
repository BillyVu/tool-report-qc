import { Client, Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const databaseHost = process.env.PGHOST;

if (!databaseUrl && !databaseHost) {
  throw new Error('DATABASE_URL is required');
}

function clientConfig() {
  return databaseHost
    ? {
        host: databaseHost,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE
      }
    : { connectionString: databaseUrl };
}

export const db = new Pool(clientConfig());

export function createDbClient(): Client {
  return new Client(clientConfig());
}
