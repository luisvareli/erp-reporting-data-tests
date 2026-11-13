/**
 * Runs the test suite against each seeded defect and reports which tests
 * caught it. Exits with code 1 if any defect goes unnoticed.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSqlFiles, rebuild } from './db-admin';
import { defects, type Defect } from './defects';

const REPORTS_FILE = '02_reports.sql';

function applyDefect(sql: string, defect: Defect): string {
  let mutated = sql;
  for (const { find, replace } of defect.edits) {
    const occurrences = mutated.split(find).length - 1;
    if (occurrences !== 1) {
      throw new Error(`${defect.id}: expected to find the target text once, found it ${occurrences} times`);
    }
    mutated = mutated.replace(find, replace);
  }
  return mutated;
}

interface VitestJson {
  numFailedTests: number;
  testResults: { assertionResults: { status: string; fullName: string }[] }[];
}

function runSuite(): { failed: string[]; crashed: boolean } {
  const output = join(mkdtempSync(join(tmpdir(), 'defect-check-')), 'result.json');
  spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${output}`], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  try {
    const result = JSON.parse(readFileSync(output, 'utf8')) as VitestJson;
    const failed = result.testResults
      .flatMap((file) => file.assertionResults)
      .filter((test) => test.status === 'failed')
      .map((test) => test.fullName);
    return { failed, crashed: false };
  } catch {
    return { failed: [], crashed: true };
  }
}

const files = readSqlFiles();
const results: { defect: Defect; failed: string[] }[] = [];

try {
  for (const defect of defects) {
    const mutated = files.map((file) =>
      file.name === REPORTS_FILE ? { ...file, sql: applyDefect(file.sql, defect) } : file,
    );
    await rebuild(mutated);
    const { failed, crashed } = runSuite();
    if (crashed) throw new Error(`${defect.id}: the test run produced no result file`);
    results.push({ defect, failed });
    const verdict = failed.length > 0 ? `caught by ${failed.length} test(s)` : 'NOT CAUGHT';
    console.log(`${defect.id}  ${defect.rule}  ${verdict.padEnd(22)} ${defect.title}`);
  }
} finally {
  await rebuild(files); // always leave the database in its correct state
}

const missed = results.filter((r) => r.failed.length === 0);
const lines = [
  '## Seeded defect check',
  '',
  `${results.length - missed.length} of ${results.length} seeded defects were caught by the suite.`,
  '',
  '| Defect | Rule | What was broken | Tests that failed |',
  '| --- | --- | --- | --- |',
  ...results.map(
    ({ defect, failed }) =>
      `| ${defect.id} | ${defect.rule} | ${defect.title} | ${failed.length || '**none**'} |`,
  ),
];
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

console.log(`\n${results.length - missed.length} of ${results.length} seeded defects caught.`);
if (process.argv.includes('--verbose')) {
  for (const { defect, failed } of results) {
    console.log(`\n${defect.id} ${defect.title}`);
    for (const name of failed) console.log(`   - ${name}`);
  }
}
if (missed.length > 0) {
  console.error(`Not caught: ${missed.map((r) => r.defect.id).join(', ')}`);
  process.exit(1);
}
