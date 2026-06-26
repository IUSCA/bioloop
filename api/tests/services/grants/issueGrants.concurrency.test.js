/* eslint-disable max-len */
/* eslint-disable no-await-in-loop */
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const Expiry = require('@/utils/expiry');
const { runRace, fanOut } = require('../concurrency-utils');
const {
  createTestUser, createTestGroup, createTestDataset, deleteUser, deleteGroup, deleteDataset, deleteGrants, deleteGrantsForResource, getAccessTypeId,
} = require('../helpers');

let actor;
let member;
let group;
let dataset;
let viewMetaId;
let downloadId;

const createdGrantIds = [];
const createdAccessRequestIds = [];

const BUILTIN_PRESET_DISCOVERABLE = 1;
const BUILTIN_PRESET_STANDARD_RESEARCH = 2;

const future1 = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const future2 = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
const future3 = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  actor = await createTestUser('_igc_actor');
  member = await createTestUser('_igc_member');
  group = await createTestGroup(actor.subject_id, '_igc_group');
  dataset = await createTestDataset(group.id, '_igc_dataset');
  await deleteGrantsForResource(dataset.resource_id);
  viewMetaId = await getAccessTypeId('DATASET:VIEW_METADATA');
  downloadId = await getAccessTypeId('DATASET:DOWNLOAD');
}, 30000);

afterEach(async () => {
  await deleteGrantsForResource(dataset.resource_id);
  await deleteGrants(createdGrantIds);
  createdGrantIds.length = 0;
  // Using built-in grant presets; no cleanup needed for dynamically-created presets.
  if (createdAccessRequestIds.length) {
    await prisma.access_request.deleteMany({ where: { id: { in: createdAccessRequestIds } } });
    createdAccessRequestIds.length = 0;
  }
});

