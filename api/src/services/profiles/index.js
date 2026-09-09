const { Prisma, PROFILE_VISIBILITY } = require('@prisma/client');
const createError = require('http-errors');
const config = require('config');

const prisma = require('@/db');
const audit = require('@/authorization/builtin/audit');
const validate = require('./validate');

/**
 * Reading and writing the profile of a group or a collection.
 *
 * A profile is informational. Nothing here decides who may read data; the one field that
 * decides anything is `profile_visibility`, which decides who may read the profile itself.
 *
 * @see docs/design/groups/profiles.md
 */

const CONFLICT_ERROR_MESSAGE = 'This profile was changed by somebody else. Reload and try again.';
const ARCHIVED_ERROR_MESSAGE = 'This resource is archived and cannot be edited.';

const VISIBILITIES = Object.values(PROFILE_VISIBILITY);

/** The three JSON keys a profile owns. Everything else under `metadata` is left alone. */
const PROFILE_METADATA_KEYS = ['links', 'citation', 'publications'];

/**
 * The citation rendered when an admin has set none.
 *
 * Follows DataCite's human-readable order — creator, year, title, publisher, identifier.
 * This is a display field, so an approximation that reads correctly is the right answer
 * and precision work here is wasted.
 * @see docs/design/groups/profiles.md — Schema
 */
function generateCitation({
  creator, year, title, url, isCollection = false,
}) {
  const kind = isCollection ? ' [Data collection]' : '';
  const publisher = config.get('citation.publisher');
  return `${creator} (${year}). ${title}${kind}. ${publisher}. ${url}`;
}

/** The public URL a citation points at. Ids, not slugs: a slug changes when a name does. */
function profileUrl(kind, id) {
  const base = config.has('portal.base_url') ? config.get('portal.base_url') : '';
  return `${base}/public/${kind}/${id}`;
}

/**
 * The citation for a row, generated when the stored one is null.
 * @returns {string}
 */
function resolveCitation(row, kind) {
  const stored = row.metadata?.citation;
  if (stored) return stored;
  const creator = kind === 'collections'
    ? (row.owner_group?.name ?? row.name)
    : row.name;
  return generateCitation({
    creator,
    year: new Date(row.created_at).getUTCFullYear(),
    title: row.name,
    url: profileUrl(kind, row.id),
    isCollection: kind === 'collections',
  });
}

/**
 * Turn a request body into the column and metadata updates it implies.
 *
 * Absent keys are left alone; an explicit null clears the field. Returns `null` for a body
 * that asks for no change at all, so a caller can refuse it rather than burning a version.
 */
function buildProfileUpdate(body, currentMetadata) {
  const columns = {};
  const metadata = {};

  if ('tagline' in body) columns.tagline = validate.validateTagline(body.tagline);
  if ('about_md' in body) columns.about_md = validate.validateAboutMd(body.about_md);
  if ('profile_visibility' in body) {
    if (!VISIBILITIES.includes(body.profile_visibility)) {
      throw createError.BadRequest(
        `profile_visibility must be one of ${VISIBILITIES.join(', ')}`,
      );
    }
    columns.profile_visibility = body.profile_visibility;
  }

  if ('links' in body) metadata.links = validate.validateLinks(body.links);
  if ('citation' in body) metadata.citation = validate.validateCitation(body.citation);
  if ('publications' in body) {
    metadata.publications = validate.validatePublications(body.publications);
  }

  const touchedMetadata = Object.keys(metadata).length > 0;
  if (Object.keys(columns).length === 0 && !touchedMetadata) return null;

  return {
    columns,
    // Replace the three profile keys outright rather than merging. A merge cannot express
    // "remove the third link", and a caller sends the whole list back every time.
    metadata: touchedMetadata ? { ...(currentMetadata ?? {}), ...metadata } : undefined,
    changedFields: [...Object.keys(columns), ...Object.keys(metadata)],
  };
}

async function updateProfile({
  model, id, body, expected_version, actor_id, auditTarget, auditEvent,
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx[model].findUniqueOrThrow({ where: { id } });
    if (current.is_archived) throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);

    const update = buildProfileUpdate(body, current.metadata);
    if (!update) throw createError.BadRequest('No profile fields were supplied.');

    let updated;
    try {
      updated = await tx[model].update({
        where: { id, version: expected_version },
        data: {
          ...update.columns,
          metadata: update.metadata ?? Prisma.skip,
          version: { increment: 1 },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError
        && (e.code === 'P2025' || e.code === 'P2015')) {
        throw createError.Conflict(CONFLICT_ERROR_MESSAGE);
      }
      throw e;
    }

    if (actor_id && auditEvent) {
      const builder = new audit.AuditBuilder(tx, { actor_id });
      await builder
        .setTarget(auditTarget, id, updated.name)
        .mergeMetadata({ changed_fields: update.changedFields })
        .create(tx, auditEvent);
    }

    return updated;
  });
}

function updateGroupProfile(group_id, { data, expected_version, actor_id }) {
  return updateProfile({
    model: 'group',
    id: group_id,
    body: data,
    expected_version,
    actor_id,
    auditTarget: audit.TARGET_TYPE.GROUP,
    auditEvent: audit.AUTH_EVENT_TYPE.GROUP_METADATA_UPDATED,
  });
}

function updateCollectionProfile(collection_id, { data, expected_version, actor_id }) {
  // No COLLECTION_METADATA_UPDATED event exists, and `updateCollectionMetadata` emits none
  // either, so a profile edit on a collection is recorded the same way: not at all.
  return updateProfile({
    model: 'collection',
    id: collection_id,
    body: data,
    expected_version,
    actor_id,
    auditTarget: audit.TARGET_TYPE.COLLECTION,
    auditEvent: null,
  });
}

/**
 * Fetch a group for its profile page.
 *
 * Returns everything the attribute filter may then remove. The filter, not this function,
 * decides what the caller sees.
 */
function getGroupForProfile(group_id) {
  return prisma.group.findUnique({
    where: { id: group_id },
    include: {
      members: {
        where: { role: 'ADMIN', removed_at: null },
        include: { user: true },
      },
    },
  });
}

function getCollectionForProfile(collection_id) {
  return prisma.collection.findUnique({
    where: { id: collection_id },
    include: { owner_group: true },
  });
}

module.exports = {
  PROFILE_METADATA_KEYS,
  VISIBILITIES,
  buildProfileUpdate,
  generateCitation,
  resolveCitation,
  profileUrl,
  updateGroupProfile,
  updateCollectionProfile,
  getGroupForProfile,
  getCollectionForProfile,
  ...validate,
};
