const { RESOURCE_TYPE } = require('@prisma/client');

/**
 * The resource and the subject a grant or an access request concerns, as their rules read them.
 *
 * A grant and a request have no archived or deleted state of their own. They carry a status, and
 * they name a resource and a user or group whose state also decides what they admit. Their
 * containers fetch those relations with the fragments here and shape them with the functions here.
 * Nothing in this file reads the database.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

/** What a `resource` relation fetches for `targetOf`. */
const TARGET_SELECT = {
  type: true,
  dataset: { select: { is_deleted: true, owner_group: { select: { is_archived: true } } } },
  collection: { select: { is_archived: true, owner_group: { select: { is_archived: true } } } },
};

/** What a `subject` relation fetches for `subjectOf`. */
const SUBJECT_SELECT = { group: { select: { is_archived: true } } };

/**
 * Shapes one resource row, fetched with `TARGET_SELECT`, into the `target` the rules read.
 * @param {Object} resource
 * @returns {{kind: string, archived: boolean, deleted: boolean}}
 */
function targetOf(resource) {
  if (resource?.dataset) {
    return {
      kind: 'dataset',
      deleted: resource.dataset.is_deleted,
      archived: resource.dataset.owner_group.is_archived,
    };
  }
  if (resource?.collection) {
    return {
      kind: 'collection',
      deleted: false,
      archived: resource.collection.is_archived || resource.collection.owner_group.is_archived,
    };
  }
  if (!resource || !('type' in resource)) {
    throw new Error('targetOf needs a resource row fetched with TARGET_SELECT');
  }
  // A resource row of a type that carries no state of its own, such as a group resource.
  return { kind: String(resource.type ?? RESOURCE_TYPE.DATASET).toLowerCase(), deleted: false, archived: false };
}

/**
 * The state of the user or group a grant or a request is for. Only a group has one: an archived
 * group is frozen, so it takes no new access and none of its requests move.
 *
 * A subject fetched without its `group` relation is refused rather than read as a user, because
 * reading it as a user would silently admit what an archived group must refuse.
 *
 * @see docs/design/groups/design.md — Lifecycle Management
 */
function subjectOf(subject) {
  if (!subject || !('group' in subject)) {
    throw new Error('subjectOf needs a subject row fetched with SUBJECT_SELECT');
  }
  return subject.group
    ? { kind: 'group', archived: subject.group.is_archived === true }
    : { kind: 'user', archived: false };
}

/**
 * The fields a grant's or a request's rules read, from a row fetched with its container's fragment.
 *
 * Only what the row carries is shaped. A row fetched without `subject` has no `subject` field, so
 * a rule that reads it reports the missing field instead of reading an unarchived user.
 *
 * @param {Object} row
 * @param {string[]} ownFields - the row's own columns the rules read, such as `status`
 * @returns {Object}
 */
function shapeTargetAndSubject(row, ownFields) {
  const fields = {};
  ownFields.forEach((field) => {
    if (field in row) fields[field] = row[field];
  });
  if ('resource' in row) fields.target = targetOf(row.resource);
  if ('subject' in row) fields.subject = subjectOf(row.subject);
  return fields;
}

module.exports = {
  TARGET_SELECT,
  SUBJECT_SELECT,
  targetOf,
  subjectOf,
  shapeTargetAndSubject,
};
