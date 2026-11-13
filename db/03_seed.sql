-- Deterministic seed data. Nothing here is random: the same script always
-- produces the same rows, so expected values in the tests never drift.
--
-- Part 1: hand-written edge cases (ids below 100). Each one exists to
--         break a specific kind of report defect; the comment says which.
-- Part 2: generated volume (ids from 1000), so totals are not trivial.

-- ---------------------------------------------------------------- masters
INSERT INTO customers (id, name, country) VALUES
  (1, 'Alder Supply',         'CR'),
  (2, 'Brightwater Coatings', 'US'),
  (3, 'Cedar Industrial',     'MX'),
  (4, 'Dunmore Labs',         'US');   -- never invoiced: must not appear in aging

INSERT INTO customers (id, name, country)
SELECT 10 + n, 'Customer ' || lpad((10 + n)::text, 3, '0'), (ARRAY['CR','US','MX','CA'])[n % 4 + 1]
FROM generate_series(0, 19) n;

INSERT INTO products (id, sku, name, category) VALUES
  (1,  'RM-0001', 'Resin base A',        'raw material'),
  (2,  'RM-0002', 'Solvent blend',       'raw material'),
  (3,  'RM-0003', 'Pigment red',         'raw material'),
  (4,  'RM-0004', 'Additive X',          'raw material'),
  (5,  'RM-0005', 'Hardener',            'raw material'),
  (6,  'RM-0006', 'Thinner',             'raw material'),
  (7,  'FG-0007', 'Primer 1 gal',        'finished good'),
  (8,  'FG-0008', 'Sample card',         'finished good'),
  (9,  'FG-0009', 'Epoxy kit 5 gal',     'finished good'),
  (10, 'FG-0010', 'Mixing stick',        'finished good'),
  (11, 'FG-0011', 'Topcoat 1 qt',        'finished good'),
  (12, 'FG-0012', 'Discontinued item',   'finished good');  -- no movements: not in valuation

-- ------------------------------------------------------ edge-case invoices
INSERT INTO invoices (id, number, customer_id, kind, status, issued_at, due_date, references_invoice_id) VALUES
  -- 23:30 on Jan 31 in Costa Rica is already Feb 1 in UTC (rule R2)
  (1,  'INV-0001', 1, 'invoice',     'posted', '2025-02-01 05:30:00+00', '2025-03-02', NULL),
  -- first instant of Feb 1 in Costa Rica
  (2,  'INV-0002', 1, 'invoice',     'posted', '2025-02-01 06:00:00+00', '2025-03-03', NULL),
  -- three 0.10 lines: tax rounded per line is 0.03, rounded on the total is 0.04 (R4)
  (3,  'INV-0003', 2, 'invoice',     'posted', '2025-02-15 18:00:00+00', '2025-03-17', NULL),
  -- 2.5 x 0.33 = 0.825: half away from zero gives 0.83, banker's rounding gives 0.82 (R4)
  (4,  'INV-0004', 2, 'invoice',     'posted', '2025-02-20 18:00:00+00', '2025-03-22', NULL),
  -- void and large on purpose: easy to see if it leaks into a report (R1)
  (5,  'INV-0005', 2, 'invoice',     'void',   '2025-03-10 18:00:00+00', '2025-04-09', NULL),
  -- two payments and a credit note: a join that fans out multiplies the amounts (R6)
  (6,  'INV-0006', 3, 'invoice',     'posted', '2025-03-05 18:00:00+00', '2025-04-04', NULL),
  (7,  'CN-0001',  3, 'credit_note', 'posted', '2025-04-15 18:00:00+00', '2025-04-15', 6),
  -- due May 31: exactly 30 days past due on Jun 30, 31 days on Jul 1 (R7)
  (8,  'INV-0008', 3, 'invoice',     'posted', '2025-05-01 18:00:00+00', '2025-05-31', NULL),
  -- due on the as-of date itself: 0 days past due is still current (R7)
  (9,  'INV-0009', 1, 'invoice',     'posted', '2025-06-01 18:00:00+00', '2025-06-30', NULL),
  -- paid in full: must drop out of aging
  (10, 'INV-0010', 1, 'invoice',     'posted', '2025-03-01 18:00:00+00', '2025-03-31', NULL),
  -- overpaid by 10.00: shows as a credit balance, not hidden
  (11, 'INV-0011', 2, 'invoice',     'posted', '2025-04-01 18:00:00+00', '2025-05-01', NULL),
  -- void credit note against invoice 8: must not reduce its balance (R1)
  (12, 'CN-0002',  3, 'credit_note', 'void',   '2025-06-10 18:00:00+00', '2025-06-10', 8),
  -- paid on Jul 2: still open as of Jun 30, closed as of Jul 31 (R6)
  (13, 'INV-0013', 3, 'invoice',     'posted', '2025-06-15 18:00:00+00', '2025-07-15', NULL),
  -- paid at 22:00 on Jun 30 in Costa Rica, which is Jul 1 in UTC (R2, R6)
  (14, 'INV-0014', 1, 'invoice',     'posted', '2025-06-20 18:00:00+00', '2025-07-20', NULL),
  -- 100% discount: a real invoice worth 0.00
  (15, 'INV-0015', 2, 'invoice',     'posted', '2025-05-12 18:00:00+00', '2025-06-11', NULL),
  -- last second of 2025 in Costa Rica, already 2026 in UTC (R2, R3)
  (16, 'INV-0016', 1, 'invoice',     'posted', '2026-01-01 05:59:59+00', '2026-01-30', NULL);

