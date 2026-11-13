-- Sample ERP schema. All data is invented for this project.
-- Constraints cover what the database can enforce on its own;
-- the test suite covers the rules it cannot.

CREATE TABLE customers (
  id          integer PRIMARY KEY,
  name        text    NOT NULL,
  country     text    NOT NULL
);

CREATE TABLE products (
  id          integer PRIMARY KEY,
  sku         text    NOT NULL UNIQUE,
  name        text    NOT NULL,
  category    text    NOT NULL
);

CREATE TABLE invoices (
  id                     integer PRIMARY KEY,
  number                 text    NOT NULL UNIQUE,
  customer_id            integer NOT NULL REFERENCES customers (id),
  kind                   text    NOT NULL CHECK (kind IN ('invoice', 'credit_note')),
  status                 text    NOT NULL CHECK (status IN ('posted', 'void')),
  issued_at              timestamptz NOT NULL,
  due_date               date    NOT NULL,
  references_invoice_id  integer REFERENCES invoices (id),
  -- A credit note must point at the invoice it corrects.
  CHECK ((kind = 'credit_note') = (references_invoice_id IS NOT NULL))
);

CREATE TABLE invoice_lines (
  id            integer PRIMARY KEY,
  invoice_id    integer NOT NULL REFERENCES invoices (id),
  line_no       integer NOT NULL,
  product_id    integer NOT NULL REFERENCES products (id),
  quantity      numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price    numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_pct  numeric(5,2)  CHECK (discount_pct BETWEEN 0 AND 100), -- NULL means no discount
  tax_rate      numeric(5,4)  NOT NULL CHECK (tax_rate BETWEEN 0 AND 1),
  UNIQUE (invoice_id, line_no)
);

CREATE TABLE payments (
  id          integer PRIMARY KEY,
  invoice_id  integer NOT NULL REFERENCES invoices (id),
  paid_at     timestamptz NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0)
);

CREATE TABLE inventory_movements (
  id          integer PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES products (id),
  moved_at    timestamptz NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('receipt', 'issue', 'adjustment')),
  -- receipts and issues are positive; adjustments are signed
  quantity    numeric(12,3) NOT NULL CHECK (quantity <> 0 AND (kind = 'adjustment' OR quantity > 0)),
  unit_cost   numeric(12,4),
  CHECK ((kind = 'receipt') = (unit_cost IS NOT NULL))
);
