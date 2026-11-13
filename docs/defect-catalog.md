# Seeded defect catalog

Each defect below is a small change to `db/02_reports.sql`, defined in `scripts/defects.ts`.
`npm run test:defects` applies them one at a time, runs the suite, and fails if any of them goes unnoticed.

The point is to check the tests, not the reports: a suite that stays green when the report is wrong is worth nothing.

| Defect | Rule | What was broken | Tests that fail |
| --- | --- | --- | --- |
| D01 | R6 | Aging joins payments row by row, so an invoice with two payments is counted twice | 11 |
| D02 | R3 | Monthly sales drops the last day of the range | 10 |
| D03 | R1 | Monthly sales includes void documents | 5 |
| D04 | R4 | Tax is accumulated unrounded instead of rounded per line | 15 |
| D05 | R4 | A missing discount is treated as unknown instead of 0, so those lines vanish from totals | 20 |
| D06 | R7 | Aging puts day 30 in the 31-60 bucket | 6 |
| D07 | R8 | Valuation ignores stock adjustments | 6 |
| D08 | R5 | Credit notes are added to sales instead of subtracted | 4 |
| D09 | R2 | Business date is taken in UTC instead of the company time zone | 10 |
| D10 | R6 | Aging counts payments made after the as-of date | 10 |
| D11 | R4 | Line gross is truncated instead of rounded | 10 |
| D12 | R1 | Void credit notes still reduce the open balance | 10 |
| D13 | R7 | An invoice due on the as-of date falls out of every bucket | 9 |
| D14 | R8 | Average cost is a plain average of receipt prices, not weighted by quantity | 4 |

## Which tests catch each defect

### D01 Aging joins payments row by row, so an invoice with two payments is counted twice

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-03-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2026-06-30
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-03-31
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-06-30
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-07-01
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-12-31
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2026-06-30
- accounts receivable aging report hand-checked customers as of 2025-06-30 Cedar Industrial: two payments and a credit note against one invoice (rule R6)

### D02 Monthly sales drops the last day of the range

- monthly sales report reconciliation with source data matches the source data for the full year
- monthly sales report reconciliation with source data matches the source data for a range that starts and ends mid-month
- monthly sales report reconciliation with source data matches the source data for a single day
- monthly sales report reconciliation with source data counts every posted document of 2025 exactly once
- monthly sales report date boundaries (rules R2 and R3) puts an invoice issued at 23:30 on Jan 31 Costa Rica time in January
- monthly sales report date boundaries (rules R2 and R3) keeps the last second of the year in the year it belongs to
- monthly sales report date boundaries (rules R2 and R3) does not depend on the time zone of the database session
- monthly sales report document status and sign (rules R1 and R5) ignores void documents
- monthly sales report document status and sign (rules R1 and R5) subtracts credit notes
- monthly sales report invariants adds up: four quarters equal the year

### D03 Monthly sales includes void documents

- monthly sales report reconciliation with source data matches the source data for the full year
- monthly sales report reconciliation with source data matches the source data for a range that starts and ends mid-month
- monthly sales report reconciliation with source data counts every posted document of 2025 exactly once
- monthly sales report date boundaries (rules R2 and R3) does not depend on the time zone of the database session
- monthly sales report document status and sign (rules R1 and R5) ignores void documents

### D04 Tax is accumulated unrounded instead of rounded per line

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-03-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2026-06-30
- accounts receivable aging report hand-checked customers as of 2025-06-30 Alder Supply: a payment made at 22:00 local time on the as-of date counts (rule R2)
- accounts receivable aging report hand-checked customers as of 2025-06-30 Brightwater Coatings: an overpayment shows as a credit balance
- monthly sales report reconciliation with source data matches the source data for the full year
- monthly sales report reconciliation with source data matches the source data for a range that starts and ends mid-month
- monthly sales report reconciliation with source data matches the source data for a single day
- monthly sales report line amounts (rule R4) line 1: no discount recorded means 0
- monthly sales report line amounts (rule R4) line 3: tax on 0.10 rounds down to 0.01 per line
- monthly sales report line amounts (rule R4) rounds tax per line, not on the document total
- monthly sales report date boundaries (rules R2 and R3) does not depend on the time zone of the database session
- monthly sales report invariants returns one row per month, in order, with money at 2 decimals

### D05 A missing discount is treated as unknown instead of 0, so those lines vanish from totals

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-03-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2026-06-30
- accounts receivable aging report hand-checked customers as of 2025-06-30 Cedar Industrial: two payments and a credit note against one invoice (rule R6)
- accounts receivable aging report hand-checked customers as of 2025-06-30 Alder Supply: a payment made at 22:00 local time on the as-of date counts (rule R2)
- accounts receivable aging report hand-checked customers as of 2025-06-30 Brightwater Coatings: an overpayment shows as a credit balance
- accounts receivable aging report bucket and date boundaries (rules R6 and R7) moves an invoice from 1-30 to 31-60 on day 31
- accounts receivable aging report bucket and date boundaries (rules R6 and R7) ignores a payment made after the as-of date
- monthly sales report reconciliation with source data matches the source data for the full year
- monthly sales report reconciliation with source data matches the source data for a range that starts and ends mid-month
- monthly sales report reconciliation with source data matches the source data for a single day
- monthly sales report line amounts (rule R4) line 1: no discount recorded means 0
- monthly sales report line amounts (rule R4) line 3: tax on 0.10 rounds down to 0.01 per line
- monthly sales report line amounts (rule R4) line 6: 2.5 x 0.33 = 0.825 rounds half away from zero
- monthly sales report line amounts (rule R4) rounds tax per line, not on the document total
- monthly sales report date boundaries (rules R2 and R3) keeps the last second of the year in the year it belongs to
- monthly sales report date boundaries (rules R2 and R3) does not depend on the time zone of the database session
- monthly sales report invariants net = gross - discount and total = net + tax on every row

