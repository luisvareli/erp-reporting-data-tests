# ERP reporting data tests

[![tests](https://github.com/luisvareli/erp-reporting-data-tests/actions/workflows/tests.yml/badge.svg)](https://github.com/luisvareli/erp-reporting-data-tests/actions/workflows/tests.yml)

Automated tests for three financial reports on a sample ERP database (PostgreSQL):
monthly sales, accounts receivable aging and inventory valuation.

A report can look right and still be wrong: a join that doubles an invoice, a
date filter that drops the last day of the month, a total that is off by a cent.
Nothing crashes, and nobody notices until the numbers stop matching accounting.
This project shows how I test for that.

Everything here is invented for the project: the schema, the data and the
reports. It contains nothing from any employer or client.

## What the suite checks

| Layer | Question it answers | How |
| --- | --- | --- |
| Source integrity | Is the data itself consistent? | Queries that return offending rows for rules a constraint cannot express |
| Reconciliation | Does each report agree with the source data? | Expected values recomputed in TypeScript from raw rows, sharing no SQL with the reports |
| Control totals | Does the report tie to the ledger? | Plain, separate sums compared with the report total |
| Hand-checked cases | Is the rule itself implemented correctly? | Edge cases with expected values worked out by hand |
| Boundaries | What happens at the edges? | Time zones, month and year ends, inclusive ranges, aging bucket limits |
| Invariants | Does the report agree with itself? | Buckets add up to totals, quarters add up to the year |

66 tests, about 2 seconds.

## How I know the tests would catch a real defect

Tests that pass prove little on their own. So the project also carries
14 seeded defects: small, realistic mistakes in the report SQL, such as counting
void documents or taking dates in UTC. `npm run test:defects` applies them one at
a time and requires the suite to fail each time. If a defect goes unnoticed, the
command fails, and so does the pipeline.

```
D01  R6  caught by 11 test(s)   Aging joins payments row by row, so an invoice with two payments is counted twice
D02  R3  caught by 10 test(s)   Monthly sales drops the last day of the range
D09  R2  caught by 10 test(s)   Business date is taken in UTC instead of the company time zone
...
14 of 14 seeded defects caught.
```

The full list is in [docs/defect-catalog.md](docs/defect-catalog.md).

## Run it

Requires Node 22 and Docker.

```bash
npm ci
npm run db:up          # PostgreSQL 16 in Docker
npm run db:reset       # schema, reports and seed data
npm test               # the suite
npm run test:defects   # the seeded-defect check
npm run db:down
```

To use another PostgreSQL instance, set `DATABASE_URL` (see `.env.example`).
`db:reset` drops and recreates the `public` schema, so point it at a scratch database.

## Layout

```
db/
  01_schema.sql      tables and constraints
  02_reports.sql     the reports under test, with the business rules they follow
  03_seed.sql        deterministic data: commented edge cases plus generated volume
tests/
  helpers/oracle.ts  independent expected values
  *.test.ts          one file per report, one for source integrity
scripts/
  defects.ts         the seeded defects
  defect-check.ts    runs the suite against each one
docs/
  test-strategy.md   rules, approach and what is out of scope
  defect-catalog.md  each seeded defect and the tests that catch it
```

## Limits

- The reports were written for this project, so this is a demonstration of the
  method, not a record of defects found in a real product.
- The data set is small. Performance and query plans are out of scope.
- The independent calculation and the reports follow the same written rules. If a
  rule is wrong, both are wrong. The hand-checked cases are the guard against that,
  and on a real project the rules would be confirmed with accounting first.

## Author

Luis Vargas Elizondo, QA engineer. [Site](https://luisvareli.github.io/) · [LinkedIn](https://www.linkedin.com/in/luis-vargas-elizondo)
