import { Decimal } from 'decimal.js';
import { expect } from 'vitest';

type Row = Record<string, unknown>;

/** Normalises a row so '10.00', '10' and Decimal(10) compare as the same amount. */
function normalise(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value instanceof Decimal) return [key, value.toFixed()];
      if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return [key, new Decimal(value).toFixed()];
      return [key, value];
    }),
  );
}

/**
 * Compares report rows with expected rows, column by column.
 * A failure prints the rows that differ, not the whole result set.
 */
export function expectRowsToMatch(actual: object[], expected: object[], key: string): void {
  const got = new Map((actual as Row[]).map((row) => [row[key], normalise(row)]));
  const want = new Map((expected as Row[]).map((row) => [row[key], normalise(row)]));

  expect([...got.keys()], `rows returned, by ${key}`).toEqual([...want.keys()]);
  for (const [id, row] of want) {
    expect(got.get(id), `${key} = ${String(id)}`).toEqual(row);
  }
}

export function sum(values: Array<string | Decimal>): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0));
}

/** True when the value has no more than the given number of decimal places. */
export function hasScaleAtMost(value: string, places: number): boolean {
  return new Decimal(value).decimalPlaces() <= places;
}