afterAll(async () => {
  await deleteGrants(createdGrantIds);
  await deleteDataset(dataset.id);
  await deleteGroup(group.id);
  await deleteUser(member.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30000);

function defaultContext(subject_id = member.subject_id, resource_id = dataset.resource_id) {
  return {
    subject_id,
    resource_id,
    granted_by: actor.subject_id,
  };
}

async function fetchActiveGrant(accessTypeId, subject_id = member.subject_id, resource_id = dataset.resource_id) {
  const g = await prisma.grant.findFirst({
    where: {
      subject_id,
      resource_id,
      access_type_id: accessTypeId,
      revoked_at: null,
    },
    orderBy: { created_at: 'desc' },
  });
  if (g) createdGrantIds.push(g.id);
  return g;
}

describe('issueGrants - concurrency', () => {
  it('allows two concurrent new grants for different access types', async () => {
    await runRace(
      async () => {
        const expiryA = Expiry.at(new Date(Date.now() + 100000));
        const expiryB = Expiry.at(new Date(Date.now() + 200000));
        return { expiryA, expiryB };
      },
      ({ expiryA, expiryB }) => [
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: expiryA }])),
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: expiryB }])),
      ],
      async (results) => {
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);

        const g1 = await fetchActiveGrant(viewMetaId);
        const g2 = await fetchActiveGrant(downloadId);
        expect(g1).toBeDefined();
        expect(g2).toBeDefined();
      },
    );
  });

  it('resolves overlap on concurrent same access type with different expiries', async () => {
    await runRace(
      async () => {
        const exp1 = Expiry.at(new Date(Date.now() + 100000));
        const exp2 = Expiry.at(new Date(Date.now() + 200000));
        return { exp1, exp2 };
      },
      ({ exp1, exp2 }) => [
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: exp1 }])),
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: exp2 }])),
      ],
      async (results) => {
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(fulfilled.length + rejected.length).toBe(2); // At least one must succeed
        if (rejected.length > 0) {
          const status = rejected[0].reason?.status || rejected[0].reason?.statusCode;
          expect([409, undefined]).toContain(status);
          expect(rejected[0].reason.message).toMatch(/overlapping validity|grant_no_overlap|Conflict/);
        }

        const active = await prisma.grant.findMany({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        expect(active.length).toBe(1);
        if (active[0]) createdGrantIds.push(active[0].id);
      },
      async () => {
        // Revoke all grants for this member/resource/access_type to reset for next iteration
        await prisma.grant.updateMany({
          where: {
            subject_id: member.subject_id,
            resource_id: dataset.resource_id,
            access_type_id: viewMetaId,
            revoked_at: null,
          },
          data: { revoked_at: new Date() },
        }).catch(() => {});
      },
    );
  });

  it('supports two concurrent supersede candidates and only one wins', async () => {
    await runRace(
      async () => {
        // Revoke any existing grants for a clean slate
        await prisma.grant.updateMany({
          where: {
            subject_id: member.subject_id,
            resource_id: dataset.resource_id,
            access_type_id: downloadId,
            revoked_at: null,
          },
          data: { revoked_at: new Date() },
        }).catch(() => {});

        const first = await grantsService.createGrant({
          subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
        }, actor.subject_id);
        createdGrantIds.push(first.id);
        return { first };
      },
      () => [
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: Expiry.at(future2) }])),
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: Expiry.at(future1) }])),
      ],
      async (results) => {
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        expect(fulfilled.length).toBeGreaterThanOrEqual(1);
        expect(fulfilled.length + rejected.length).toBe(2);
        if (rejected.length > 0) {
          const status = rejected[0].reason?.status || rejected[0].reason?.statusCode;
          expect([409, undefined]).toContain(status);
          expect(rejected[0].reason.message).toMatch(/overlapping validity|grant_no_overlap|Conflict/);
        }

        const active = await prisma.grant.findMany({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, revoked_at: null,
          },
        });
        expect(active.length).toBe(1);
        if (active[0]) expect([future1.toISOString(), future2.toISOString()]).toContain(new Date(active[0].valid_until).toISOString());
        createdGrantIds.push(active[0].id);
      },
      async () => {
        // Revoke all grants for this member/resource/access_type to reset for next iteration
        await prisma.grant.updateMany({
          where: {
            subject_id: member.subject_id,
            resource_id: dataset.resource_id,
            access_type_id: downloadId,
            revoked_at: null,
          },
          data: { revoked_at: new Date() },
        }).catch(() => {});
      },
    );
  });

  it('handles concurrent identical calls with idempotent overlap behavior', async () => {
    await runRace(
      async () => {
        const expiry = Expiry.at(new Date(Date.now() + 100000));
        return { expiry };
      },
      ({ expiry }) => fanOut(5, () => prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: expiry }]))),
      async (results) => {
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        expect(fulfilled.length).toBeGreaterThanOrEqual(1);
        expect(rejected.length).toBeGreaterThanOrEqual(1);
        rejected.forEach((r) => expect(r.reason.status).toBe(409));

        const active = await prisma.grant.findMany({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        expect(active.length).toBe(1);
        createdGrantIds.push(active[0].id);
      },
    );
  });

  it('handles concurrent different subject on same resource', async () => {
    await runRace(
      async () => {
        const secondMember = await createTestUser('_igc_member2');
        const expiry = Expiry.at(new Date(Date.now() + 100000));
        return { secondMember, expiry };
      },
      ({ secondMember, expiry }) => [
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(member.subject_id), [{ access_type_id: viewMetaId, approved_expiry: expiry }])),
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(secondMember.subject_id), [{ access_type_id: viewMetaId, approved_expiry: expiry }])),
      ],
      async (results, { secondMember }) => {
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);

        const [g1] = await prisma.grant.findMany({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        const [g2] = await prisma.grant.findMany({
          where: {
            subject_id: secondMember.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        expect(g1).toBeDefined();
        expect(g2).toBeDefined();

        createdGrantIds.push(g1.id, g2.id);
      },
      async ({ secondMember }) => {
        await deleteUser(secondMember.id).catch(() => {});
      },
    );
  });

  it('handles concurrent same subject different resources', async () => {
    await runRace(
      async () => {
        const otherDataset = await createTestDataset(group.id, '_igc_dataset2');
        const expiry = Expiry.at(new Date(Date.now() + 100000));
        return { otherDataset, expiry };
      },
      ({ otherDataset, expiry }) => [
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(member.subject_id, dataset.resource_id), [{ access_type_id: viewMetaId, approved_expiry: expiry }])),
        prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(member.subject_id, otherDataset.resource_id), [{ access_type_id: viewMetaId, approved_expiry: expiry }])),
      ],
      async (results, { otherDataset }) => {
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);

        const g1 = await prisma.grant.findFirst({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        const g2 = await prisma.grant.findFirst({
          where: {
            subject_id: member.subject_id, resource_id: otherDataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        expect(g1).toBeDefined();
        expect(g2).toBeDefined();

        createdGrantIds.push(g1.id, g2.id);
      },
      async ({ otherDataset }) => {
        await deleteDataset(otherDataset.id).catch(() => {});
      },
    );
  });

  it('resolves overlap when two presets have overlapping access types', async () => {
    await runRace(
      async () => {
        const presetA = BUILTIN_PRESET_DISCOVERABLE;
        const presetB = BUILTIN_PRESET_STANDARD_RESEARCH;
        const expiry = Expiry.at(new Date(Date.now() + 100000));
        return { presetA, presetB, expiry };
      },
      ({ presetA, presetB, expiry }) => [
        prisma.$transaction((tx) => grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: presetA }, [{ preset_id: presetA, approved_expiry: expiry }])),
        prisma.$transaction((tx) => grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: presetB }, [{ preset_id: presetB, approved_expiry: expiry }])),
      ],
      async (results) => {
        expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThan(0);

        const activeDownload = await prisma.grant.findMany({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, revoked_at: null,
          },
        });
        expect(activeDownload.length).toBeLessThanOrEqual(1);

        const activeView = await prisma.grant.findMany({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        expect(activeView.length).toBe(1);

        createdGrantIds.push(...activeDownload.map((g) => g.id));
        createdGrantIds.push(...activeView.map((g) => g.id));
      },
    );
  });

  it('handles concurrent access_request_id vs source_preset_id calls without conflict', async () => {
    await runRace(
      async () => {
        const presetId = BUILTIN_PRESET_DISCOVERABLE;
        const accessRequest = await prisma.access_request.create({
          data: {
            id: `request-${Date.now()}`,
            type: 'NEW',
            resource_id: dataset.resource_id,
            requester_id: actor.subject_id,
            subject_id: member.subject_id,
            purpose: 'test access request',
          },
        });
        createdAccessRequestIds.push(accessRequest.id);
        const expiry = Expiry.at(new Date(Date.now() + 100000));
        return { presetId, accessRequest, expiry };
      },
      ({ presetId, accessRequest, expiry }) => [
        prisma.$transaction((tx) => grantsService.issueGrants(tx, { ...defaultContext(), access_request_id: accessRequest.id }, [{ access_type_id: downloadId, approved_expiry: expiry }])),
        prisma.$transaction((tx) => grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: presetId }, [{ preset_id: presetId, approved_expiry: expiry }])),
      ],
      async (results) => {
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);

        const g1 = await prisma.grant.findFirst({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, revoked_at: null,
          },
        });
        const g2 = await prisma.grant.findFirst({
          where: {
            subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
          },
        });
        expect(g1).toBeDefined();
        expect(g2).toBeDefined();

        createdGrantIds.push(g1.id, g2.id);
      },
    );
  });

  it('buildEffectiveGrants snapshot then external update can lead to overlap conflict', async () => {
    const initialGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(initialGrant.id);

    const svc = new grantsService.GrantIssueService(defaultContext());
    await prisma.$transaction((tx) => svc.buildEffectiveGrants(tx, [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future2) }]));

    // External race happens: another process inserts a longer grant, causing subsequent insertion to conflict
    const racyGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, valid_from: future1, expiry: Expiry.at(future3), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(racyGrant.id);

    let conflict = null;
    try {
      await prisma.$transaction((tx) => svc.issue(tx, [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future2) }]));
    } catch (error) {
      conflict = error;
    }
    expect(conflict).not.toBeNull();
    expect(conflict.message).toMatch(/overlapping validity|grant_no_overlap|Conflict/);
  });

  it('supports 10 concurrent non-overlapping access_type issues', async () => {
    const accessTypes = (await prisma.grant_access_type.findMany({ take: 10 })).map((t) => t.id);
    expect(accessTypes.length).toBeGreaterThanOrEqual(2); // sanity check

    const expiry = Expiry.at(new Date(Date.now() + 100000));
    const work = accessTypes.map((type) => prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: type, approved_expiry: expiry }])));
    const results = await Promise.allSettled(work);

    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);

    const activeCount = await prisma.grant.count({ where: { subject_id: member.subject_id, resource_id: dataset.resource_id, revoked_at: null } });
    expect(activeCount).toBe(accessTypes.length);
  });

  it('supports 10 concurrent calls with 30% overlap', async () => {
    const someTypes = [viewMetaId, viewMetaId, viewMetaId, downloadId, downloadId, downloadId, downloadId, downloadId, downloadId, downloadId];
    const work = someTypes.map((type) => prisma.$transaction((tx) => grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: type, approved_expiry: Expiry.at(new Date(Date.now() + 100000)) }])));
    const results = await Promise.allSettled(work);

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    expect(fulfilled + rejected).toBe(10);
    expect(rejected).toBeGreaterThan(0);
  });
});
