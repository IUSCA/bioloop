/**
 * resourceAuditRecords.test.js
 *
 * `getResourceAuditRecords` has to match a resource in either of the two columns that can
 * name it. This is not a stylistic point: `target_type` has no `DATASET` value, so a
 * dataset appears only in `resource_id`, and the three audit tabs — which filtered on
 * `target_id` alone — showed nothing on any dataset in the system.
 *
 * @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
 */

const path = require('path');
const { randomUUID } = require('crypto');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const auditService = require('@/services/audit');
const { TARGET_TYPE } = require('@/authorization/builtin/audit/types');

// Rows are written straight to the table rather than through a service, because the point
// under test is which column a record is found by, and no single service writes all three
// shapes. A real system produces every one of them: a collection rename targets the
// collection, a grant on that collection targets the grant and names the collection as its
// resource, and a grant on a dataset names the dataset as its resource only.
const collectionId = randomUUID();
const datasetResourceId = randomUUID();
const unrelatedId = randomUUID();

beforeAll(async () => {
  await prisma.authorization_audit.createMany({
    data: [
      {
        event_type: 'COLLECTION_ARCHIVED',
        target_id: collectionId,
        target_type: 'COLLECTION',
      },
      {
        event_type: 'GRANT_CREATED',
        target_id: randomUUID(),
        target_type: 'GRANT',
        resource_id: collectionId,
        resource_type: 'COLLECTION',
      },
      {
        event_type: 'GRANT_CREATED',
        target_id: randomUUID(),
        target_type: 'GRANT',
        resource_id: datasetResourceId,
        resource_type: 'DATASET',
      },
      {
        event_type: 'GRANT_REVOKED',
        target_id: randomUUID(),
        target_type: 'GRANT',
        resource_id: datasetResourceId,
        resource_type: 'DATASET',
      },
      {
        event_type: 'GRANT_CREATED',
        target_id: randomUUID(),
        target_type: 'GRANT',
        resource_id: unrelatedId,
        resource_type: 'DATASET',
      },
    ],
  });
});

afterAll(async () => {
  await prisma.authorization_audit.deleteMany({
    where: {
      OR: [
        { target_id: { in: [collectionId, datasetResourceId, unrelatedId] } },
        { resource_id: { in: [collectionId, datasetResourceId, unrelatedId] } },
      ],
    },
  });
});

describe('getResourceAuditRecords', () => {
  test('a dataset is found through resource_id, which is the only column that names it', async () => {
    const { metadata, data } = await auditService.getResourceAuditRecords({
      resource_id: datasetResourceId,
    });

    expect(metadata.count).toBe(2);
    expect(data.map((r) => r.event_type).sort()).toEqual(['GRANT_CREATED', 'GRANT_REVOKED']);
  });

  test('no dataset can ever be a target, so target_id alone cannot find one', async () => {
    // The reason `resource_id` is not optional. Asserting it against the seeded rows above
    // would prove nothing, because those rows were written by this file; assert it against
    // the enumeration the writers are constrained by, and against the table itself.
    expect(Object.values(TARGET_TYPE)).not.toContain('DATASET');

    const datasetTargets = await prisma.authorization_audit.count({
      where: { target_type: 'DATASET' },
    });
    expect(datasetTargets).toBe(0);
  });

  test('a collection is found through both columns at once', async () => {
    const { metadata, data } = await auditService.getResourceAuditRecords({
      resource_id: collectionId,
    });

    expect(metadata.count).toBe(2);
    expect(data.map((r) => r.event_type).sort()).toEqual(['COLLECTION_ARCHIVED', 'GRANT_CREATED']);
  });

  test('another resource’s records are not included', async () => {
    const { data } = await auditService.getResourceAuditRecords({ resource_id: datasetResourceId });
    for (const record of data) {
      expect([record.target_id, record.resource_id]).toContain(datasetResourceId);
    }
  });

  test('event_type narrows the result and count agrees with it', async () => {
    const { metadata, data } = await auditService.getResourceAuditRecords({
      resource_id: datasetResourceId,
      event_type: 'GRANT_REVOKED',
    });

    expect(metadata.count).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0].event_type).toBe('GRANT_REVOKED');
  });

  test('count is the total, not the page', async () => {
    const { metadata, data } = await auditService.getResourceAuditRecords({
      resource_id: datasetResourceId,
      limit: 1,
    });

    expect(metadata.count).toBe(2);
    expect(data).toHaveLength(1);
  });
});
