import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/erp';

const DB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db');

export interface SqlFile {
  name: string;
  sql: string;
}

export function readSqlFiles(): SqlFile[] {
  return readdirSync(DB_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(DB_DIR, name), 'utf8') }));
}

/** Drops everything and rebuilds the database from the given SQL files. */
export async function rebuild(files: SqlFile[] = readSqlFiles()): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const file of files) {
      try {
        await client.query(file.sql);
      } catch (error) {
        throw new Error(`${file.name}: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}
