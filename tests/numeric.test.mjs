import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

test('evaluateExpression does arithmetic and keeps units', () => {
  assert.equal(h.evaluateExpression('16/2'), '8');
  assert.equal(h.evaluateExpression('16px / 2'), '8px');
  assert.equal(h.evaluateExpression('10px + 4px'), '14px');
  assert.equal(h.evaluateExpression('(24 - 8) * 2rem'), '32rem');
  assert.equal(h.evaluateExpression('100% / 3'), '33.333%');
  assert.equal(h.evaluateExpression('2 + 3 * 4'), '14');
  assert.equal(h.evaluateExpression('10 - -2'), '12');
  assert.equal(h.evaluateExpression('1.5*2'), '3');
});

test('evaluateExpression leaves non-arithmetic values alone', () => {
  for (const v of ['16', '-4px', 'auto', '1px solid red', 'calc(100% - 8px)', '10px 20px', '#fff', '10px + 2rem', '4 / 0', '2 +', '']) {
    assert.equal(h.evaluateExpression(v), null, v);
  }
});

test('stepValue nudges a single number and keeps its unit', () => {
  assert.equal(h.stepValue('16px', 1), '17px');
  assert.equal(h.stepValue('16px', -10), '6px');
  assert.equal(h.stepValue('1.5', 0.1), '1.6');
  assert.equal(h.stepValue('0.3', -0.1), '0.2');
  assert.equal(h.stepValue('2rem', 1), '3rem');
  assert.equal(h.stepValue('auto', 1, 'px'), '1px');
  assert.equal(h.stepValue('', -1, 'px'), '-1px');
  assert.equal(h.stepValue('10px 20px', 1), null);
  assert.equal(h.stepSize({ shiftKey: true, altKey: false }), 10);
  assert.equal(h.stepSize({ shiftKey: false, altKey: true }), 0.1);
  assert.equal(h.stepSize({ shiftKey: false, altKey: false }, true), 0.1);
});
