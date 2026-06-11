/**
 * Zero-dependency test harness.
 *
 * Runs under Node's built-in test runner (`node --test`). This module is
 * preloaded via `--import ./app/test-setup.ts` so that:
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

function makeMatchers(actual: unknown, negated: boolean) {
  const ok = (pass: boolean, message: string) => {
    if (negated ? pass : !pass) {
      assert.fail(message);
    }
  };
  return {
    toBe(expected: unknown) {
      ok(Object.is(actual, expected), `expected ${format(actual)} ${negated ? "not " : ""}to be ${format(expected)}`);
    },
    toEqual(expected: unknown) {
      let equal = true;
      try {
        assert.deepStrictEqual(actual, expected);
      } catch {
        equal = false;
      }
      ok(equal, `expected ${format(actual)} ${negated ? "not " : ""}to deeply equal ${format(expected)}`);
    },
    toBeGreaterThan(expected: number) {
      ok(Number(actual) > expected, `expected ${format(actual)} ${negated ? "not " : ""}to be > ${format(expected)}`);
    },
    toBeGreaterThanOrEqual(expected: number) {
      ok(Number(actual) >= expected, `expected ${format(actual)} ${negated ? "not " : ""}to be >= ${format(expected)}`);
    },
    toBeLessThan(expected: number) {
      ok(Number(actual) < expected, `expected ${format(actual)} ${negated ? "not " : ""}to be < ${format(expected)}`);
    },
    toBeLessThanOrEqual(expected: number) {
      ok(Number(actual) <= expected, `expected ${format(actual)} ${negated ? "not " : ""}to be <= ${format(expected)}`);
    },
    toBeCloseTo(expected: number, precision = 2) {
      const tolerance = Math.pow(10, -precision) / 2;
      ok(Math.abs(Number(actual) - expected) < tolerance, `expected ${format(actual)} ${negated ? "not " : ""}to be close to ${format(expected)}`);
    },
    toContain(expected: unknown) {
      const container = actual as { includes?: (value: unknown) => boolean } | null | undefined;
      ok(Boolean(container?.includes?.(expected)), `expected ${format(actual)} ${negated ? "not " : ""}to contain ${format(expected)}`);
    },
    toHaveLength(expected: number) {
      const sized = actual as { length?: number } | null | undefined;
      ok(sized?.length === expected, `expected length ${sized?.length} ${negated ? "not " : ""}to be ${expected}`);
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
    toThrow(expected?: string) {
      let threw = false;
      let error: unknown;
      try {
        (actual as () => unknown)();
      } catch (e) {
        threw = true;
        error = e;
      }
      if (expected && threw) {
        const msg = error instanceof Error ? error.message : String(error);
        ok(msg.includes(expected), `expected thrown message ${format(msg)} ${negated ? "not " : ""}to contain ${format(expected)}`);
        return;
      }
      ok(threw, `expected function ${negated ? "not " : ""}to throw`);
    },
  };
}

function format(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function expect(actual: unknown) {
  const matchers = makeMatchers(actual, false) as ReturnType<typeof makeMatchers> & {
    not: ReturnType<typeof makeMatchers>;
  };
  matchers.not = makeMatchers(actual, true);
  return matchers;
}

globalThis.expect = expect;

export { expect };