INSERT INTO invoice_lines (id, invoice_id, line_no, product_id, quantity, unit_price, discount_pct, tax_rate) VALUES
  (1,  1,  1, 7,  3,     19.99,   NULL,  0.13),
  (2,  2,  1, 9,  1,     100.00,  10,    0.13),
  (3,  3,  1, 10, 1,     0.10,    NULL,  0.13),
  (4,  3,  2, 10, 1,     0.10,    NULL,  0.13),
  (5,  3,  3, 10, 1,     0.10,    NULL,  0.13),
  (6,  4,  1, 8,  2.5,   0.33,    NULL,  0),
  (7,  5,  1, 9,  1,     5000.00, 0,     0.13),
  (8,  6,  1, 7,  10,    50.00,   0,     0.13),
  (9,  7,  1, 7,  1,     50.00,   0,     0.13),
  (10, 8,  1, 11, 1,     100.00,  NULL,  0),
  (11, 9,  1, 11, 1,     200.00,  NULL,  0),
  (12, 10, 1, 11, 1,     80.00,   NULL,  0),
  (13, 11, 1, 11, 1,     40.00,   NULL,  0),
  (14, 12, 1, 11, 1,     100.00,  NULL,  0),
  (15, 13, 1, 9,  1,     300.00,  NULL,  0),
  (16, 14, 1, 7,  1,     60.00,   NULL,  0),
  (17, 15, 1, 9,  1,     250.00,  100,   0.13),
  (18, 16, 1, 8,  1,     10.00,   NULL,  0);

INSERT INTO payments (id, invoice_id, paid_at, amount) VALUES
  (1, 6,  '2025-03-20 18:00:00+00', 200.00),
  (2, 6,  '2025-04-10 18:00:00+00', 165.00),
  (3, 10, '2025-03-15 18:00:00+00', 80.00),
  (4, 11, '2025-04-20 18:00:00+00', 50.00),
  (5, 13, '2025-07-02 18:00:00+00', 300.00),
  (6, 14, '2025-07-01 04:00:00+00', 60.00);

