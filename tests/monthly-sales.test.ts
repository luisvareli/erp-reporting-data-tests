import { Decimal } from 'decimal.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectRowsToMatch, hasScaleAtMost, sum } from './helpers/compare';
import { closePool, createPool, query } from './helpers/db';
import { expectedMonthlySales, loadSource, type Source } from './helpers/oracle';
import { monthlySales } from './helpers/reports';

let source: Source;
beforeAll(async () => {
  source = await loadSource();
});
afterAll(closePool);

describe('monthly sales report', () => {
  describe('reconciliation with source data', () => {
    it.each([
      ['the full year', '2025-01-01', '2025-12-31'],
      ['a range that starts and ends mid-month', '2025-02-14', '2025-05-17'],
      ['a single day', '2025-07-15', '2025-07-15'],
    ])('matches the source data for %s', async (_label, from, to) => {
      const report = await monthlySales(from, to);
      expectRowsToMatch(report, expectedMonthlySales(source, from, to), 'month');
    });

    it('counts every posted document of 2025 exactly once', async () => {
      const report = await monthlySales('2025-01-01', '2025-12-31');
      // 13 hand-written + 350 generated posted invoices; 1 + 29 posted credit notes.
      expect(report.reduce((n, row) => n + row.invoice_count, 0)).toBe(363);
      expect(report.reduce((n, row) => n + row.credit_note_count, 0)).toBe(30);
    });
  });

  describe('line amounts (rule R4)', () => {
    // Expected values worked out by hand from db/03_seed.sql.
    it.each([
      [1, 'no discount recorded means 0', '59.97', '0.00', '59.97', '7.80'],
      [2, '10% discount', '100.00', '10.00', '90.00', '11.70'],
      [3, 'tax on 0.10 rounds down to 0.01 per line', '0.10', '0.00', '0.10', '0.01'],
      [6, '2.5 x 0.33 = 0.825 rounds half away from zero', '0.83', '0.00', '0.83', '0.00'],
      [17, '100% discount leaves nothing to tax', '250.00', '250.00', '0.00', '0.00'],
    ])('line %i: %s', async (lineId, _label, gross, discount, net, tax) => {
      const [line] = await query('SELECT gross, discount, net, tax FROM v_line_amounts WHERE line_id = $1', [lineId]);
      expectRowsToMatch([{ id: lineId, ...line }], [{ id: lineId, gross, discount, net, tax }], 'id');
    });

    it('rounds tax per line, not on the document total', async () => {
      // INV-0003 has three 0.10 lines at 13%: 0.01 + 0.01 + 0.01, not round(0.039).
      const [doc] = await query<{ tax: string }>('SELECT tax FROM v_document_totals WHERE invoice_id = 3');
      expect(new Decimal(doc!.tax).toFixed(2)).toBe('0.03');
    });
  });

  describe('date boundaries (rules R2 and R3)', () => {
    it('puts an invoice issued at 23:30 on Jan 31 Costa Rica time in January', async () => {
      // INV-0001 is 2025-02-01 05:30 UTC. Each day also has one generated invoice.
      const lastDayOfJanuary = await monthlySales('2025-01-31', '2025-01-31');
      const firstDayOfFebruary = await monthlySales('2025-02-01', '2025-02-01');
      expect(lastDayOfJanuary.map((r) => [r.month, r.invoice_count])).toEqual([['2025-01-01', 2]]);
      expect(firstDayOfFebruary.map((r) => [r.month, r.invoice_count])).toEqual([['2025-02-01', 2]]);
    });

    it('keeps the last second of the year in the year it belongs to', async () => {
      // INV-0016 is 2026-01-01 05:59:59 UTC and the only document on that day.
      const lastDay = await monthlySales('2025-12-31', '2025-12-31');
      expectRowsToMatch(
        lastDay,
        [{ month: '2025-12-01', invoice_count: 1, credit_note_count: 0, gross: '10', discount: '0', net: '10', tax: '0', total: '10' }],
        'month',
      );
      expect(await monthlySales('2026-01-01', '2026-01-31')).toEqual([]);
    });

    it('includes both ends of the range', async () => {
      const whole = await monthlySales('2025-03-01', '2025-03-31');
      const withoutEnds = await monthlySales('2025-03-02', '2025-03-30');
      // One generated invoice per day, plus INV-0010 on Mar 1.
      expect(whole[0]!.invoice_count - withoutEnds[0]!.invoice_count).toBe(3);
    });

    it('does not depend on the time zone of the database session', async () => {
      const tokyo = createPool('Asia/Tokyo');
      try {
        const report = await monthlySales('2025-01-01', '2025-12-31', tokyo);
        expectRowsToMatch(report, expectedMonthlySales(source, '2025-01-01', '2025-12-31'), 'month');
      } finally {
        await tokyo.end();
      }
    });

    it('returns no rows for an empty or inverted range', async () => {
      expect(await monthlySales('2024-01-01', '2024-12-31')).toEqual([]);
      expect(await monthlySales('2025-06-30', '2025-06-01')).toEqual([]);
    });
  });

  describe('document status and sign (rules R1 and R5)', () => {
    it('ignores void documents', async () => {
      // INV-0005 is void and worth 5,650.00. March without it stays far below that.
      const [march] = await monthlySales('2025-03-10', '2025-03-10');
      expect(new Decimal(march!.total).lessThan(5000)).toBe(true);
      expect(march!.invoice_count).toBe(1);
    });

    it('subtracts credit notes', async () => {
      // On 2025-04-15 there is one generated invoice and CN-0001 for 56.50.
      const [withNote] = await monthlySales('2025-04-15', '2025-04-15');
      const [invoiceOnly] = await query<{ total: string }>(`
        SELECT t.net + t.tax AS total
        FROM invoices i JOIN v_document_totals t ON t.invoice_id = i.id
        WHERE i.kind = 'invoice' AND i.status = 'posted' AND business_date(i.issued_at) = '2025-04-15'`);
      expect(withNote!.credit_note_count).toBeGreaterThanOrEqual(1);
      const creditNotes = new Decimal(invoiceOnly!.total).minus(withNote!.total);
      expect(creditNotes.greaterThanOrEqualTo('56.50')).toBe(true);
    });
  });

  describe('invariants', () => {
    it('net = gross - discount and total = net + tax on every row', async () => {
      for (const row of await monthlySales('2025-01-01', '2025-12-31')) {
        expect(new Decimal(row.gross).minus(row.discount).toFixed(2), row.month).toBe(new Decimal(row.net).toFixed(2));
        expect(new Decimal(row.net).plus(row.tax).toFixed(2), row.month).toBe(new Decimal(row.total).toFixed(2));
      }
    });

    it('adds up: four quarters equal the year', async () => {
      const year = await monthlySales('2025-01-01', '2025-12-31');
      const quarters = (
        await Promise.all([
          monthlySales('2025-01-01', '2025-03-31'),
          monthlySales('2025-04-01', '2025-06-30'),
          monthlySales('2025-07-01', '2025-09-30'),
          monthlySales('2025-10-01', '2025-12-31'),
        ])
      ).flat();
      expect(quarters).toEqual(year);
      expect(sum(quarters.map((r) => r.total)).toFixed(2)).toBe(sum(year.map((r) => r.total)).toFixed(2));
    });

    it('returns one row per month, in order, with money at 2 decimals', async () => {
      const report = await monthlySales('2025-01-01', '2025-12-31');
      const months = report.map((r) => r.month);
      expect(months).toEqual([...new Set(months)].sort());
      expect(months).toHaveLength(12);
      for (const row of report) {
        for (const column of ['gross', 'discount', 'net', 'tax', 'total'] as const) {
          expect(hasScaleAtMost(row[column], 2), `${row.month} ${column} = ${row[column]}`).toBe(true);
        }
      }
    });
  });
});
