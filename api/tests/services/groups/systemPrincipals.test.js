/**
 * systemPrincipals.test.js
 *
 * `Authenticated Users` and `Public` are grant subjects. They own nothing, contribute nothing,
 * are credited with nothing, hold no authority over a grant, and have no members or
 * sub-groups. The database refuses each of these, and the services and creation routes refuse
 * them first with a message that says why.
 *
 * The rows themselves cannot be modified either. A trigger refuses the UPDATE as a check_violation,
 * and the error middleware answers every check_violation with a 409 that names nothing internal.
 *
 * Every route test runs as a platform admin, because a platform admin passes the create
 * policies on any group. Without the refusal, that caller reaches the insert and gets the
 * database's unnamed constraint violation instead.
 *
 * @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const { randomUUID } = require('crypto');
const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

const prisma = require('@/db');
const { errorHandler, prismaConstraintFailedHandler } = require('@/middleware/error');
const { initializePolicyContext } = require('@/authorization');
const groupsService = require('@/services/groups');
const { createInvitation } = require('@/services/invitations');
const { recordAffiliations } = require('@/services/datasets_v2/attribution');
const datasetRoutes = require('@/routes/datasets_v2');
const collectionRoutes = require('@/routes/collections');
const groupRoutes = require('@/routes/groups');
const { assertNotSystemPrincipal } = require('@/services/system_principals');
const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  getAccessTypeId,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use(initializePolicyContext);
app.use('/v2/datasets', datasetRoutes);
app.use('/collections', collectionRoutes);
app.use('/groups', groupRoutes);
app.use(prismaConstraintFailedHandler);
app.use(errorHandler);

const ROLLBACK = new Error('rollback');

/**
 * Runs writes that are expected to succeed, then rolls them back, so a control leaves no rows.
 * @param {function(import('@prisma/client').Prisma.TransactionClient): Promise<void>} fn
 */
async function withinRollback(fn) {
  await expect(prisma.$transaction(async (tx) => {
    await fn(tx);
    throw ROLLBACK;
  })).rejects.toBe(ROLLBACK);
}

let platformAdmin;
let group;
let dataset;
let accessTypeId;

beforeAll(async () => {
  platformAdmin = await createTestUser('_sp_platform');
  const role = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: platformAdmin.id, role_id: role.id } });
  currentUser = { ...platformAdmin, roles: ['admin'] };

  group = await createTestGroup(platformAdmin.subject_id, '_sp_group');
  dataset = await createTestDataset(group.id, '_sp_ds');
  accessTypeId = await getAccessTypeId('DATASET:VIEW_METADATA');
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } });
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await prisma.user_role.deleteMany({ where: { user_id: platformAdmin.id } });
  await deleteUser(platformAdmin.id);
  await prisma.$disconnect();
}, 30_000);

describe.each(SYSTEM_PRINCIPAL_GROUP_IDS)('the database refuses system principal %s', (principal) => {
  test('as the owner of a dataset', async () => {
    await expect(prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({ data: { id: randomUUID(), type: 'DATASET' } });
      await tx.dataset.create({
        data: {
          name: `_sp_${randomUUID()}`, type: 'RAW_DATA', resource_id: resource.id, owner_group_id: principal,
        },
      });
    })).rejects.toThrow(/dataset_owner_not_system_principal/);
  });

  test('as the owner of a collection', async () => {
    await expect(prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({ data: { id: randomUUID(), type: 'COLLECTION' } });
      await tx.collection.create({
        data: {
          id: resource.id, name: `_sp_${resource.id}`, slug: `_sp_${resource.id}`, owner_group_id: principal,
        },
      });
    })).rejects.toThrow(/collection_owner_not_system_principal/);
  });

  test('as the owner of an import source', async () => {
    await expect(prisma.import_source.create({
      data: { path: `/tmp/_sp_${randomUUID()}`, owner_group_id: principal },
    })).rejects.toThrow(/import_source_owner_not_system_principal/);
  });

  test('as the group a contribution is made to', async () => {
    await expect(prisma.user_dataset_contribution.create({
      data: { group_id: principal, user_id: platformAdmin.subject_id, dataset_id: dataset.resource_id },
    })).rejects.toThrow(/user_dataset_contribution_group_not_system_principal/);
  });

  test('as an affiliated group', async () => {
    await expect(prisma.dataset_affiliation.create({
      data: { dataset_id: dataset.id, group_id: principal },
    })).rejects.toThrow(/dataset_affiliation_group_not_system_principal/);
  });

  test.each(['issuing_authority_id', 'revoking_authority_id'])('as a grant\'s %s', async (column) => {
    // The other column is NULL, which is the case a CHECK joined by AND could let through.
    await expect(prisma.grant.create({
      data: {
        subject_id: platformAdmin.subject_id,
        resource_id: dataset.resource_id,
        access_type_id: accessTypeId,
        granted_by: platformAdmin.subject_id,
        creation_type: 'MANUAL',
        [column]: principal,
      },
    })).rejects.toThrow(/grant_authority_not_system_principal/);
  });
});