-- ----------------------------------------------------- edge-case inventory
INSERT INTO inventory_movements (id, product_id, moved_at, kind, quantity, unit_cost) VALUES
  -- product 1: two receipts at different costs, an issue and a negative adjustment
  (1,  1, '2025-01-05 18:00:00+00', 'receipt',    10,     2.0000),
  (2,  1, '2025-02-05 18:00:00+00', 'receipt',    20,     2.5000),
  (3,  1, '2025-02-10 18:00:00+00', 'issue',      12,     NULL),
  (4,  1, '2025-03-01 18:00:00+00', 'adjustment', -1.5,   NULL),
  -- product 2: everything received was issued: quantity 0 still listed
  (5,  2, '2025-01-05 18:00:00+00', 'receipt',    3,      1.0000),
  (6,  2, '2025-01-06 18:00:00+00', 'issue',      3,      NULL),
  -- product 3: issued before it was received: negative on hand must be visible
  (7,  3, '2025-01-10 18:00:00+00', 'issue',      5,      NULL),
  (8,  3, '2025-01-20 18:00:00+00', 'receipt',    2,      4.0000),
  -- product 4: adjustment only, never received: no cost basis
  (9,  4, '2025-02-01 18:00:00+00', 'adjustment', 4,      NULL),
  -- product 5: received at 21:00 on Mar 31 in Costa Rica, Apr 1 in UTC (R2)
  (10, 5, '2025-04-01 03:00:00+00', 'receipt',    7,      3.3333),
  -- product 6: average cost lands exactly on a half (1.00005) at 4 decimals
  (11, 6, '2025-01-05 18:00:00+00', 'receipt',    3,      1.0000),
  (12, 6, '2025-01-06 18:00:00+00', 'receipt',    3,      1.0001);

-- ------------------------------------------------------- generated volume
-- 360 invoices, one per day from Jan 2 2025, issued at noon Costa Rica time.
INSERT INTO invoices (id, number, customer_id, kind, status, issued_at, due_date)
SELECT
  1000 + i,
  'INV-' || (1000 + i),
  10 + (i * 7) % 20,
  'invoice',
  CASE WHEN i % 37 = 5 THEN 'void' ELSE 'posted' END,
  timestamptz '2025-01-02 18:00:00+00' + i * interval '1 day',
  date '2025-01-02' + i + 30
FROM generate_series(0, 359) i;

INSERT INTO invoice_lines (id, invoice_id, line_no, product_id, quantity, unit_price, discount_pct, tax_rate)
SELECT
  10000 + i * 10 + k,
  1000 + i,
  k,
  p.product_id,
  ((i * 7 + k * 3) % 9 + 1) + CASE WHEN (i + k) % 6 = 0 THEN 0.375 ELSE 0 END,
  (ARRAY[12.49, 3.15, 249.00, 0.07, 18.90])[p.product_id - 6],
  (ARRAY[NULL, 0, 5, 12.5, NULL])[(i + k) % 5 + 1],
  CASE WHEN p.product_id = 10 THEN 0 ELSE 0.13 END
FROM generate_series(0, 359) i
CROSS JOIN LATERAL generate_series(1, i % 4 + 1) k
CROSS JOIN LATERAL (SELECT 7 + (i + k) % 5 AS product_id) p;

-- 30 credit notes, each for half a unit of the first line of its invoice,
-- issued 20 days later. One of them is void.
INSERT INTO invoices (id, number, customer_id, kind, status, issued_at, due_date, references_invoice_id)
SELECT
  2000 + j,
  'CN-' || (2000 + j),
  inv.customer_id,
  'credit_note',
  CASE WHEN j = 7 THEN 'void' ELSE 'posted' END,
  inv.issued_at + interval '20 days',
  inv.due_date,
  inv.id
FROM generate_series(0, 29) j
JOIN invoices inv ON inv.id = 1000 + j * 11 + 1;

INSERT INTO invoice_lines (id, invoice_id, line_no, product_id, quantity, unit_price, discount_pct, tax_rate)
SELECT 30000 + j, 2000 + j, 1, l.product_id, 0.5, l.unit_price, NULL, l.tax_rate
FROM generate_series(0, 29) j
JOIN invoice_lines l ON l.invoice_id = 1000 + j * 11 + 1 AND l.line_no = 1;

