import { test as base } from '@playwright/test';

// This new "test" can be used in multiple test files, and each of them will
// get the fixtures.
export const test = base.extend({
  testFnParam: [undefined, { option: true }], // default optional param

  testFn: async ({ testFnParam }, use) => {
    console.log(`Fixture received: ${testFnParam}`);
    await use(); // or await use(something)
  },
});

export { expect } from '@playwright/test';
