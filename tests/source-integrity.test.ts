/**
 * Checks on the source data itself.
 *
 * The schema already enforces keys, types and simple CHECK rules. These tests
 * cover the cross-row rules a constraint cannot express. If one of them fails,
 * a wrong report is a data problem, not a report problem, and that changes
 * who needs to fix it.
 *
 * Every query returns the offending rows, so a failure shows what to look at.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from './helpers/db';

afterAll(closePool);

describe('source data integrity', () => {
  it('every document has at least one line', async () => {
    const offenders = await query(`
      SELECT i.number FROM invoices i
      WHERE NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id = i.id)`);
    expect(offenders).toEqual([]);
  });

  it('line numbers run 1..n with no gaps', async () => {
    const offenders = await query(`
      SELECT i.number, count(*) AS lines, max(l.line_no) AS highest
      FROM invoices i JOIN invoice_lines l ON l.invoice_id = i.id
      GROUP BY i.number
      HAVING count(*) <> max(l.line_no) OR min(l.line_no) <> 1`);
    expect(offenders).toEqual([]);
  });

  it('a credit note points at a posted invoice of the same customer, issued earlier', async () => {
    const offenders = await query(`
      SELECT cn.number, inv.number AS against
      FROM invoices cn JOIN invoices inv ON inv.id = cn.references_invoice_id
      WHERE cn.kind = 'credit_note'
        AND (inv.kind <> 'invoice'
          OR inv.status <> 'posted'
          OR inv.customer_id <> cn.customer_id
          OR cn.issued_at < inv.issued_at)`);
    expect(offenders).toEqual([]);
  });

  it('payments are only recorded against posted invoices, never before they were issued', async () => {
    const offenders = await query(`
      SELECT p.id, i.number
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.kind <> 'invoice' OR i.status <> 'posted' OR p.paid_at < i.issued_at`);
    expect(offenders).toEqual([]);
  });

  it('no invoice is due before its business issue date', async () => {
    const offenders = await query(`
      SELECT number, due_date FROM invoices
      WHERE kind = 'invoice' AND due_date < business_date(issued_at)`);
    expect(offenders).toEqual([]);
  });

  it('receipts carry a positive unit cost', async () => {
    const offenders = await query(`
      SELECT id FROM inventory_movements WHERE kind = 'receipt' AND unit_cost <= 0`);
    expect(offenders).toEqual([]);
  });
});