-- Payments for posted invoices that have no credit note:
--   i % 5 = 0  unpaid
--   1 or 2     paid in full after 12 days
--   3          two partial payments (40% after 10 days, 30% after 45 days)
--   4          paid in full, late, after 50 days
-- The invoice total is spelled out here instead of reusing the report views,
-- so the seed does not depend on the code under test.
WITH totals AS (
  SELECT
    l.invoice_id,
    sum(
      (round(l.quantity * l.unit_price, 2)
        - round(round(l.quantity * l.unit_price, 2) * coalesce(l.discount_pct, 0) / 100, 2))
      + round(
          (round(l.quantity * l.unit_price, 2)
            - round(round(l.quantity * l.unit_price, 2) * coalesce(l.discount_pct, 0) / 100, 2))
          * l.tax_rate, 2)
    ) AS total
  FROM invoice_lines l
  GROUP BY l.invoice_id
),
eligible AS (
  SELECT inv.id, inv.id - 1000 AS i, inv.issued_at, t.total
  FROM invoices inv
  JOIN totals t ON t.invoice_id = inv.id
  WHERE inv.id BETWEEN 1000 AND 1359
    AND inv.status = 'posted'
    AND t.total > 0
    AND NOT EXISTS (SELECT 1 FROM invoices cn WHERE cn.references_invoice_id = inv.id)
)
INSERT INTO payments (id, invoice_id, paid_at, amount)
SELECT 3000 + i * 2,     id, issued_at + interval '12 days', total               FROM eligible WHERE i % 5 IN (1, 2)
UNION ALL
SELECT 3000 + i * 2,     id, issued_at + interval '10 days', round(total * 0.4, 2) FROM eligible WHERE i % 5 = 3 AND round(total * 0.4, 2) > 0
UNION ALL
SELECT 3000 + i * 2 + 1, id, issued_at + interval '45 days', round(total * 0.3, 2) FROM eligible WHERE i % 5 = 3 AND round(total * 0.3, 2) > 0
UNION ALL
SELECT 3000 + i * 2,     id, issued_at + interval '50 days', total               FROM eligible WHERE i % 5 = 4;

-- Stock for the five finished goods: a receipt on the 3rd of each month,
-- issues on the 10th and 20th, and a stock-count adjustment every third month.
INSERT INTO inventory_movements (id, product_id, moved_at, kind, quantity, unit_cost)
SELECT 5000 + p * 100 + m * 4,
       p,
       timestamptz '2025-01-03 18:00:00+00' + m * interval '1 month',
       'receipt',
       200 + (p * m * 13) % 50,
       (ARRAY[6.2000, 1.1000, 131.5000, 0.0210, 9.4500])[p - 6] + (m % 4) * 0.0125 * (p - 6)
FROM generate_series(7, 11) p CROSS JOIN generate_series(0, 11) m
UNION ALL
SELECT 5000 + p * 100 + m * 4 + 1, p,
       timestamptz '2025-01-10 18:00:00+00' + m * interval '1 month',
       'issue', 60 + ((p + m) * 7) % 40, NULL
FROM generate_series(7, 11) p CROSS JOIN generate_series(0, 11) m
UNION ALL
SELECT 5000 + p * 100 + m * 4 + 2, p,
       timestamptz '2025-01-20 18:00:00+00' + m * interval '1 month',
       'issue', 45 + ((p * 3 + m) * 5) % 35 + 0.25, NULL
FROM generate_series(7, 11) p CROSS JOIN generate_series(0, 11) m
UNION ALL
SELECT 5000 + p * 100 + m * 4 + 3, p,
       timestamptz '2025-01-25 18:00:00+00' + m * interval '1 month',
       'adjustment', -(p % 3 + 0.5), NULL
FROM generate_series(7, 11) p CROSS JOIN generate_series(0, 11) m
WHERE m % 3 = 2;
