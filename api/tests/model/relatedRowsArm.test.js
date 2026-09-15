/**
 * relatedRowsArm.test.js
 *
 * The Related rows arm, for groups: every ancestor and descendant row `projectRows` returns
 * for a group, against that row's own `view_metadata` decision. A row the caller may view is
 * projected by its own rules, any other row by the group list's public attributes, and `depth`
 * describes the relation, so it survives either way.
 *
 * The routes used to project these rows by the decision on the group in the URL. The arm counts
 * the rows where that projection differs from the row's own, so a world without such rows fails
 * instead of passing by construction.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Projection applied to rows it was not decided for
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction, projectRows, policyRegistry } = require('@/authorization');
const { PrismaHydrator } = require('@/authorization/core/hydrators/PrismaHydrator');
const { PUBLIC_ATTRIBUTES } = require('@/authorization/builtin/policies/group');
const groupService = require('@/services/groups');
const { projectObject } = require('@/utils/expression');
const { ANONYMOUS_PRINCIPAL } = require('@/constants');

const { modelTablesFrom } = require('./tables');
const { outcomeSignature } = require('./decisionTable');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');

const tables = modelTablesFrom(policyRegistry);

let written;
let fragments;

beforeAll(async () => {
  const { cells } = W.addSensitivityPairs(W.allPairs(), (cell) => outcomeSignature(tables, cell));
  let world;
  ({ world, fragments } = W.buildWorld(cells, { now: new Date() }));
  written = await writeWorld(prisma, world);
}, 300_000);

afterAll(async () => {
  if (written) await written.cleanup();
  await prisma.$disconnect();
}, 120_000);

function freshContext(anonymous) {
  const context = { cache: { user: new Map(), resource: new Map(), context: new Map() } };
  if (anonymous) {
    context.cache.user.set(PrismaHydrator.cacheKey('user', ANONYMOUS_PRINCIPAL.subject_id), { ...ANONYMOUS_PRINCIPAL });
  }
  return context;
}

/** The projection a decision gives a row, or the public attributes when it refuses. */
const projectBy = (decision, row) => (decision.granted ? decision.filter(row) : projectObject(row, PUBLIC_ATTRIBUTES));

const withoutMeta = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== '_meta'));

test('every ancestor and descendant row is projected by its own decision', async () => {
  const wrong = [];
  let compared = 0;
  let opened = 0;
  let refused = 0;
  let parentWouldDiffer = 0;
  const dbId = (worldId) => written.ids.get(worldId);
  for (const f of fragments) {
    const anonymous = f.user.anonymous === true;
    const user = anonymous ? ANONYMOUS_PRINCIPAL.subject_id : dbId(f.user.id);
    const groupId = dbId(f.owner.id);
    const req = {
      user: anonymous ? { ...ANONYMOUS_PRINCIPAL } : { subject_id: user },
      policyContext: freshContext(anonymous),
    };
    const parent = await authorizeAction('group', 'view_ancestors', {
      identifiers: { user, resource: groupId },
      policyExecutionContext: freshContext(anonymous),
    });
    const related = [
      ...await groupService.getGroupAncestors(groupId),
      ...await groupService.getGroupDescendants(groupId, {}),
    ];
    const projected = await projectRows('group', related, {
      req, idOf: (g) => g.id, publicAttributes: PUBLIC_ATTRIBUTES, relationAttributes: ['depth'],
    });
    for (const [i, row] of related.entries()) {
      const own = await authorizeAction('group', 'view_metadata', {
        identifiers: { user, resource: row.id },
        policyExecutionContext: freshContext(anonymous),
      });
      const expected = { ...projectBy(own, row), depth: row.depth };
      compared += 1;
      if (own.granted) opened += 1; else refused += 1;
      if (parent.granted && JSON.stringify(parent.filter(row)) !== JSON.stringify(projectBy(own, row))) {
        parentWouldDiffer += 1;
      }
      if (JSON.stringify(withoutMeta(projected[i])) !== JSON.stringify(expected)) {
        wrong.push(`cell ${f.index} group ${row.id}: got ${JSON.stringify(withoutMeta(projected[i]))} `
          + `expected ${JSON.stringify(expected)}`);
      }
    }
  }
  expect(wrong).toEqual([]);
  expect(compared).toBeGreaterThan(100);
  // Forced unless rows both open and refuse, and the parent's projection would have been wrong.
  expect(opened).toBeGreaterThan(0);
  expect(refused).toBeGreaterThan(0);
  expect(parentWouldDiffer).toBeGreaterThan(0);
}, 600_000);
