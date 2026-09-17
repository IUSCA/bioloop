/**
 * hydrateEveryAttribute.test.js
 *
 * The boot check proves each declared requirement names a column, a relation, or a
 * registered virtual attribute. It cannot prove the loader runs. This suite hydrates every
 * declared attribute against a real seeded row, so a loader that throws, or a relation the
 * hydrator cannot select, fails in CI rather than as a 500 on the first request that needs it.
 *
 * @see docs/contributing/techniques/authorization-engine.md — Requirements no hydrator can supply
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { policyRegistry, hydratorRegistry } = require('@/authorization');
const { collectRequirements } = require('@/authorization/core/requiresCheck');

/** Every declared attribute, grouped by the hydrator that supplies it. */
function attributesByHydrator() {
  const out = new Map();
  collectRequirements(policyRegistry).forEach(({ hydratorType, attrs }) => {
    if (!out.has(hydratorType)) out.set(hydratorType, new Set());
    attrs.forEach((a) => out.get(hydratorType).add(a));
  });
  return out;
}

const byHydrator = attributesByHydrator();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('every declared attribute hydrates against a seeded row', () => {
  const prismaTypes = [...byHydrator.keys()].filter((t) => t !== 'context');

  test.each(prismaTypes)('%s', async (type) => {
    const hydrator = hydratorRegistry.get(type);
    const row = await prisma[hydrator.model].findFirst({ select: { [hydrator.idAttribute]: true } });
    expect([type, 'seeded row', Boolean(row)]).toEqual([type, 'seeded row', true]);

    // One attribute at a time, so a failure names the attribute.
    // eslint-disable-next-line no-restricted-syntax
    for (const attr of byHydrator.get(type)) {
      let error = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        await hydrator.hydrate({ id: row[hydrator.idAttribute], attributes: [attr] });
      } catch (err) {
        error = err.message;
      }
      expect([`${type}.${attr}`, error]).toEqual([`${type}.${attr}`, null]);
    }
  });

  test('context', async () => {
    const attrs = [...(byHydrator.get('context') ?? [])];
    const user = await prisma.user.findFirst({ select: { subject_id: true } });
    const dataset = await prisma.dataset.findFirst({ select: { resource_id: true } });
    const hydrator = hydratorRegistry.get('context');
    // eslint-disable-next-line no-restricted-syntax
    for (const attr of attrs) {
      let error = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        await hydrator.hydrate({
          id: { user: user.subject_id, resource: dataset.resource_id, resourceType: 'dataset' },
          attributes: [attr],
        });
      } catch (err) {
        error = err.message;
      }
      expect([`context.${attr}`, error]).toEqual([`context.${attr}`, null]);
    }
  });
});
