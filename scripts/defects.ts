/**
 * Seeded defects.
 *
 * Each entry is a small, realistic mistake applied to db/02_reports.sql:
 * the kind of change that passes a code review and still produces a wrong
 * report. `npm run test:defects` applies them one at a time and expects the
 * suite to fail every time. A defect the suite does not notice is a gap in
 * the tests, and the script exits with an error.
 */
export interface Defect {
  id: string;
  rule: string;
  title: string;
  edits: { find: string; replace: string }[];
}

export const defects: Defect[] = [
  {
    id: 'D01',
    rule: 'R6',
    title: 'Aging joins payments row by row, so an invoice with two payments is counted twice',
    edits: [
      {
        find: `SELECT p.invoice_id, sum(p.amount) AS amount
    FROM payments p
    WHERE business_date(p.paid_at) <= p_as_of
    GROUP BY p.invoice_id`,
        replace: `SELECT p.invoice_id, p.amount
    FROM payments p
    WHERE business_date(p.paid_at) <= p_as_of`,
      },
    ],
  },
  {
    id: 'D02',
    rule: 'R3',
    title: 'Monthly sales drops the last day of the range',
    edits: [
      {
        find: 'AND business_date(i.issued_at) BETWEEN p_from AND p_to',
        replace: 'AND business_date(i.issued_at) >= p_from AND business_date(i.issued_at) < p_to',
      },
    ],
  },
  {
    id: 'D03',
    rule: 'R1',
    title: 'Monthly sales includes void documents',
    edits: [
      {
        find: `WHERE i.status = 'posted'
    AND business_date(i.issued_at) BETWEEN p_from AND p_to`,
        replace: 'WHERE business_date(i.issued_at) BETWEEN p_from AND p_to',
      },
    ],
  },
  {
    id: 'D04',
    rule: 'R4',
    title: 'Tax is accumulated unrounded instead of rounded per line',
    edits: [
      {
        find: 'round((x.gross - x.discount) * l.tax_rate, 2) AS tax',
        replace: '(x.gross - x.discount) * l.tax_rate AS tax',
      },
    ],
  },
  {
    id: 'D05',
    rule: 'R4',
    title: 'A missing discount is treated as unknown instead of 0, so those lines vanish from totals',
    edits: [{ find: 'coalesce(l.discount_pct, 0)', replace: 'l.discount_pct' }],
  },
  {
    id: 'D06',
    rule: 'R7',
    title: 'Aging puts day 30 in the 31-60 bucket',
    edits: [
      { find: 'BETWEEN 1 AND 30', replace: 'BETWEEN 1 AND 29' },
      { find: 'BETWEEN 31 AND 60', replace: 'BETWEEN 30 AND 60' },
    ],
  },
  {
    id: 'D07',
    rule: 'R8',
    title: 'Valuation ignores stock adjustments',
    edits: [
      {
        find: "CASE m.kind WHEN 'issue' THEN -m.quantity ELSE m.quantity END",
        replace: "CASE m.kind WHEN 'issue' THEN -m.quantity WHEN 'receipt' THEN m.quantity ELSE 0 END",
      },
    ],
  },
  {
    id: 'D08',
    rule: 'R5',
    title: 'Credit notes are added to sales instead of subtracted',
    edits: [{ find: "CASE i.kind WHEN 'credit_note' THEN -1 ELSE 1 END AS sign", replace: '1 AS sign' }],
  },
  {
    id: 'D09',
    rule: 'R2',
    title: 'Business date is taken in UTC instead of the company time zone',
    edits: [{ find: "AT TIME ZONE 'America/Costa_Rica'", replace: "AT TIME ZONE 'UTC'" }],
  },
  {
    id: 'D10',
    rule: 'R6',
    title: 'Aging counts payments made after the as-of date',
    edits: [{ find: 'WHERE business_date(p.paid_at) <= p_as_of', replace: 'WHERE true' }],
  },
  {
    id: 'D11',
    rule: 'R4',
    title: 'Line gross is truncated instead of rounded',
    edits: [
      {
        find: 'round(l.quantity * l.unit_price, 2) AS gross',
        replace: 'trunc(l.quantity * l.unit_price, 2) AS gross',
      },
    ],
  },
  {
    id: 'D12',
    rule: 'R1',
    title: 'Void credit notes still reduce the open balance',
    edits: [{ find: "AND c.status = 'posted'", replace: '' }],
  },
  {
    id: 'D13',
    rule: 'R7',
    title: 'An invoice due on the as-of date falls out of every bucket',
    edits: [{ find: 'WHERE o.days_past_due <= 0)', replace: 'WHERE o.days_past_due < 0)' }],
  },
  {
    id: 'D14',
    rule: 'R8',
    title: 'Average cost is a plain average of receipt prices, not weighted by quantity',
    edits: [
      {
        find: `sum(m.quantity * m.unit_cost) FILTER (WHERE m.kind = 'receipt')
          / nullif(sum(m.quantity) FILTER (WHERE m.kind = 'receipt'), 0)`,
        replace: "avg(m.unit_cost) FILTER (WHERE m.kind = 'receipt')",
      },
    ],
  },
];
