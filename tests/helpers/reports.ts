import type pg from 'pg';
import { query } from './db';

// Numeric columns arrive as strings; they are compared as decimals, never as floats.

export interface MonthlySalesRow {
  month: string;
  invoice_count: number;
  credit_note_count: number;
  gross: string;
  discount: string;
  net: string;
  tax: string;
  total: string;
}

export interface AgingRow {
  customer_id: number;
  customer_name: string;
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  total: string;
}

export interface ValuationRow {
  product_id: number;
  sku: string;
  qty_on_hand: string;
  avg_unit_cost: string;
  value: string;
}

type Runner = Pick<pg.Pool, 'query'>;

export async function monthlySales(from: string, to: string, runner?: Runner) {
  const sql = 'SELECT * FROM report_monthly_sales($1, $2)';
  if (runner) return (await runner.query<MonthlySalesRow>(sql, [from, to])).rows;
  return query<MonthlySalesRow>(sql, [from, to]);
}

export function arAging(asOf: string) {
  return query<AgingRow>('SELECT * FROM report_ar_aging($1)', [asOf]);
}

export function inventoryValuation(asOf: string) {
  return query<ValuationRow>('SELECT * FROM report_inventory_valuation($1)', [asOf]);
}