describe('the database still admits what the checks are not about', () => {
  test('an import source, an affiliation, and a grant that name no group', async () => {
    await withinRollback(async (tx) => {
      await tx.import_source.create({ data: { path: `/tmp/_sp_${randomUUID()}`, owner_group_id: null } });
      await tx.dataset_affiliation.create({ data: { dataset_id: dataset.id, organization: 'Elsewhere' } });
      await tx.grant.create({
        data: {
          subject_id: platformAdmin.subject_id,
          resource_id: dataset.resource_id,
          access_type_id: accessTypeId,
          granted_by: platformAdmin.subject_id,
          creation_type: 'MANUAL',
        },
      });
    });
  });

  test('a grant whose subject is a system principal', async () => {
    // A system principal is what grants are given to, so the subject column stays open.
    await withinRollback(async (tx) => {
      for (const principal of SYSTEM_PRINCIPAL_GROUP_IDS) {
        // eslint-disable-next-line no-await-in-loop
        await tx.grant.create({
          data: {
            subject_id: principal,
            resource_id: dataset.resource_id,
            access_type_id: accessTypeId,
            granted_by: platformAdmin.subject_id,
            creation_type: 'MANUAL',
            issuing_authority_id: group.id,
          },
        });
      }
    });
  });
});

describe.each(SYSTEM_PRINCIPAL_GROUP_IDS)('the services refuse system principal %s', (principal) => {
  test('as the group an invitation is to', async () => {
    const email = `_sp_${randomUUID()}@test.invalid`;
    await expect(createInvitation({ group_id: principal, email, invited_by: platformAdmin.subject_id }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/system groups/) });
    expect(await prisma.group_invitation.count({ where: { invited_email: email } })).toBe(0);
  });

  test('as the group a member is added to', async () => {
    await expect(groupsService.addGroupMembers(principal, {
      user_ids: [platformAdmin.subject_id], actor_id: platformAdmin.subject_id,
    })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/system groups/) });
  });

  test('as the parent of a new group', async () => {
    const name = `_sp_child_${randomUUID()}`;
    await expect(groupsService.createGroup({
      data: { name }, actor_id: platformAdmin.subject_id, parent_id: principal,
    })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/system groups/) });
    expect(await prisma.group.count({ where: { name } })).toBe(0);
  });

  test('as an affiliated group', async () => {
    await expect(recordAffiliations(dataset.id, [{ group_id: principal }]))
      .rejects.toThrow(/system groups/);
  });
});

