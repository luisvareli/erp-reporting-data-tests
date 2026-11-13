# Test strategy

## What is under test

Three SQL reports in `db/02_reports.sql`:

- `report_monthly_sales(from, to)`: invoiced amounts per month
- `report_ar_aging(as_of)`: open receivables per customer, by days past due
- `report_inventory_valuation(as_of)`: quantity on hand and value per product

## Business rules

The tests are written against these rules, not against the SQL.

| Rule | Statement |
| --- | --- |
| R1 | Only posted documents count. Void documents are ignored everywhere. |
| R2 | The business date of a document is its timestamp in the company time zone (America/Costa_Rica), not UTC and not the session zone. |
| R3 | Date ranges are inclusive on both ends. |
| R4 | Amounts are rounded per line, half away from zero, to 2 decimals. A missing discount means 0. |
| R5 | Credit notes carry the opposite sign of invoices. |
| R6 | Open balance = invoice total, less payments, less credit notes against it, each counted up to the as-of date. |
| R7 | Aging buckets by days past due: 0 or less is current, then 1-30, 31-60, 61-90 and over 90. |
| R8 | On-hand quantity = receipts, less issues, plus adjustments. Unit cost is the weighted average of receipts, at 4 decimals. |

## Approach

**Start with the source data.** If the data breaks its own rules, a wrong report
is a data problem. `source-integrity.test.ts` checks the cross-row rules that
constraints cannot express, and each query returns the offending rows.

**Recompute, do not re-query.** The expected values come from
`tests/helpers/oracle.ts`, which reads the raw tables and applies the rules in
TypeScript with decimal arithmetic. It shares no SQL with the reports. Checking a
report with a second query built from the same joins would repeat the same mistake.

**Tie to a control total.** For aging, the report total is compared with three
separate sums (invoiced, paid, credited). Separate sums cannot fan out, which is
the most common way a receivables report goes wrong.

**Work the hard cases by hand.** The first 16 documents in the seed each target
one failure: an invoice issued at 23:30 local time on the last day of a month, tax
that rounds differently per line than on the total, a void credit note, a payment
made after the as-of date. Their expected values are literals in the tests, with
the arithmetic in a comment.

**Check that the report agrees with itself.** Buckets add up to the total,
quarters add up to the year, and the result does not change with the session
time zone.

**Prove the tests can fail.** See [defect-catalog.md](defect-catalog.md).

## Test data

`db/03_seed.sql` is deterministic. There is no randomness and no dependency on
the current date, so expected values do not drift and a failure can always be
reproduced. The generated part (360 invoices, 30 credit notes, a year of stock
movements) exists so that totals are not trivial and a fan-out or a missing
filter moves the numbers.

The seed spells out the invoice total formula when it creates payments, instead
of reading the report views. Test data that depends on the code under test would
change when that code breaks.

## Out of scope

- Performance, indexing and query plans
- Concurrency (reports reading while documents are being posted)
- Multiple currencies and exchange rates
- Access control on the reports
- The user interface that would display these reports

## What I would add on a real project

- Confirm each rule with accounting before writing tests. Half of report defects
  are a disagreement about the rule, not a coding mistake.
- Run the reconciliation against a masked copy of production data, where real
  edge cases live.
- Compare each release with the previous one on the same data, to catch changes
  nobody intended.
