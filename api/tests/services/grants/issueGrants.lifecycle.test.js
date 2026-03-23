/* eslint-disable max-len */
const path = require('path');
const crypto = require('crypto');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const { TARGET_TYPE } = require('@/authorization/builtin/audit');
const Expiry = require('@/utils/expiry');
const {
  createTestUser, createTestGroup, createTestDataset, createTestCollection, deleteUser, deleteGroup, deleteDataset, deleteGrants, deleteGrantsForResource, getAccessTypeId,
} = require('../helpers');

let actor;
let member;
let group;
let dataset;
let viewMetaId;
let downloadId;
let createdGrantIds = [];
let createdPresetIds = [];
let createdAccessRequestIds = [];

const future1 = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const future2 = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
const future3 = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  actor = await createTestUser('_ig_actor');
  member = await createTestUser('_ig_member');
  group = await createTestGroup(actor.subject_id, '_ig_group');
  dataset = await createTestDataset(group.id, '_ig_dataset');
  await deleteGrantsForResource(dataset.resource_id);
  viewMetaId = await getAccessTypeId('DATASET:VIEW_METADATA');
  downloadId = await getAccessTypeId('DATASET:DOWNLOAD');
}, 30000);

afterEach(async () => {
  await deleteGrantsForResource(dataset.resource_id);
  await deleteGrants(createdGrantIds);
  createdGrantIds = [];
  if (createdPresetIds.length) {
    await prisma.grant_preset_item.deleteMany({ where: { preset_id: { in: createdPresetIds } } });
    await prisma.grant_preset.deleteMany({ where: { id: { in: createdPresetIds } } });
    createdPresetIds = [];
  }
  if (createdAccessRequestIds.length) {
    await prisma.access_request.deleteMany({ where: { id: { in: createdAccessRequestIds } } });
    createdAccessRequestIds = [];
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

function defaultContext() {
  return {
    subject_id: member.subject_id,
    resource_id: dataset.resource_id,
    granted_by: actor.subject_id,
    justification: 'test justification',
  };
}

async function fetchActiveGrant(accessTypeId) {
  const g = await prisma.grant.findFirst({
    where: {
      subject_id: member.subject_id,
      resource_id: dataset.resource_id,
      access_type_id: accessTypeId,
      revoked_at: null,
    },
    orderBy: { created_at: 'desc' },
  });
  if (g) createdGrantIds.push(g.id);
  return g;
}

describe('issueGrants - lifecycle', () => {
  it('creates a single direct grant with future expiry', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future) }]);
    });

    const grant = await fetchActiveGrant(viewMetaId);
    expect(grant).toBeDefined();
    expect(new Date(grant.valid_from).getTime()).toBeLessThanOrEqual(Date.now() + 2000);
    expect(new Date(grant.valid_until).toISOString()).toBe(future.toISOString());
    expect(grant.revoked_at).toBeNull();
    expect(grant.creation_type).toBe('MANUAL');

    const audit = await prisma.authorization_audit.findFirst({ where: { target_type: TARGET_TYPE.GRANT, target_id: grant.id, event_type: 'GRANT_CREATED' } });
    expect(audit).toBeDefined();
    expect(audit.actor_id).toBe(actor.subject_id);
  });

  it('creates a single direct grant with Expiry.never()', async () => {
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: Expiry.never() }]);
    });

    const grant = await fetchActiveGrant(downloadId);
    expect(grant).toBeDefined();
    expect(grant.valid_until).toBeNull();

    const audit = await prisma.authorization_audit.findFirst({ where: { target_type: TARGET_TYPE.GRANT, target_id: grant.id, event_type: 'GRANT_CREATED' } });
    expect(audit).toBeDefined();
  });

  it('expands a preset grant and creates grants for each access type', async () => {
    const preset = await prisma.grant_preset.create({ data: { name: `test_preset_${Date.now()}`, slug: `test_preset_${Date.now()}`, description: 'test preset' } });
    createdPresetIds.push(preset.id);
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: viewMetaId } });
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: downloadId } });

    const x_expiry = Expiry.at(new Date(Date.now() + 86400000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: preset.id }, [{ preset_id: preset.id, approved_expiry: x_expiry }]);
    });

    const g1 = await fetchActiveGrant(viewMetaId);
    const g2 = await fetchActiveGrant(downloadId);
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    expect(new Date(g1.valid_until).toISOString()).toBe(x_expiry.toValue().toISOString());
    expect(new Date(g2.valid_until).toISOString()).toBe(x_expiry.toValue().toISOString());
    expect(g1.source_preset_id).toBe(preset.id);
    expect(g2.source_preset_id).toBe(preset.id);
  });

  it('creates two different access_type grants in one call', async () => {
    const expA = Expiry.at(new Date(Date.now() + 100000));
    const expB = Expiry.at(new Date(Date.now() + 200000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [
        { access_type_id: viewMetaId, approved_expiry: expA },
        { access_type_id: downloadId, approved_expiry: expB },
      ]);
    });

    const g1 = await fetchActiveGrant(viewMetaId);
    const g2 = await fetchActiveGrant(downloadId);
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
  });

  it('supersedes an existing grant with earlier expiry', async () => {
    const oldGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(oldGrant.id);

    const newExpiry = Expiry.at(future3);
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: newExpiry }]);
    });

    const existing = await prisma.grant.findUnique({ where: { id: oldGrant.id } });
    expect(existing.revoked_at).not.toBeNull();
    expect(existing.revocation_type).toBe('SUPERSEDED');

    const current = await fetchActiveGrant(viewMetaId);
    expect(current).toBeDefined();
    expect(new Date(current.valid_until).toISOString()).toBe(newExpiry.toValue().toISOString());

    const audit = await prisma.authorization_audit.findFirst({ where: { target_type: TARGET_TYPE.GRANT, event_type: 'GRANT_SUPERSEDED', target_id: current.id } });
    expect(audit).toBeDefined();
    expect(audit.actor_id).toBe(actor.subject_id);
  });

  it('does not supersede when existing grant has null (never) expiry', async () => {
    const oldGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, expiry: Expiry.never(), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(oldGrant.id);

    const newExpiry = Expiry.at(future1);
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: newExpiry }]);
    });

    const existing = await prisma.grant.findUnique({ where: { id: oldGrant.id } });
    expect(existing.revoked_at).toBeNull();

    const current = await prisma.grant.findMany({
      where: {
        subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
      },
    });
    expect(current).toHaveLength(1);
  });

  it('supersedes only the appropriate access types when mixed', async () => {
    const firstGrantA = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
    }, actor.subject_id);
    const firstGrantB = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, expiry: Expiry.at(future2), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(firstGrantA.id, firstGrantB.id);

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [
        { access_type_id: viewMetaId, approved_expiry: Expiry.at(future3) },
        { access_type_id: downloadId, approved_expiry: Expiry.at(future1) },
      ]);
    });

    const a = await prisma.grant.findUnique({ where: { id: firstGrantA.id } });
    const b = await prisma.grant.findUnique({ where: { id: firstGrantB.id } });
    expect(a.revoked_at).not.toBeNull();
    expect(b.revoked_at).toBeNull();
  });

  it('treats equal or later existing expiry as existing and does not create new grant', async () => {
    const existingGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, expiry: Expiry.at(future3), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(existingGrant.id);

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future2) }]);
    });

    const active = await prisma.grant.findMany({
      where: {
        subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, revoked_at: null,
      },
    });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(existingGrant.id);
  });

  it('does not replace existing grant with later expiry', async () => {
    const existingGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, expiry: Expiry.at(future3), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(existingGrant.id);

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: Expiry.at(future1) }]);
    });

    const active = await prisma.grant.findMany({
      where: {
        subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, revoked_at: null,
      },
    });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(existingGrant.id);
  });

  it('supports preset with single access type', async () => {
    const preset = await prisma.grant_preset.create({ data: { name: `single_preset_${Date.now()}`, slug: `single_preset_${Date.now()}`, description: 'single access' } });
    createdPresetIds.push(preset.id);
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: viewMetaId } });

    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: preset.id }, [{ preset_id: preset.id, approved_expiry: expiry }]);
    });

    const g = await fetchActiveGrant(viewMetaId);
    expect(g.source_preset_id).toBe(preset.id);
  });

  it('supports preset with multiple access types', async () => {
    const preset = await prisma.grant_preset.create({ data: { name: `multi_preset_${Date.now()}`, slug: `multi_preset_${Date.now()}`, description: 'multi' } });
    createdPresetIds.push(preset.id);
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: viewMetaId } });
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: downloadId } });

    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: preset.id }, [{ preset_id: preset.id, approved_expiry: expiry }]);
    });

    const g1 = await fetchActiveGrant(viewMetaId);
    const g2 = await fetchActiveGrant(downloadId);
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    expect(g1.source_preset_id).toBe(preset.id);
    expect(g2.source_preset_id).toBe(preset.id);
  });

  it('merges expiries from same preset item and uses latest', async () => {
    const preset = await prisma.grant_preset.create({ data: { name: `merge_preset_${Date.now()}`, slug: `merge_preset_${Date.now()}`, description: 'merge' } });
    createdPresetIds.push(preset.id);
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: viewMetaId } });

    const expiry1 = Expiry.at(new Date(Date.now() + 100000));
    const expiry2 = Expiry.at(new Date(Date.now() + 200000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: preset.id }, [
        { preset_id: preset.id, approved_expiry: expiry1 },
        { preset_id: preset.id, approved_expiry: expiry2 },
      ]);
    });

    const g = await fetchActiveGrant(viewMetaId);
    expect(new Date(g.valid_until).toISOString()).toBe(expiry2.toValue().toISOString());
  });

  it('supports mixed preset + direct access type no overlap', async () => {
    const preset = await prisma.grant_preset.create({ data: { name: `mix_preset_${Date.now()}`, slug: `mix_preset_${Date.now()}`, description: 'mix' } });
    createdPresetIds.push(preset.id);
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: viewMetaId } });

    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: preset.id }, [
        { preset_id: preset.id, approved_expiry: expiry },
        { access_type_id: downloadId, approved_expiry: expiry },
      ]);
    });

    const g1 = await fetchActiveGrant(viewMetaId);
    const g2 = await fetchActiveGrant(downloadId);
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
  });

  it('merges overlapping preset+direct expiry for same access type', async () => {
    const preset = await prisma.grant_preset.create({ data: { name: `overlap_preset_${Date.now()}`, slug: `overlap_preset_${Date.now()}`, description: 'overlap' } });
    createdPresetIds.push(preset.id);
    await prisma.grant_preset_item.create({ data: { preset_id: preset.id, access_type_id: viewMetaId } });

    const expiry1 = Expiry.at(new Date(Date.now() + 100000));
    const expiry2 = Expiry.at(new Date(Date.now() + 200000));

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), source_preset_id: preset.id }, [
        { preset_id: preset.id, approved_expiry: expiry1 },
        { access_type_id: viewMetaId, approved_expiry: expiry2 },
      ]);
    });

    const g = await fetchActiveGrant(viewMetaId);
    expect(new Date(g.valid_until).toISOString()).toBe(expiry2.toValue().toISOString());
  });

  it('captures actor metadata in audit row', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: expiry }]);
    });

    const grant = await fetchActiveGrant(downloadId);
    const audit = await prisma.authorization_audit.findFirst({ where: { target_type: TARGET_TYPE.GRANT, target_id: grant.id, event_type: 'GRANT_CREATED' } });
    expect(audit.actor_id).toBe(actor.subject_id);
    expect(audit.actor_name).toBeDefined();
  });

  it('captures issuing authority from dataset owner group', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: expiry }]);
    });

    const grant = await fetchActiveGrant(downloadId);
    expect(grant.issuing_authority_id).toBe(group.id);
  });

  it('sets source_access_request_id if provided', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));
    const accessRequest = await prisma.access_request.create({
      data: {
        id: crypto.randomUUID(),
        type: 'NEW',
        resource_id: dataset.resource_id,
        requester_id: actor.subject_id,
        subject_id: member.subject_id,
        purpose: 'test source access request',
      },
    });
    createdAccessRequestIds.push(accessRequest.id);

    const ctx = { ...defaultContext(), access_request_id: accessRequest.id };

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, ctx, [{ access_type_id: viewMetaId, approved_expiry: expiry }]);
    });

    const grant = await fetchActiveGrant(viewMetaId);
    expect(grant.source_access_request_id).toBe(accessRequest.id);
    expect(grant.creation_type).toBe('ACCESS_REQUEST');
  });

  it('preserves justification on grant', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));
    const ctx = { ...defaultContext(), justification: 'justification text' };

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, ctx, [{ access_type_id: downloadId, approved_expiry: expiry }]);
    });

    const grant = await fetchActiveGrant(downloadId);
    expect(grant.justification).toBe('justification text');
  });

  it('applies same valid_from timestamp to all created grants in batch', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [
        { access_type_id: viewMetaId, approved_expiry: expiry },
        { access_type_id: downloadId, approved_expiry: expiry },
      ]);
    });

    const g1 = await fetchActiveGrant(viewMetaId);
    const g2 = await fetchActiveGrant(downloadId);
    expect(g1.valid_from.getTime()).toBe(g2.valid_from.getTime());
  });

  it('handles user subject grant', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), subject_id: member.subject_id }, [{ access_type_id: viewMetaId, approved_expiry: expiry }]);
    });

    const grant = await fetchActiveGrant(viewMetaId);
    expect(grant.subject_id).toBe(member.subject_id);
  });

  it('handles group subject grant', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, { ...defaultContext(), subject_id: group.id }, [{ access_type_id: downloadId, approved_expiry: expiry }]);
    });

    const grant = await prisma.grant.findFirst({
      where: {
        subject_id: group.id, resource_id: dataset.resource_id, access_type_id: downloadId, revoked_at: null,
      },
    });
    expect(grant).toBeDefined();
    createdGrantIds.push(grant.id);
  });

  it('works on dataset resources', async () => {
    const expiry = Expiry.at(new Date(Date.now() + 100000));
    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: expiry }]);
    });

    const grant = await fetchActiveGrant(viewMetaId);
    expect(grant.resource_id).toBe(dataset.resource_id);
  });

  it('works on collection resources', async () => {
    const collection = await createTestCollection(group.id, actor.subject_id, '_collection', {});
    const collectionDataset = await createTestDataset(group.id, '_collection');
    const ctx = { ...defaultContext(), resource_id: collectionDataset.resource_id };
    const expiry = Expiry.at(new Date(Date.now() + 100000));

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, ctx, [{ access_type_id: viewMetaId, approved_expiry: expiry }]);
    });

    const grant = await prisma.grant.findFirst({ where: { resource_id: collectionDataset.resource_id, access_type_id: viewMetaId, revoked_at: null } });
    expect(grant).toBeDefined();
    createdGrantIds.push(grant.id);

    await deleteDataset(collectionDataset.id);
    await prisma.collection.delete({ where: { id: collection.id } });
  });
});
