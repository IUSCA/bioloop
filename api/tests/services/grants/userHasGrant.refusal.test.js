/**
 * userHasGrant.refusal.test.js
 *
 * An access check with no access types is an under-specified question. It used to answer
 * "any grant": `satisfiedBy([])` returns [] and the query builders read an empty list as no
 * filter. Two lifecycle assertions passed `access_type_id`, a key the function never read, and
 * so could not fail.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Refusal of an under-specified question
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const { randomUUID } = require('crypto');

const prisma = require('@/db');
const grantsService = require('@/services/grants');

afterAll(async () => {
  await prisma.$disconnect();
});

test.each([
  ['no access_types key', {}],
  ['an empty list', { access_types: [] }],
  ['the key the lifecycle tests used to pass', { access_type_id: 1 }],
])('refuses %s', async (_label, args) => {
  await expect(grantsService.userHasGrant({
    user_id: randomUUID(), resource_type: 'DATASET', resource_id: randomUUID(), ...args,
  })).rejects.toThrow('at least one access type');
});
