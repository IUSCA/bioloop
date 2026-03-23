/* eslint-disable max-len */
/* eslint-disable no-await-in-loop */
const path = require('path');
const crypto = require('crypto');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const Expiry = require('@/utils/expiry');
const {
  createTestUser, createTestGroup, createTestDataset, deleteUser, deleteGroup, deleteDataset, deleteGrants, deleteGrantsForResource, getAccessTypeId,
} = require('../helpers');

let actor;
let member;
let group;
let dataset;
let viewMetaId;
let downloadId;

const future1 = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const future2 = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
const future3 = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);

const createdGrantIds = [];
const createdPresetIds = [];

function defaultContext() {
  return {
    subject_id: member.subject_id,
    resource_id: dataset.resource_id,
    granted_by: actor.subject_id,
    justification: 'test justification',
  };
}

beforeAll(async () => {
  actor = await createTestUser('_igv_actor');
  member = await createTestUser('_igv_member');
  group = await createTestGroup(actor.subject_id, '_igv_group');
  dataset = await createTestDataset(group.id, '_igv_dataset');
  await deleteGrantsForResource(dataset.resource_id);
  viewMetaId = await getAccessTypeId('DATASET:VIEW_METADATA');
  downloadId = await getAccessTypeId('DATASET:DOWNLOAD');
}, 30000);

