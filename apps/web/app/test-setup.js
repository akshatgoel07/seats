/**
 * Zero-dependency test harness.
 *
 * Runs under Node's built-in test runner (`node --test`). This module is
 * preloaded via `--import ./app/test-setup.js` so that:
 *   1. `describe`/`test`/`it`/lifecycle hooks are available as globals (matching
 *      the Jest-style tests already in the repo), and
 *   2. a minimal Jest-compatible `expect()` is available globally, implemented
 *      on top of `node:assert/strict`.
 *
 * No external dependencies are added — everything is built into Node.
 */
import {
  test,
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
} from "node:test";
import assert from "node:assert/strict";

Object.assign(globalThis, {
  test,
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
});

function makeMatchers(actual, negated) {
  const ok = (pass, message) => {
    if (negated ? pass : !pass) {
      assert.fail(message);
    }
  };
  return {
    toBe(expected) {
      ok(Object.is(actual, expected), `expected ${format(actual)} ${negated ? "not " : ""}to be ${format(expected)}`);
    },
    toEqual(expected) {
      let equal = true;
      try {
        assert.deepStrictEqual(actual, expected);
      } catch {
        equal = false;
      }
      ok(equal, `expected ${format(actual)} ${negated ? "not " : ""}to deeply equal ${format(expected)}`);
    },
    toBeGreaterThan(expected) {
      ok(actual > expected, `expected ${format(actual)} ${negated ? "not " : ""}to be > ${format(expected)}`);
    },
    toBeGreaterThanOrEqual(expected) {
      ok(actual >= expected, `expected ${format(actual)} ${negated ? "not " : ""}to be >= ${format(expected)}`);
    },
    toBeLessThan(expected) {
      ok(actual < expected, `expected ${format(actual)} ${negated ? "not " : ""}to be < ${format(expected)}`);
    },
    toBeLessThanOrEqual(expected) {
      ok(actual <= expected, `expected ${format(actual)} ${negated ? "not " : ""}to be <= ${format(expected)}`);
    },
    toBeCloseTo(expected, precision = 2) {
      const tolerance = Math.pow(10, -precision) / 2;
      ok(Math.abs(actual - expected) < tolerance, `expected ${format(actual)} ${negated ? "not " : ""}to be close to ${format(expected)}`);
    },
    toContain(expected) {
      ok(actual != null && actual.includes(expected), `expected ${format(actual)} ${negated ? "not " : ""}to contain ${format(expected)}`);
    },
    toHaveLength(expected) {
      ok(actual != null && actual.length === expected, `expected length ${actual?.length} ${negated ? "not " : ""}to be ${expected}`);
    },
    toBeTruthy() {
      ok(Boolean(actual), `expected ${format(actual)} ${negated ? "not " : ""}to be truthy`);
    },
    toBeFalsy() {
      ok(!actual, `expected ${format(actual)} ${negated ? "not " : ""}to be falsy`);
    },
    toBeDefined() {
      ok(actual !== undefined, `expected value ${negated ? "not " : ""}to be defined`);
    },
    toBeUndefined() {
      ok(actual === undefined, `expected ${format(actual)} ${negated ? "not " : ""}to be undefined`);
    },
    toBeNull() {
      ok(actual === null, `expected ${format(actual)} ${negated ? "not " : ""}to be null`);
    },
    toThrow(expected) {
      let threw = false;
      let error;
      try {
        actual();
      } catch (e) {
        threw = true;
        error = e;
      }
      if (expected && threw) {
        const msg = error?.message ?? String(error);
        ok(msg.includes(expected), `expected thrown message ${format(msg)} ${negated ? "not " : ""}to contain ${format(expected)}`);
        return;
      }
      ok(threw, `expected function ${negated ? "not " : ""}to throw`);
    },
  };
}

function format(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function expect(actual) {
  const matchers = makeMatchers(actual, false);
  matchers.not = makeMatchers(actual, true);
  return matchers;
}

globalThis.expect = expect;

export { expect };
