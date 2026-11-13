import { Decimal } from 'decimal.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectRowsToMatch, sum } from './helpers/compare';
import { closePool, query } from './helpers/db';
import { expectedAging, loadSource, type Source } from './helpers/oracle';
import { arAging, type AgingRow } from './helpers/reports';

let source: Source;
beforeAll(async () => {
  source = await loadSource();
});
afterAll(closePool);

const AS_OF_DATES = ['2025-03-31', '2025-06-30', '2025-07-01', '2025-12-31', '2026-06-30'];

function rowFor(report: AgingRow[], customerName: string) {
  const row = report.find((r) => r.customer_name === customerName);
  if (!row) throw new Error(`${customerName} is not in the report`);
  return row;
}

describe('accounts receivable aging report', () => {
  describe('reconciliation with source data', () => {
    it.each(AS_OF_DATES)('matches the source data as of %s', async (asOf) => {
      expectRowsToMatch(await arAging(asOf), expectedAging(source, asOf), 'customer_id');
    });

    it.each(AS_OF_DATES)('ties to the receivables control total as of %s', async (asOf) => {
      // Three plain sums, taken separately so no join can multiply anything.
      const [control] = await query<{ invoiced: string; paid: string; credited: string }>(
        `SELECT
           (SELECT coalesce(sum(t.net + t.tax), 0) FROM invoices i JOIN v_document_totals t ON t.invoice_id = i.id
             WHERE i.kind = 'invoice' AND i.status = 'posted' AND business_date(i.issued_at) <= $1) AS invoiced,
           (SELECT coalesce(sum(amount), 0) FROM payments WHERE business_date(paid_at) <= $1) AS paid,
           (SELECT coalesce(sum(t.net + t.tax), 0) FROM invoices i JOIN v_document_totals t ON t.invoice_id = i.id
             WHERE i.kind = 'credit_note' AND i.status = 'posted' AND business_date(i.issued_at) <= $1) AS credited`,
        [asOf],
      );
      const expected = new Decimal(control!.invoiced).minus(control!.paid).minus(control!.credited);
      const report = await arAging(asOf);
      expect(sum(report.map((r) => r.total)).toFixed(2)).toBe(expected.toFixed(2));
    });
  });

  describe('hand-checked customers as of 2025-06-30', () => {
    // Expected values worked out by hand from db/03_seed.sql.
    it('Cedar Industrial: two payments and a credit note against one invoice (rule R6)', async () => {
      // INV-0006 565.00 - 200.00 - 165.00 - CN-0001 56.50 = 143.50, 87 days past due.
      // INV-0008 100.00, 30 days past due. INV-0013 300.00, not due yet.
      // CN-0002 is void and changes nothing.
      const row = rowFor(await arAging('2025-06-30'), 'Cedar Industrial');
      expectRowsToMatch(
        [row],
        [{ customer_id: 3, customer_name: 'Cedar Industrial', current: '300', d1_30: '100', d31_60: '0', d61_90: '143.50', d90_plus: '0', total: '543.50' }],
        'customer_id',
      );
    });

    it('Alder Supply: a payment made at 22:00 local time on the as-of date counts (rule R2)', async () => {
      // INV-0014 was paid on Jun 30 Costa Rica time (Jul 1 in UTC), so it is closed.
      // INV-0009 200.00 is due on the as-of date: still current.
      // INV-0001 67.77 + INV-0002 101.70 are more than 90 days past due.
      const row = rowFor(await arAging('2025-06-30'), 'Alder Supply');
      expectRowsToMatch(
        [row],
        [{ customer_id: 1, customer_name: 'Alder Supply', current: '200', d1_30: '0', d31_60: '0', d61_90: '0', d90_plus: '169.47', total: '369.47' }],
        'customer_id',
      );
    });

    it('Brightwater Coatings: an overpayment shows as a credit balance', async () => {
      // INV-0011 40.00 paid with 50.00 leaves -10.00, 60 days past due.
      const row = rowFor(await arAging('2025-06-30'), 'Brightwater Coatings');
      expect(new Decimal(row.d31_60).toFixed(2)).toBe('-10.00');
      expect(new Decimal(row.total).toFixed(2)).toBe('-8.84');
    });
  });

  describe('bucket and date boundaries (rules R6 and R7)', () => {
    it('moves an invoice from 1-30 to 31-60 on day 31', async () => {
      // INV-0008 is due 2025-05-31: 30 days past due on Jun 30, 31 on Jul 1.
      const day30 = rowFor(await arAging('2025-06-30'), 'Cedar Industrial');
      const day31 = rowFor(await arAging('2025-07-01'), 'Cedar Industrial');
      expect([day30.d1_30, day30.d31_60].map(Number)).toEqual([100, 0]);
      expect([day31.d1_30, day31.d31_60].map(Number)).toEqual([0, 100]);
    });

    it('ignores a payment made after the as-of date', async () => {
      // INV-0013 300.00 was paid on Jul 2.
      const before = rowFor(await arAging('2025-07-01'), 'Cedar Industrial');
      const after = rowFor(await arAging('2025-07-02'), 'Cedar Industrial');
      expect(Number(before.current)).toBe(300);
      expect(Number(after.current)).toBe(0);
    });

    it('returns nothing before the first invoice exists', async () => {
      expect(await arAging('2024-12-31')).toEqual([]);
    });
  });

  describe('who appears in the report', () => {
    it('leaves out customers with nothing open', async () => {
      const names = (await arAging('2025-06-30')).map((r) => r.customer_name);
      expect(names).not.toContain('Dunmore Labs'); // never invoiced
    });

    it('lists each customer once', async () => {
      const ids = (await arAging('2025-12-31')).map((r) => r.customer_id);
      expect(ids).toEqual([...new Set(ids)].sort((a, b) => a - b));
    });
  });

  describe('invariants', () => {
    it.each(AS_OF_DATES)('buckets add up to the total on every row as of %s', async (asOf) => {
      for (const row of await arAging(asOf)) {
        const buckets = sum([row.current, row.d1_30, row.d31_60, row.d61_90, row.d90_plus]);
        expect(buckets.toFixed(2), row.customer_name).toBe(new Decimal(row.total).toFixed(2));
      }
    });

    it('only ages balances: with no new activity, the total stays put while buckets shift', async () => {
      // Nothing is issued or paid between these two dates (the last documents are from 2025).
      const earlier = await arAging('2026-03-31');
      const later = await arAging('2026-06-30');
      expect(sum(later.map((r) => r.total)).toFixed(2)).toBe(sum(earlier.map((r) => r.total)).toFixed(2));
      expect(sum(later.map((r) => r.current)).toFixed(2)).toBe('0.00');
    });
  });
});
