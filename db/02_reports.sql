-- The reports under test.
--
-- Business rules (also listed in docs/test-strategy.md):
--   R1  Only posted documents count. Void documents are ignored everywhere.
--   R2  The business date of a document is its timestamp in the company's
--       time zone (America/Costa_Rica), not in UTC and not in the session zone.
--   R3  Date ranges are inclusive on both ends.
--   R4  Amounts are rounded per line, half away from zero, to 2 decimals:
--         gross = qty * unit_price, discount = gross * pct / 100,
--         net = gross - discount, tax = net * tax_rate.
--       A missing discount means 0.
--   R5  Credit notes carry the opposite sign of invoices.
--   R6  Open balance = invoice total - payments - credit notes against it,
--       each counted up to the as-of date.
--   R7  Aging buckets by days past due: <= 0 current, 1-30, 31-60, 61-90, > 90.
--   R8  On-hand quantity = receipts - issues + adjustments.
--       Unit cost is the weighted average of receipts (4 decimals).

CREATE FUNCTION business_date(ts timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT (ts AT TIME ZONE 'America/Costa_Rica')::date
$$;

CREATE VIEW v_line_amounts AS
SELECT
  l.id          AS line_id,
  l.invoice_id,
  x.gross,
  x.discount,
  x.gross - x.discount                         AS net,
  round((x.gross - x.discount) * l.tax_rate, 2) AS tax
FROM invoice_lines l
CROSS JOIN LATERAL (
  SELECT
    round(l.quantity * l.unit_price, 2) AS gross,
    round(round(l.quantity * l.unit_price, 2) * coalesce(l.discount_pct, 0) / 100, 2) AS discount
) x;

CREATE VIEW v_document_totals AS
SELECT
  i.id AS invoice_id,
  CASE i.kind WHEN 'credit_note' THEN -1 ELSE 1 END AS sign,
  coalesce(sum(a.gross), 0)    AS gross,
  coalesce(sum(a.discount), 0) AS discount,
  coalesce(sum(a.net), 0)      AS net,
  coalesce(sum(a.tax), 0)      AS tax
FROM invoices i
LEFT JOIN v_line_amounts a ON a.invoice_id = i.id
GROUP BY i.id, i.kind;

-- Monthly sales -------------------------------------------------------------

CREATE FUNCTION report_monthly_sales(p_from date, p_to date)
RETURNS TABLE (
  month             date,
  invoice_count     integer,
  credit_note_count integer,
  gross             numeric,
  discount          numeric,
  net               numeric,
  tax               numeric,
  total             numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    date_trunc('month', business_date(i.issued_at))::date,
    count(*) FILTER (WHERE i.kind = 'invoice')::integer,
    count(*) FILTER (WHERE i.kind = 'credit_note')::integer,
    sum(t.sign * t.gross),
    sum(t.sign * t.discount),
    sum(t.sign * t.net),
    sum(t.sign * t.tax),
    sum(t.sign * (t.net + t.tax))
  FROM invoices i
  JOIN v_document_totals t ON t.invoice_id = i.id
  WHERE i.status = 'posted'
    AND business_date(i.issued_at) BETWEEN p_from AND p_to
  GROUP BY 1
  ORDER BY 1
$$;

-- Accounts receivable aging -------------------------------------------------

CREATE FUNCTION report_ar_aging(p_as_of date)
RETURNS TABLE (
  customer_id   integer,
  customer_name text,
  current       numeric,
  d1_30         numeric,
  d31_60        numeric,
  d61_90        numeric,
  d90_plus      numeric,
  total         numeric
)
LANGUAGE sql STABLE AS $$
  WITH paid AS (
    SELECT p.invoice_id, sum(p.amount) AS amount
    FROM payments p
    WHERE business_date(p.paid_at) <= p_as_of
    GROUP BY p.invoice_id
  ),
  credited AS (
    SELECT c.references_invoice_id AS invoice_id, sum(t.net + t.tax) AS amount
    FROM invoices c
    JOIN v_document_totals t ON t.invoice_id = c.id
    WHERE c.kind = 'credit_note'
      AND c.status = 'posted'
      AND business_date(c.issued_at) <= p_as_of
    GROUP BY c.references_invoice_id
  ),
  open_items AS (
    SELECT
      i.customer_id,
      p_as_of - i.due_date AS days_past_due,
      (t.net + t.tax) - coalesce(paid.amount, 0) - coalesce(credited.amount, 0) AS balance
    FROM invoices i
    JOIN v_document_totals t ON t.invoice_id = i.id
    LEFT JOIN paid     ON paid.invoice_id = i.id
    LEFT JOIN credited ON credited.invoice_id = i.id
    WHERE i.kind = 'invoice'
      AND i.status = 'posted'
      AND business_date(i.issued_at) <= p_as_of
  )
  SELECT
    c.id,
    c.name,
    coalesce(sum(o.balance) FILTER (WHERE o.days_past_due <= 0), 0),
    coalesce(sum(o.balance) FILTER (WHERE o.days_past_due BETWEEN 1 AND 30), 0),
    coalesce(sum(o.balance) FILTER (WHERE o.days_past_due BETWEEN 31 AND 60), 0),
    coalesce(sum(o.balance) FILTER (WHERE o.days_past_due BETWEEN 61 AND 90), 0),
    coalesce(sum(o.balance) FILTER (WHERE o.days_past_due > 90), 0),
    sum(o.balance)
  FROM open_items o
  JOIN customers c ON c.id = o.customer_id
  WHERE o.balance <> 0
  GROUP BY c.id, c.name
  ORDER BY c.id
$$;

-- Inventory valuation -------------------------------------------------------

CREATE FUNCTION report_inventory_valuation(p_as_of date)
RETURNS TABLE (
  product_id    integer,
  sku           text,
  qty_on_hand   numeric,
  avg_unit_cost numeric,
  value         numeric
)
LANGUAGE sql STABLE AS $$
  WITH m AS (
    SELECT * FROM inventory_movements
    WHERE business_date(moved_at) <= p_as_of
  ),
  agg AS (
    SELECT
      m.product_id,
      sum(CASE m.kind WHEN 'issue' THEN -m.quantity ELSE m.quantity END) AS qty,
      round(
        sum(m.quantity * m.unit_cost) FILTER (WHERE m.kind = 'receipt')
          / nullif(sum(m.quantity) FILTER (WHERE m.kind = 'receipt'), 0),
        4
      ) AS avg_cost
    FROM m
    GROUP BY m.product_id
  )
  SELECT
    p.id,
    p.sku,
    a.qty,
    coalesce(a.avg_cost, 0),
    round(a.qty * coalesce(a.avg_cost, 0), 2)
  FROM agg a
  JOIN products p ON p.id = a.product_id
  ORDER BY p.id
$$;
