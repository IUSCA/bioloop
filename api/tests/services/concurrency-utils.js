/**
 * concurrency-utils.js
 *
 * Harness for running concurrency scenarios multiple times with higher fan-out.
 * Instead of a single Promise.allSettled([op1, op2]), each scenario runs RACE_RUNS
 * iterations with potentially more concurrent operations, to stress-test race conditions.
 */

/**
 * Number of independent attempts per scenario.
 * Tunable via environment: RACE_RUNS=20 npx jest ...
 */
const RACE_RUNS = parseInt(process.env.RACE_RUNS ?? '8', 10);

/**
 * Run a race scenario RACE_RUNS times.
 * Each iteration:
 *   1. Calls setup() to provision fresh fixtures
 *   2. Calls race(ctx, i) to get an array of promises to race
 *   3. Fires them concurrently via Promise.allSettled()
 *   4. Calls assert(results, ctx, i) with settled results and context
 *   5. Calls cleanup(ctx, i) in a finally block (errors swallowed)
 *
 * Failures in assert or setup propagate; cleanup errors do not fail the test.
 *
 * @param {(i: number) => Promise<any>}           setup   - provision fresh fixtures
 * @param {(ctx: any, i: number) => Promise<any>[]} race  - return array of promises to race
 * @param {(results, ctx: any, i: number) => Promise<void>|void} assert - check invariant
 * @param {(ctx: any, i: number) => Promise<void>} [cleanup] - teardown fixtures
 */
async function runRace(setup, race, assert, cleanup) {
  for (let i = 0; i < RACE_RUNS; i += 1) {
    const ctx = await setup(i);
    try {
      const results = await Promise.allSettled(race(ctx, i));
      await Promise.resolve(assert(results, ctx, i));
    } finally {
      if (cleanup) {
        try {
          await cleanup(ctx, i);
        } catch {
          // Silently ignore cleanup errors
        }
      }
    }
  }
}

/**
 * Create N copies of the same operation factory.
 * Useful for "run this op 5 times concurrently" scenarios.
 *
 * @param {number} n - number of copies
 * @param {(index: number) => Promise<T>} opFactory - function called with indices 0..n-1
 * @returns {Promise<T>[]} array of promises
 */
function fanOut(n, opFactory) {
  return Array.from({ length: n }, (_, i) => opFactory(i));
}

module.exports = { runRace, fanOut, RACE_RUNS };
