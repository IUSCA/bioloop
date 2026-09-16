/**
 * rules.test.js
 *
 * Every state rule, driven as the pure function it is. No database: each case builds the row a
 * caller would have fetched and asks what the state admits. That is the point of the split — the
 * business logic of each resource is testable without a transaction.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const {
  check, availableActions, requiredFields, subjectOf,
} = require('@/state');

const admits = (resourceType, action, resource) => check(resourceType, action, resource) === null;
const refusalFor = (resourceType, action, resource) => check(resourceType, action, resource)?.message;

describe('a group', () => {
  const active = { is_archived: false };
  const archived = { is_archived: true };

  test('archived, it refuses every change to itself and to what it owns', () => {
    const changes = ['edit_metadata', 'add_member', 'remove_member', 'edit_member_role',
      'invite', 'add_dataset', 'add_collection', 'create_child'];
    changes.forEach((action) => {
      expect([action, admits('group', action, archived)]).toEqual([action, false]);
      expect([action, admits('group', action, active)]).toEqual([action, true]);
    });
    expect(refusalFor('group', 'add_member', archived)).toBe('This group is archived, so it cannot be changed.');
  });

  test('archived, it still admits every read', () => {
    ['view_metadata', 'view_profile', 'view_members', 'view_audit_logs', 'view_invitations',
      'view_hierarchy', 'view_ancestors', 'view_descendants', 'list_invalid'].forEach((action) => {
      expect([action, admits('group', action, archived)]).toEqual([action, true]);
    });
  });

  test('archiving and unarchiving each refuse the state they would leave unchanged', () => {
    expect(admits('group', 'archive', active)).toBe(true);
    expect(refusalFor('group', 'archive', archived)).toBe('This group is already archived.');
    expect(admits('group', 'unarchive', archived)).toBe(true);
    expect(refusalFor('group', 'unarchive', active)).toBe('This group is not archived.');
  });

  test('creating a root group reads no state', () => {
    expect(admits('group', 'create', {})).toBe(true);
  });

  test('the actions an archived group admits are the reads and unarchive', () => {
    expect(availableActions('group', archived)).toEqual([
      'create', 'unarchive', 'view_metadata', 'view_profile', 'view_hierarchy', 'list_invalid',
      'view_audit_logs', 'view_members', 'view_ancestors', 'view_descendants', 'view_invitations',
    ]);
  });
});

describe('a collection', () => {
  const open = { is_archived: false, owner_group: { is_archived: false }, has_history: false };
  const archived = { ...open, is_archived: true };
  const ownerArchived = { ...open, owner_group: { is_archived: true } };

  test('its own archived state refuses its changes', () => {
    expect(refusalFor('collection', 'add_dataset', archived))
      .toBe('This collection is archived, so it cannot be changed.');
    expect(admits('collection', 'add_dataset', open)).toBe(true);
  });

  test("its owning group's archived state refuses them too, one step up", () => {
    expect(refusalFor('collection', 'edit_metadata', ownerArchived))
      .toBe("This collection's owning group is archived, so the collection cannot be changed.");
    ['remove_dataset', 'transfer_ownership', 'manage_grants', 'review_access_requests'].forEach((action) => {
      expect([action, admits('collection', action, ownerArchived)]).toEqual([action, false]);
    });
  });

  test('a collection with history is archived rather than deleted', () => {
    expect(admits('collection', 'delete', open)).toBe(true);
    expect(refusalFor('collection', 'delete', { ...open, has_history: true }))
      .toBe('This collection has history, so it can be archived but not deleted.');
    // The archived state answers first, because it refuses every change.
    expect(refusalFor('collection', 'delete', { ...archived, has_history: true }))
      .toBe('This collection is archived, so it cannot be changed.');
  });

  test('a create reads the owning group only', () => {
    expect(admits('collection', 'create', { owner_group: { is_archived: false } })).toBe(true);
    expect(refusalFor('collection', 'create', { owner_group: { is_archived: true } }))
      .toBe('The owning group is archived, so it cannot take a new collection.');
  });

  test('unarchiving needs an archived collection, and reads go on', () => {
    expect(admits('collection', 'unarchive', archived)).toBe(true);
    expect(admits('collection', 'unarchive', open)).toBe(false);
    ['view_metadata', 'list_datasets', 'list_grants', 'view_audit_logs'].forEach((action) => {
      expect([action, admits('collection', action, archived)]).toEqual([action, true]);
    });
  });
});

describe('a dataset', () => {
  const open = { is_deleted: false, owner_group: { is_archived: false } };
  const deleted = { ...open, is_deleted: true };
  const ownerArchived = { ...open, owner_group: { is_archived: true } };

  test('deleted, it refuses every change and every read of its files', () => {
    ['contribute', 'request_stage', 'edit_metadata', 'edit', 'transfer_ownership',
      'manage_grants', 'review_access_requests'].forEach((action) => {
      expect([action, admits('dataset', action, deleted)]).toEqual([action, false]);
    });
    ['list_files', 'read_data', 'download', 'compute', 'remote_access'].forEach((action) => {
      expect([action, admits('dataset', action, deleted)]).toEqual([action, false]);
    });
    expect(refusalFor('dataset', 'download', deleted)).toBe('This dataset is deleted, so its files are gone.');
  });

  test('deleted, its record is still readable', () => {
    ['view_metadata', 'view_sensitive_metadata', 'view_audit_logs', 'view_workflows',
      'view_collections', 'view_source_datasets', 'view_derived_datasets'].forEach((action) => {
      expect([action, admits('dataset', action, deleted)]).toEqual([action, true]);
    });
  });

  test('an archived owning group stops changes and leaves the files readable', () => {
    expect(refusalFor('dataset', 'edit_metadata', ownerArchived))
      .toBe("This dataset's owning group is archived, so the dataset cannot be changed.");
    ['list_files', 'download', 'compute'].forEach((action) => {
      expect([action, admits('dataset', action, ownerArchived)]).toEqual([action, true]);
    });
  });

  test('deleting refuses a dataset already deleted, and one whose owning group is archived', () => {
    expect(admits('dataset', 'delete', open)).toBe(true);
    expect(refusalFor('dataset', 'delete', deleted)).toBe('This dataset is already deleted.');
    expect(refusalFor('dataset', 'delete', ownerArchived))
      .toBe("This dataset's owning group is archived, so the dataset cannot be deleted.");
  });

  test('a create reads the owning group only', () => {
    expect(refusalFor('dataset', 'create', { owner_group: { is_archived: true } }))
      .toBe('The owning group is archived, so it cannot take a new dataset.');
  });
});

describe('an access request', () => {
  const target = { kind: 'dataset', archived: false, deleted: false };
  const subject = { kind: 'user', archived: false };
  const underReview = { status: 'UNDER_REVIEW', target, subject };
  const approved = { status: 'APPROVED', target, subject };
  const draft = { status: 'DRAFT', target, subject };

  test('only a request under review can be reviewed', () => {
    expect(admits('access_request', 'review', underReview)).toBe(true);
    expect(refusalFor('access_request', 'review', approved))
      .toBe('This request is approved, and only a request under review can be reviewed.');
  });

  test('a review reads the resource the request names', () => {
    expect(refusalFor('access_request', 'review', { ...underReview, target: { ...target, archived: true } }))
      .toBe('The dataset this request concerns is archived.');
    expect(refusalFor('access_request', 'review', { ...underReview, target: { ...target, deleted: true } }))
      .toBe('The dataset this request concerns is deleted.');
    expect(refusalFor('access_request', 'create', {
      target: { kind: 'collection', archived: true, deleted: false }, subject,
    })).toBe('The collection this request concerns is archived.');
  });

  test('submitting reads the resource too, because review would issue grants', () => {
    expect(admits('access_request', 'submit', draft)).toBe(true);
    expect(refusalFor('access_request', 'submit', { ...draft, target: { ...target, archived: true } }))
      .toBe('The dataset this request concerns is archived.');
  });

  test('the status decides which step is next', () => {
    expect(admits('access_request', 'update', draft)).toBe(true);
    expect(admits('access_request', 'submit', draft)).toBe(true);
    expect(admits('access_request', 'withdraw', draft)).toBe(true);
    expect(admits('access_request', 'withdraw', underReview)).toBe(true);
    expect(admits('access_request', 'update', underReview)).toBe(false);
    expect(admits('access_request', 'withdraw', approved)).toBe(false);
    expect(admits('access_request', 'read', approved)).toBe(true);
  });

  // Archiving freezes a request: no step moves, and withdrawing is a step.
  // @see docs/design/groups/design.md — Lifecycle Management
  test('an archived resource freezes every step, and reading goes on', () => {
    const archivedTarget = { ...target, archived: true };
    [
      ['create', { target: archivedTarget, subject }],
      ['update', { ...draft, target: archivedTarget }],
      ['submit', { ...draft, target: archivedTarget }],
      ['withdraw', { ...draft, target: archivedTarget }],
      ['withdraw', { ...underReview, target: archivedTarget }],
      ['review', { ...underReview, target: archivedTarget }],
    ].forEach(([action, row]) => {
      expect([action, row.status, refusalFor('access_request', action, row)])
        .toEqual([action, row.status, 'The dataset this request concerns is archived.']);
    });
    expect(admits('access_request', 'read', { ...underReview, target: archivedTarget })).toBe(true);
  });

  test('a request for an archived group is frozen the same way', () => {
    const archivedGroup = { kind: 'group', archived: true };
    [
      ['create', { target, subject: archivedGroup }],
      ['update', { ...draft, subject: archivedGroup }],
      ['submit', { ...draft, subject: archivedGroup }],
      ['withdraw', { ...underReview, subject: archivedGroup }],
      ['review', { ...underReview, subject: archivedGroup }],
    ].forEach(([action, row]) => {
      expect([action, refusalFor('access_request', action, row)])
        .toEqual([action, 'The group this request is for is archived.']);
    });
    // The sensitivity pair: the same rows for an open group admit every step.
    const openGroup = { kind: 'group', archived: false };
    expect(admits('access_request', 'create', { target, subject: openGroup })).toBe(true);
    expect(admits('access_request', 'withdraw', { ...underReview, subject: openGroup })).toBe(true);
    expect(admits('access_request', 'review', { ...underReview, subject: openGroup })).toBe(true);
  });
});

describe('a grant', () => {
  const target = { kind: 'dataset', archived: false, deleted: false };
  const subject = { kind: 'user', archived: false };
  const active = { revoked_at: null, target, subject };

  test('a revoked grant is revoked once', () => {
    expect(admits('grant', 'revoke', active)).toBe(true);
    expect(refusalFor('grant', 'revoke', { revoked_at: new Date(), target }))
      .toBe('This permission is already revoked.');
  });

  test("the resource's state stops access changing", () => {
    expect(refusalFor('grant', 'revoke', { revoked_at: null, target: { ...target, archived: true } }))
      .toBe('The dataset this permission applies to is archived, so its access cannot change.');
    expect(refusalFor('grant', 'create', { target: { ...target, deleted: true }, subject }))
      .toBe('The dataset this permission applies to is deleted.');
  });

  test('an archived group takes no new access, and access it holds can still be revoked', () => {
    const archivedGroup = { kind: 'group', archived: true };
    expect(refusalFor('grant', 'create', { target, subject: archivedGroup }))
      .toBe('This access is for an archived group, which cannot be given new access.');
    expect(admits('grant', 'create', { target, subject: { kind: 'group', archived: false } })).toBe(true);
    // The resource belongs to a group that is not frozen, so its admins keep the power to revoke.
    expect(admits('grant', 'revoke', { revoked_at: null, target, subject: archivedGroup })).toBe(true);
    expect(requiredFields('grant', ['revoke'])).not.toContain('subject.archived');
  });

  test('reading a grant is always possible', () => {
    ['read', 'list_for_resource', 'list_for_subject', 'view_coverage'].forEach((action) => {
      expect([action, admits('grant', action, { revoked_at: new Date(), target })]).toEqual([action, true]);
    });
  });
});

describe('an invitation', () => {
  const group = { is_archived: false };

  test('only a pending invitation in an open group can be answered', () => {
    expect(admits('invitation', 'accept', { status: 'PENDING', group })).toBe(true);
    expect(refusalFor('invitation', 'accept', { status: 'ACCEPTED', group }))
      .toBe('This invitation is accepted, and only a pending invitation can be accepted.');
    expect(refusalFor('invitation', 'cancel', { status: 'CANCELLED', group }))
      .toBe('This invitation is cancelled, and only a pending invitation can be withdrawn.');
    expect(refusalFor('invitation', 'accept', { status: 'PENDING', group: { is_archived: true } }))
      .toBe('The group is archived, so its invitations cannot be answered.');
  });
});

describe('the fields a caller must fetch', () => {
  test('a row missing a field a rule reads is an error naming the field', () => {
    expect(() => check('group', 'add_member', {})).toThrow(/reads is_archived, which the caller did not fetch/);
    expect(() => check('collection', 'delete', { is_archived: false, owner_group: { is_archived: false } }))
      .toThrow(/reads has_history/);
    expect(() => check('grant', 'revoke', { revoked_at: null })).toThrow(/target\.archived/);
  });

  test('a caller can ask which fields to select', () => {
    expect(requiredFields('collection').sort())
      .toEqual(['has_history', 'is_archived', 'owner_group.is_archived']);
    expect(requiredFields('dataset', ['download'])).toEqual(['is_deleted']);
  });

  test('a subject fetched without its group is refused rather than read as a user', () => {
    expect(subjectOf({ group: null })).toEqual({ kind: 'user', archived: false });
    expect(subjectOf({ group: { is_archived: true } })).toEqual({ kind: 'group', archived: true });
    expect(() => subjectOf({ id: 'a-subject' })).toThrow(/fetched with its group/);
    expect(() => subjectOf(undefined)).toThrow(/fetched with its group/);
  });

  test('a null field is fetched, and an absent one is not', () => {
    const target = { kind: 'dataset', archived: false, deleted: false };
    expect(admits('grant', 'revoke', { revoked_at: null, target })).toBe(true);
  });
});
