/**
 * grantAttributes.test.js
 *
 * A grant row is projected by a list that names every field. Nothing reaches a caller because a
 * column was added to the table or a relation to an include: a grantor's `cas_id` and `notes`
 * are dropped, and so is a column no list names. Every field a v2 grant component reads is kept.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Phase 5
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const baseAttributes = require('@/authorization/builtin/policies/base_attributes');
const { projectObject } = require('@/utils/expression');

const user = {
  id: 7,
  name: 'Dana',
  email: 'dana@example.org',
  username: 'dana',
  subject_id: 's-dana',
  cas_id: 'dana-cas',
  notes: 'n',
};

const grantRow = {
  id: 'g1',
  subject_id: 's-quinn',
  resource_id: 'r1',
  access_type_id: 3,
  valid_from: new Date('2026-01-01'),
  valid_until: null,
  expiry: { type: 'never' },
  is_active: true,
  granted_by: 's-dana',
  justification: 'approved',
  creation_type: 'ACCESS_REQUEST',
  revoked_at: null,
  revocation_reason: null,
  some_future_column: 'must not leak',
  access_type: {
    id: 3, name: 'DATASET:DOWNLOAD', description: 'Download', long_description: 'Download files',
  },
  resource: { id: 'r1', type: 'DATASET', dataset: { id: 1, name: 'D', origin_path: '/secret' } },
  subject: { id: 's-quinn', type: 'USER', user: { ...user, name: 'Quinn' } },
  grantor: user,
  revoker: null,
  issuing_authority: { id: 'grp', name: 'Wong Lab' },
  revoking_authority: null,
  source_preset: { id: 2, name: 'Discoverable' },
  source_access_request: { id: 'ar1', purpose: 'analysis', requester: { name: 'Quinn', email: 'q@example.org' } },
};

test('a grant row loses every field no list names', () => {
  const projected = projectObject(grantRow, baseAttributes.grant);
  expect(projected.some_future_column).toBeUndefined();
  expect(projected.grantor.cas_id).toBeUndefined();
  expect(projected.grantor.notes).toBeUndefined();
  expect(projected.resource.dataset.origin_path).toBeUndefined();
  expect(baseAttributes.grant).not.toContain('*');
});

test('a grant row keeps every field the grant components read', () => {
  const projected = projectObject(grantRow, baseAttributes.grant);
  const read = [
    'id', 'access_type_id', 'creation_type', 'expiry', 'is_active', 'justification', 'revocation_reason',
    'revoked_at', 'valid_from', 'access_type.name', 'access_type.description', 'access_type.long_description',
    'grantor.name', 'issuing_authority.name', 'resource.type', 'resource.id', 'subject.id',
    'source_preset.name', 'source_access_request.id', 'source_access_request.purpose',
  ];
  const at = (object, dotted) => dotted.split('.').reduce((node, key) => node?.[key], object);
  expect(read.filter((field) => at(projected, field) === undefined)).toEqual([]);
});
