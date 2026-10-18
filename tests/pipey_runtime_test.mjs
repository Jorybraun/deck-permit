import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleTestsPassed } from '../environment/commands.mjs';

test('pipey_runtime_requires_executed_passing_visible_tests', () => {
  const passed = { success: true, numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0 };
  assert.equal(visibleTestsPassed(passed), true);
  for (const value of [null, {}, { ...passed, success: false }, { ...passed, numTotalTests: 0, numPassedTests: 0 },
    { ...passed, numPassedTests: 1, numFailedTests: 1 }, { ...passed, numPassedTests: 1, numPendingTests: 1 }]) {
    assert.equal(visibleTestsPassed(value), false);
  }
});
