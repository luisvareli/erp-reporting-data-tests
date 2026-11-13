import pg from 'pg';

// Dates come back as plain 'YYYY-MM-DD' strings. The default parser turns
// them into JS Date objects in the machine's time zone, which is exactly the
// kind of silent shift this suite exists to catch.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/erp';

export function createPool(sessionTimeZone = 'UTC'): pg.Pool {
  return new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    options: `-c timezone=${sessionTimeZone}`,
  });
}

const pool = createPool();

export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