### D06 Aging puts day 30 in the 31-60 bucket

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-03-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report hand-checked customers as of 2025-06-30 Cedar Industrial: two payments and a credit note against one invoice (rule R6)
- accounts receivable aging report bucket and date boundaries (rules R6 and R7) moves an invoice from 1-30 to 31-60 on day 31

### D07 Valuation ignores stock adjustments

- inventory valuation report reconciliation with source data matches the source data as of 2025-03-31
- inventory valuation report reconciliation with source data matches the source data as of 2025-06-30
- inventory valuation report reconciliation with source data matches the source data as of 2025-12-31
- inventory valuation report reconciliation with source data on-hand quantity ties to the movement ledger
- inventory valuation report hand-checked products as of 2025-06-30 (rule R8) RM-0001: weighted average of two receipts, less an issue and an adjustment
- inventory valuation report hand-checked products as of 2025-06-30 (rule R8) RM-0004: adjustment only: no cost basis, so no value

### D08 Credit notes are added to sales instead of subtracted

- monthly sales report reconciliation with source data matches the source data for the full year
- monthly sales report reconciliation with source data matches the source data for a range that starts and ends mid-month
- monthly sales report date boundaries (rules R2 and R3) does not depend on the time zone of the database session
- monthly sales report document status and sign (rules R1 and R5) subtracts credit notes

### D09 Business date is taken in UTC instead of the company time zone

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report hand-checked customers as of 2025-06-30 Alder Supply: a payment made at 22:00 local time on the as-of date counts (rule R2)
- inventory valuation report reconciliation with source data matches the source data as of 2025-03-31
- inventory valuation report date boundary (rule R2) includes a receipt booked at 21:00 on the as-of date, Costa Rica time
- monthly sales report reconciliation with source data matches the source data for the full year
- monthly sales report reconciliation with source data counts every posted document of 2025 exactly once
- monthly sales report date boundaries (rules R2 and R3) puts an invoice issued at 23:30 on Jan 31 Costa Rica time in January
- monthly sales report date boundaries (rules R2 and R3) keeps the last second of the year in the year it belongs to
- monthly sales report date boundaries (rules R2 and R3) does not depend on the time zone of the database session

### D10 Aging counts payments made after the as-of date

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-03-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-03-31
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-06-30
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-07-01
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-12-31
- accounts receivable aging report hand-checked customers as of 2025-06-30 Cedar Industrial: two payments and a credit note against one invoice (rule R6)
- accounts receivable aging report bucket and date boundaries (rules R6 and R7) ignores a payment made after the as-of date

### D11 Line gross is truncated instead of rounded

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-03-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2026-06-30
- accounts receivable aging report hand-checked customers as of 2025-06-30 Brightwater Coatings: an overpayment shows as a credit balance
- monthly sales report reconciliation with source data matches the source data for the full year
- monthly sales report reconciliation with source data matches the source data for a range that starts and ends mid-month
- monthly sales report line amounts (rule R4) line 6: 2.5 x 0.33 = 0.825 rounds half away from zero
- monthly sales report date boundaries (rules R2 and R3) does not depend on the time zone of the database session

### D12 Void credit notes still reduce the open balance

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2026-06-30
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-06-30
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-07-01
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2025-12-31
- accounts receivable aging report reconciliation with source data ties to the receivables control total as of 2026-06-30
- accounts receivable aging report hand-checked customers as of 2025-06-30 Cedar Industrial: two payments and a credit note against one invoice (rule R6)
- accounts receivable aging report bucket and date boundaries (rules R6 and R7) moves an invoice from 1-30 to 31-60 on day 31

### D13 An invoice due on the as-of date falls out of every bucket

- accounts receivable aging report reconciliation with source data matches the source data as of 2025-03-31
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-06-30
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-07-01
- accounts receivable aging report reconciliation with source data matches the source data as of 2025-12-31
- accounts receivable aging report hand-checked customers as of 2025-06-30 Alder Supply: a payment made at 22:00 local time on the as-of date counts (rule R2)
- accounts receivable aging report invariants buckets add up to the total on every row as of 2025-03-31
- accounts receivable aging report invariants buckets add up to the total on every row as of 2025-06-30
- accounts receivable aging report invariants buckets add up to the total on every row as of 2025-07-01
- accounts receivable aging report invariants buckets add up to the total on every row as of 2025-12-31

### D14 Average cost is a plain average of receipt prices, not weighted by quantity

- inventory valuation report reconciliation with source data matches the source data as of 2025-03-31
- inventory valuation report reconciliation with source data matches the source data as of 2025-06-30
- inventory valuation report reconciliation with source data matches the source data as of 2025-12-31
- inventory valuation report hand-checked products as of 2025-06-30 (rule R8) RM-0001: weighted average of two receipts, less an issue and an adjustment

## Reading the results

- Most defects are caught by a reconciliation test and by at least one targeted test. The reconciliation says that something is wrong; the targeted test says what.
- D08 and D14 are caught by the fewest tests (4). They are the first place to add cases if the reports grow.
- A defect list like this is never complete. It covers common mistakes in reporting code, not every possible one.