describe.each(SYSTEM_PRINCIPAL_GROUP_IDS)('a platform admin cannot create under system principal %s', (principal) => {
  test('POST /v2/datasets', async () => {
    const res = await request(app).post('/v2/datasets').send({
      name: `_sp_${randomUUID()}`, type: 'RAW_DATA', owner_group_id: principal, origin_path: '/tmp/_sp',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/system groups/);
  });

  test('POST /v2/datasets/bulk', async () => {
    const res = await request(app).post('/v2/datasets/bulk').send({
      datasets: [{
        name: `_sp_${randomUUID()}`, type: 'RAW_DATA', owner_group_id: principal, origin_path: '/tmp/_sp',
      }],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/system groups/);
  });

  test('POST /v2/datasets/imports', async () => {
    const res = await request(app).post('/v2/datasets/imports').send({
      name: `_sp_${randomUUID()}`, type: 'RAW_DATA', owner_group_id: principal, origin_path: '/tmp/_sp',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/system groups/);
  });

  test('POST /v2/datasets/uploads', async () => {
    const res = await request(app).post('/v2/datasets/uploads').send({
      name: `_sp_${randomUUID()}`, type: 'RAW_DATA', owner_group_id: principal,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/system groups/);
  });

  test('GET /v2/datasets/name-available', async () => {
    const res = await request(app).get('/v2/datasets/name-available')
      .query({ name: `_sp_${randomUUID()}`, type: 'RAW_DATA', owner_group_id: principal });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/system groups/);
  });

  test('POST /collections', async () => {
    const res = await request(app).post('/collections').send({
      name: `_sp_${randomUUID()}`, owner_group_id: principal,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/system groups/);
  });
});

describe.each(SYSTEM_PRINCIPAL_GROUP_IDS)('system principal %s cannot be modified', (principal) => {
  test('through the Prisma client', async () => {
    await expect(prisma.group.update({ where: { id: principal }, data: { tagline: 'edited' } }))
      .rejects.toThrow(/cannot be modified/);
  });

  test('through raw SQL', async () => {
    await expect(prisma.$executeRaw`UPDATE "group" SET is_archived = true WHERE id = ${principal}`)
      .rejects.toThrow(/cannot be modified/);
  });

  test('PATCH /groups/:id answers 409 and names nothing internal', async () => {
    const { version } = await prisma.group.findUniqueOrThrow({ where: { id: principal }, select: { version: true } });
    const res = await request(app).patch(`/groups/${principal}`).send({ version, description: 'edited' });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Request could not be processed due to a constraint violation');
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${principal}|system_principal|23514`));
  });
});

describe('the check the trigger is about', () => {
  test('an ordinary group can still be modified', async () => {
    const updated = await prisma.group.update({ where: { id: group.id }, data: { tagline: 'edited' } });
    expect(updated.tagline).toBe('edited');
  });

  test('a check_violation from a raw query is answered 409 without the failing row', async () => {
    // A raw query reports the Postgres code in `meta.code` rather than in the message, and the
    // Postgres message echoes the row, including the path.
    const pathValue = `/tmp/_sp_${randomUUID()}`;
    const error = await prisma.$executeRaw`
      INSERT INTO import_source (path, owner_group_id, updated_at)
      VALUES (${pathValue}, ${SYSTEM_PRINCIPAL_GROUP_IDS[1]}, now())
    `.catch((e) => e);

    const forwarded = await new Promise((resolve) => {
      prismaConstraintFailedHandler(error, {}, {}, resolve);
    });
    expect(forwarded.status).toBe(409);
    expect(forwarded.expose).toBe(true);
    expect(forwarded.message).not.toContain(pathValue);
  });

  test('an error that is not a check_violation passes through', async () => {
    const error = new Error('something else');
    const forwarded = await new Promise((resolve) => {
      prismaConstraintFailedHandler(error, {}, {}, resolve);
    });
    expect(forwarded).toBe(error);
  });
});

describe('assertNotSystemPrincipal', () => {
  test('refuses a role it has no wording for, whatever the group', () => {
    expect(() => assertNotSystemPrincipal(group.id, 'steward')).toThrow(/no refusal defined for role "steward"/);
  });

  test('admits an ordinary group in every role', () => {
    ['owner', 'member', 'parent', 'affiliation'].forEach((role) => {
      expect(() => assertNotSystemPrincipal(group.id, role)).not.toThrow();
    });
  });
});