afterEach(async () => {
  await deleteGrants(createdGrantIds);
  createdGrantIds.length = 0;
  if (createdPresetIds.length) {
    await prisma.grant_preset_item.deleteMany({ where: { preset_id: { in: createdPresetIds } } });
    await prisma.grant_preset.deleteMany({ where: { id: { in: createdPresetIds } } });
    createdPresetIds.length = 0;
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

describe('issueGrants - invariants', () => {
  it('rejects empty items array', async () => {
    await expect(grantsService.buildEffectiveGrants(null, {}, [])).rejects.toThrow('Items must be a non-empty array');
  });

  it('rejects item with both access_type_id and preset_id', async () => {
    await expect(grantsService.buildEffectiveGrants(null, {}, [{ access_type_id: viewMetaId, preset_id: 999, approved_expiry: Expiry.never() }])).rejects.toThrow('Each item must have either access_type_id or preset_id, but not both');
  });

  it('rejects item with neither access_type_id nor preset_id', async () => {
    await expect(grantsService.buildEffectiveGrants(null, {}, [{ approved_expiry: Expiry.never() }])).rejects.toThrow('Each item must have either access_type_id or preset_id, but not both');
  });

  it('rejects item without approved_expiry', async () => {
    await expect(grantsService.buildEffectiveGrants(null, {}, [{ access_type_id: viewMetaId }])).rejects.toThrow('Each item must have an approved_expiry of type Expiry');
  });

  it('rejects item with non-Expiry approved_expiry', async () => {
    await expect(grantsService.buildEffectiveGrants(null, {}, [{ access_type_id: viewMetaId, approved_expiry: new Date() }])).rejects.toThrow('Each item must have an approved_expiry of type Expiry');
  });

  it('constructor throws when access_request_id and source_preset_id are both provided', () => {
    expect(() => new grantsService.GrantIssueService({
      subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id, access_request_id: 'x', source_preset_id: 1,
    })).toThrow('Cannot provide both access_request_id and source_preset_id');
  });

  it('constructor sets ACCESS_REQUEST creation_type when access_request_id is provided', () => {
    const svc = new grantsService.GrantIssueService({
      subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id, access_request_id: 'x',
    });
    expect(svc.creation_type).toBe('ACCESS_REQUEST');
  });

  it('constructor sets MANUAL creation_type when source_preset_id is provided', () => {
    const svc = new grantsService.GrantIssueService({
      subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id, source_preset_id: 1,
    });
    expect(svc.creation_type).toBe('MANUAL');
  });

  it('constructor sets MANUAL creation_type when none is provided', () => {
    const svc = new grantsService.GrantIssueService({ subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id });
    expect(svc.creation_type).toBe('MANUAL');
  });

  it('buildEffectiveGrants throws when subject does not exist on hydrate', async () => {
    const nonexistentSubjectId = crypto.randomUUID();
    const svc = new grantsService.GrantIssueService({ subject_id: nonexistentSubjectId, resource_id: dataset.resource_id, granted_by: actor.subject_id });
    await expect(prisma.$transaction((tx) => svc._hydrateMetadata(tx))).rejects.toThrow();
  });

  it('buildEffectiveGrants throws when resource does not exist on hydrate', async () => {
    const nonexistentResourceId = crypto.randomUUID();
    const svc = new grantsService.GrantIssueService({ subject_id: member.subject_id, resource_id: nonexistentResourceId, granted_by: actor.subject_id });
    await expect(prisma.$transaction((tx) => svc._hydrateMetadata(tx))).rejects.toThrow();
  });

  it('buildEffectiveGrants uses existing grant for equal expiry', async () => {
    const existingGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(existingGrant.id);

    const eff = await prisma.$transaction((tx) => grantsService.buildEffectiveGrants(tx, { subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id }, [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future1) }]));
    expect(eff).toHaveLength(1);
    expect(eff[0].type).toBe('existing');
  });

  it('buildEffectiveGrants supersedes when existing is earlier', async () => {
    const existingGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(existingGrant.id);

    const eff = await prisma.$transaction((tx) => grantsService.buildEffectiveGrants(tx, { subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id }, [{ access_type_id: downloadId, approved_expiry: Expiry.at(future2) }]));
    expect(eff[0].type).toBe('supersede');
  });

  it('buildEffectiveGrants returns new when grant does not exist', async () => {
    const eff = await prisma.$transaction((tx) => grantsService.buildEffectiveGrants(tx, { subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id }, [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future1) }]));
    expect(eff[0].type).toBe('new');
  });

  it('Expiry.compare works with never and date', () => {
    const a = Expiry.never();
    const b = Expiry.at(future1);
    expect(Expiry.compare(a, b)).toBeGreaterThan(0);
    expect(Expiry.compare(b, a)).toBeLessThan(0);
    expect(Expiry.compare(a, Expiry.never())).toBe(0);
  });

  it('Expiry.selectLater with undefined behavior', () => {
    const a = Expiry.at(future1);
    expect(Expiry.selectLater(undefined, a)).toBe(a);
    expect(Expiry.selectLater(a, undefined)).toBe(a);
  });

  it('does not create partial grants on invalid input', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future1) }, { approved_expiry: Expiry.at(future1) }]);
    })).rejects.toThrow();

    const count = await prisma.grant.count({ where: { subject_id: member.subject_id, resource_id: dataset.resource_id } });
    expect(count).toBe(0);
  });

  it('Greedily resolves subject user metadata and resource metadata', async () => {
    const svc = new grantsService.GrantIssueService({ subject_id: member.subject_id, resource_id: dataset.resource_id, granted_by: actor.subject_id });
    await prisma.$transaction(async (tx) => {
      await svc._hydrateMetadata(tx);
    });
    expect(svc.metadata.subjectType).toBe('USER');
    expect(svc.metadata.resourceType).toBe('DATASET');
    expect(svc.metadata.actorName).toBeDefined();
  });

  it('supersede grant has revocation_type SUPERSEDED after issue', async () => {
    const oldGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: viewMetaId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(oldGrant.id);

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: viewMetaId, approved_expiry: Expiry.at(future3) }]);
    });

    const reloaded = await prisma.grant.findUnique({ where: { id: oldGrant.id } });
    expect(reloaded.revocation_type).toBe('SUPERSEDED');
    expect(reloaded.revoked_at).not.toBeNull();
  });

  it('new grant after supersede has continuity fields set', async () => {
    const oldGrant = await grantsService.createGrant({
      subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, expiry: Expiry.at(future1), granted_by: actor.subject_id,
    }, actor.subject_id);
    createdGrantIds.push(oldGrant.id);

    await prisma.$transaction(async (tx) => {
      await grantsService.issueGrants(tx, defaultContext(), [{ access_type_id: downloadId, approved_expiry: Expiry.at(future3) }]);
    });

    const newGrant = await prisma.grant.findFirst({
      where: {
        subject_id: member.subject_id, resource_id: dataset.resource_id, access_type_id: downloadId, revoked_at: null,
      },
    });
    createdGrantIds.push(newGrant.id);
    expect(newGrant.issuing_authority_id).toBe(group.id);
    expect(newGrant.source_access_request_id).toBeNull();
  });
});
