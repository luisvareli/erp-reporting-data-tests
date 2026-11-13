import { Decimal } from 'decimal.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectRowsToMatch } from './helpers/compare';
import { closePool, query } from './helpers/db';
import { expectedValuation, loadSource, type Source } from './helpers/oracle';
import { inventoryValuation } from './helpers/reports';

let source: Source;
beforeAll(async () => {
  source = await loadSource();
});
afterAll(closePool);

describe('inventory valuation report', () => {
  describe('reconciliation with source data', () => {
    it.each(['2025-01-31', '2025-03-31', '2025-06-30', '2025-12-31'])(
      'matches the source data as of %s',
      async (asOf) => {
        expectRowsToMatch(await inventoryValuation(asOf), expectedValuation(source, asOf), 'product_id');
      },
    );

    it('on-hand quantity ties to the movement ledger', async () => {
      const ledger = await query<{ product_id: number; qty: string }>(`
        SELECT product_id,
               sum(quantity) FILTER (WHERE kind = 'receipt')
               - coalesce(sum(quantity) FILTER (WHERE kind = 'issue'), 0)
               + coalesce(sum(quantity) FILTER (WHERE kind = 'adjustment'), 0) AS qty
        FROM inventory_movements
        WHERE product_id >= 7
        GROUP BY product_id ORDER BY product_id`);
      const report = (await inventoryValuation('2025-12-31')).filter((r) => r.product_id >= 7);
      expect(report.map((r) => [r.product_id, Number(r.qty_on_hand)])).toEqual(
        ledger.map((r) => [r.product_id, Number(r.qty)]),
      );
    });
  });

  describe('hand-checked products as of 2025-06-30 (rule R8)', () => {
    // Expected values worked out by hand from db/03_seed.sql.
    it.each([
      ['RM-0001', 'weighted average of two receipts, less an issue and an adjustment', '16.5', '2.3333', '38.50'],
      ['RM-0002', 'fully issued: listed with zero quantity', '0', '1', '0'],
      ['RM-0003', 'issued before receipt: negative stock is shown', '-3', '4', '-12'],
      ['RM-0004', 'adjustment only: no cost basis, so no value', '4', '0', '0'],
      ['RM-0005', 'single receipt', '7', '3.3333', '23.33'],
      ['RM-0006', 'average cost of exactly 1.00005 rounds up', '6', '1.0001', '6'],
    ])('%s: %s', async (sku, _label, qty, avgCost, value) => {
      const row = (await inventoryValuation('2025-06-30')).find((r) => r.sku === sku);
      expectRowsToMatch(
        [{ sku, qty_on_hand: row?.qty_on_hand, avg_unit_cost: row?.avg_unit_cost, value: row?.value }],
        [{ sku, qty_on_hand: qty, avg_unit_cost: avgCost, value }],
        'sku',
      );
    });
  });

  describe('date boundary (rule R2)', () => {
    it('includes a receipt booked at 21:00 on the as-of date, Costa Rica time', async () => {
      // The receipt for RM-0005 is 2025-04-01 03:00 UTC, which is still Mar 31 locally.
      const dayBefore = await inventoryValuation('2025-03-30');
      const sameDay = await inventoryValuation('2025-03-31');
      expect(dayBefore.map((r) => r.sku)).not.toContain('RM-0005');
      expect(sameDay.map((r) => r.sku)).toContain('RM-0005');
    });
  });

  describe('what appears in the report', () => {
    it('leaves out products that never moved', async () => {
      const skus = (await inventoryValuation('2025-12-31')).map((r) => r.sku);
      expect(skus).not.toContain('FG-0012');
      expect(skus).toHaveLength(11);
    });

    it('shows negative stock instead of hiding it, and only where it is known', async () => {
      const negative = (await inventoryValuation('2025-12-31')).filter((r) => Number(r.qty_on_hand) < 0);
      expect(negative.map((r) => r.sku)).toEqual(['RM-0003']);
    });
  });

  describe('invariants', () => {
    it('value = quantity x average cost, rounded to 2 decimals, on every row', async () => {
      for (const row of await inventoryValuation('2025-12-31')) {
        const expected = new Decimal(row.qty_on_hand).times(row.avg_unit_cost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        expect(new Decimal(row.value).toFixed(2), row.sku).toBe(expected.toFixed(2));
      }
    });

    it('average cost stays between the cheapest and the most expensive receipt', async () => {
      const range = await query<{ product_id: number; lowest: string; highest: string }>(`
        SELECT product_id, min(unit_cost) AS lowest, max(unit_cost) AS highest
        FROM inventory_movements WHERE kind = 'receipt' GROUP BY product_id`);
      const limits = new Map(range.map((r) => [r.product_id, r]));
      for (const row of await inventoryValuation('2025-12-31')) {
        const limit = limits.get(row.product_id);
        if (!limit) continue; // never received
        const cost = new Decimal(row.avg_unit_cost);
        expect(cost.gte(limit.lowest) && cost.lte(limit.highest), `${row.sku} cost ${row.avg_unit_cost}`).toBe(true);
      }
    });
  });
});
