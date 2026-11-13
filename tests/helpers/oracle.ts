/**
 * Independent expected values.
 *
 * Everything here is computed in TypeScript from the raw table rows, using
 * the business rules in docs/test-strategy.md. It shares no SQL with the
 * reports, so a mistake in a join, a filter or a rounding step in the
 * database does not repeat itself in the expected value.
 */
import { Decimal } from 'decimal.js';
import { query } from './db';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });

const BUSINESS_TIME_ZONE = 'America/Costa_Rica';
const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date of an instant in the company's time zone, as YYYY-MM-DD. */
export function businessDate(instant: Date): string {
  return dateFormat.format(instant);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

interface Invoice {
  id: number;
  customer_id: number;
  kind: 'invoice' | 'credit_note';
  status: 'posted' | 'void';
  issued_at: Date;
  due_date: string;
  references_invoice_id: number | null;
}
interface Line {
  invoice_id: number;
  quantity: string;
  unit_price: string;
  discount_pct: string | null;
  tax_rate: string;
}
interface Payment {
  invoice_id: number;
  paid_at: Date;
  amount: string;
}
interface Movement {
  product_id: number;
  moved_at: Date;
  kind: 'receipt' | 'issue' | 'adjustment';
  quantity: string;
  unit_cost: string | null;
}

export interface Source {
  customers: { id: number; name: string }[];
  products: { id: number; sku: string }[];
  invoices: Invoice[];
  lines: Line[];
  payments: Payment[];
  movements: Movement[];
}

export async function loadSource(): Promise<Source> {
  const [customers, products, invoices, lines, payments, movements] = await Promise.all([
    query<Source['customers'][number]>('SELECT id, name FROM customers'),
    query<Source['products'][number]>('SELECT id, sku FROM products'),
    query<Invoice>('SELECT * FROM invoices'),
    query<Line>('SELECT * FROM invoice_lines'),
    query<Payment>('SELECT * FROM payments'),
    query<Movement>('SELECT * FROM inventory_movements'),
  ]);
  return { customers, products, invoices, lines, payments, movements };
}

export interface Amounts {
  gross: Decimal;
  discount: Decimal;
  net: Decimal;
  tax: Decimal;
}

const ZERO = new Decimal(0);

export function lineAmounts(line: Line): Amounts {
  const gross = new Decimal(line.quantity).times(line.unit_price).toDecimalPlaces(2);
  const discount = gross.times(line.discount_pct ?? 0).div(100).toDecimalPlaces(2);
  const net = gross.minus(discount);
  const tax = net.times(line.tax_rate).toDecimalPlaces(2);
  return { gross, discount, net, tax };
}

function documentTotals(source: Source): Map<number, Amounts> {
  const totals = new Map<number, Amounts>();
  for (const invoice of source.invoices) {
    totals.set(invoice.id, { gross: ZERO, discount: ZERO, net: ZERO, tax: ZERO });
  }
  for (const line of source.lines) {
    const sum = totals.get(line.invoice_id)!;
    const a = lineAmounts(line);
    totals.set(line.invoice_id, {
      gross: sum.gross.plus(a.gross),
      discount: sum.discount.plus(a.discount),
      net: sum.net.plus(a.net),
      tax: sum.tax.plus(a.tax),
    });
  }
  return totals;
}

// ------------------------------------------------------------ monthly sales

export interface ExpectedMonth {
  month: string;
  invoice_count: number;
  credit_note_count: number;
  gross: Decimal;
  discount: Decimal;
  net: Decimal;
  tax: Decimal;
  total: Decimal;
}

export function expectedMonthlySales(source: Source, from: string, to: string): ExpectedMonth[] {
  const totals = documentTotals(source);
  const months = new Map<string, ExpectedMonth>();

  for (const invoice of source.invoices) {
    if (invoice.status !== 'posted') continue;
    const date = businessDate(invoice.issued_at);
    if (date < from || date > to) continue;

    const key = `${date.slice(0, 7)}-01`;
    const row = months.get(key) ?? {
      month: key,
      invoice_count: 0,
      credit_note_count: 0,
      gross: ZERO,
      discount: ZERO,
      net: ZERO,
      tax: ZERO,
      total: ZERO,
    };
    const sign = invoice.kind === 'credit_note' ? -1 : 1;
    const t = totals.get(invoice.id)!;
    if (invoice.kind === 'invoice') row.invoice_count += 1;
    else row.credit_note_count += 1;
    row.gross = row.gross.plus(t.gross.times(sign));
    row.discount = row.discount.plus(t.discount.times(sign));
    row.net = row.net.plus(t.net.times(sign));
    row.tax = row.tax.plus(t.tax.times(sign));
    row.total = row.total.plus(t.net.plus(t.tax).times(sign));
    months.set(key, row);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ------------------------------------------------------------------- aging

export interface ExpectedAging {
  customer_id: number;
  customer_name: string;
  current: Decimal;
  d1_30: Decimal;
  d31_60: Decimal;
  d61_90: Decimal;
  d90_plus: Decimal;
  total: Decimal;
}

type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'd1_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90_plus';
}

export function expectedAging(source: Source, asOf: string): ExpectedAging[] {
  const totals = documentTotals(source);
  const names = new Map(source.customers.map((c) => [c.id, c.name]));
  const reductions = new Map<number, Decimal>();
  const reduce = (invoiceId: number, amount: Decimal) =>
    reductions.set(invoiceId, (reductions.get(invoiceId) ?? ZERO).plus(amount));

  for (const payment of source.payments) {
    if (businessDate(payment.paid_at) <= asOf) reduce(payment.invoice_id, new Decimal(payment.amount));
  }
  for (const note of source.invoices) {
    if (note.kind !== 'credit_note' || note.status !== 'posted') continue;
    if (businessDate(note.issued_at) > asOf) continue;
    const t = totals.get(note.id)!;
    reduce(note.references_invoice_id!, t.net.plus(t.tax));
  }

  const rows = new Map<number, ExpectedAging>();
  for (const invoice of source.invoices) {
    if (invoice.kind !== 'invoice' || invoice.status !== 'posted') continue;
    if (businessDate(invoice.issued_at) > asOf) continue;

    const t = totals.get(invoice.id)!;
    const balance = t.net.plus(t.tax).minus(reductions.get(invoice.id) ?? ZERO);
    if (balance.isZero()) continue;

    const row = rows.get(invoice.customer_id) ?? {
      customer_id: invoice.customer_id,
      customer_name: names.get(invoice.customer_id)!,
      current: ZERO,
      d1_30: ZERO,
      d31_60: ZERO,
      d61_90: ZERO,
      d90_plus: ZERO,
      total: ZERO,
    };
    const bucket = bucketFor(daysBetween(invoice.due_date, asOf));
    row[bucket] = row[bucket].plus(balance);
    row.total = row.total.plus(balance);
    rows.set(invoice.customer_id, row);
  }
  return [...rows.values()].sort((a, b) => a.customer_id - b.customer_id);
}

// --------------------------------------------------------------- valuation

export interface ExpectedValuation {
  product_id: number;
  sku: string;
  qty_on_hand: Decimal;
  avg_unit_cost: Decimal;
  value: Decimal;
}

export function expectedValuation(source: Source, asOf: string): ExpectedValuation[] {
  const skus = new Map(source.products.map((p) => [p.id, p.sku]));
  const byProduct = new Map<number, { qty: Decimal; receivedQty: Decimal; receivedCost: Decimal }>();

  for (const m of source.movements) {
    if (businessDate(m.moved_at) > asOf) continue;
    const p = byProduct.get(m.product_id) ?? { qty: ZERO, receivedQty: ZERO, receivedCost: ZERO };
    const quantity = new Decimal(m.quantity);
    if (m.kind === 'issue') {
      p.qty = p.qty.minus(quantity);
    } else {
      p.qty = p.qty.plus(quantity);
    }
    if (m.kind === 'receipt') {
      p.receivedQty = p.receivedQty.plus(quantity);
      p.receivedCost = p.receivedCost.plus(quantity.times(m.unit_cost!));
    }
    byProduct.set(m.product_id, p);
  }

  return [...byProduct.entries()]
    .map(([productId, p]) => {
      const avg = p.receivedQty.isZero() ? ZERO : p.receivedCost.div(p.receivedQty).toDecimalPlaces(4);
      return {
        product_id: productId,
        sku: skus.get(productId)!,
        qty_on_hand: p.qty,
        avg_unit_cost: avg,
        value: p.qty.times(avg).toDecimalPlaces(2),
      };
    })
    .sort((a, b) => a.product_id - b.product_id);
}
