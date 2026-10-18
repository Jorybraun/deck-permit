import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = '/opt/pipey-deck-runtime';
const dependencies = `${runtime}/node_modules`;

export function visibleTestsPassed(result) {
  return result?.success === true
    && Number.isSafeInteger(result.numTotalTests) && result.numTotalTests > 0
    && result.numPassedTests === result.numTotalTests
    && result.numFailedTests === 0
    && result.numPendingTests === 0;
}

function checkDependencies() {
  if (process.versions.node !== '24.16.0') throw new Error('Expected pinned Node 24.16.0 runtime');
  for (const name of ['package.json', 'package-lock.json']) {
    const actual = createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex');
    const expected = createHash('sha256').update(readFileSync(`${runtime}/${name}`)).digest('hex');
    if (actual !== expected) throw new Error(`${name} differs from the offline runtime; rebuild the image`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    timeout: 25000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
    env: {
      PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp',
      LANG: 'C.UTF-8', CI: '1', NODE_OPTIONS: '--max-old-space-size=1536',
    },
  });
  if (result.error || result.signal || result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').slice(-3000);
    throw new Error(`Command failed: ${result.error?.code || result.signal || result.status}\n${detail}`);
  }
}

export function execute(command) {
  if (!['setup', 'health', 'verify', 'build'].includes(command)) {
    throw new Error('Expected setup, health, verify or build');
  }
  mkdirSync(resolve(root, 'reports'), { recursive: true });
  const report = { command, success: false, evidenceClass: 'local', assessment: false };
  try {
    checkDependencies();
    if (command === 'health' || command === 'build') {
      run([`${dependencies}/typescript/bin/tsc`, '--noEmit']);
    }
    if (command === 'verify') {
      const output = resolve(root, 'reports/visible-tests.json');
      rmSync(output, { force: true });
      run([`${dependencies}/vitest/vitest.mjs`, 'run', '--config', 'environment/vitest.config.mts',
        '--configLoader', 'native', '--reporter', 'json', '--outputFile', 'reports/visible-tests.json']);
      const result = JSON.parse(readFileSync(output, 'utf8'));
      if (!visibleTestsPassed(result)) throw new Error('Visible tests must run and all pass; missing or skipped tests are not a pass');
      report.testCount = result.numTotalTests;
    }
    if (command === 'build') {
      run([`${dependencies}/vite/bin/vite.js`, 'build', '--configLoader', 'native', '--outDir', 'reports/build']);
    }
    report.success = true;
    report.detail = command === 'setup' ? 'Pinned toolchain and locked dependencies already installed; no downloads'
      : command === 'health' ? 'TypeScript compilation passed'
      : command === 'verify' ? 'Existing visible regression tests passed; not challenge completion or candidate assessment'
      : 'TypeScript and Vite production build passed';
  } catch (error) {
    report.detail = error instanceof Error ? error.message : 'Command failed';
  }
  writeFileSync(resolve(root, `reports/${command}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = execute(process.argv[2]);
  console.log(JSON.stringify(report));
  process.exitCode = report.success ? 0 : 1;
}
