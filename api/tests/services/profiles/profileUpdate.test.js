/**
 * profileUpdate.test.js
 *
 * Writing a profile: what the API refuses, and what it does with what it accepts.
 *
 * Postgres checks nothing inside a Json column, so every rule the renderer depends on is
 * enforced on write and asserted here. A profile is shown to people who are not signed in,
 * which makes a malformed link the defect with the widest audience in the system.
 *
 * @see docs/design/groups/implementation/profiles.md — Schema
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const profileService = require('@/services/profiles');
const {
  createTestUser,
  createTestGroup,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let actor;
let group;

beforeAll(async () => {
  actor = await createTestUser('_pu_actor');
  group = await createTestGroup(actor.subject_id, '_pu_group');
}, 30_000);

afterAll(async () => {
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

/** The current row, for the version an update has to be told. */
async function currentGroup() {
  return prisma.group.findUniqueOrThrow({ where: { id: group.id } });
}

function update(data, version) {
  return profileService.updateGroupProfile(group.id, {
    data, expected_version: version, actor_id: actor.subject_id,
  });
}

describe('what a profile write refuses', () => {
  test.each([
    ['a blank tagline', { tagline: '   ' }],
    ['a tagline over 120 characters', { tagline: 'x'.repeat(121) }],
    ['an unknown visibility', { profile_visibility: 'SEMI_PUBLIC' }],
    ['a link with an unknown type', { links: [{ type: 'ftp', url: 'https://x.test' }] }],
    ['a link that is not http', { links: [{ type: 'website', url: 'javascript:alert(1)' }] }],
    ['a link that is not a URL', { links: [{ type: 'website', url: 'not a url' }] }],
    ['a contact link that is not an address', { links: [{ type: 'contact_email', url: 'nope' }] }],
    ['more than ten links', {
      links: Array.from({ length: 11 }, () => ({ type: 'website', url: 'https://x.test' })),
    }],
    ['a publication with no DOI', { publications: [{ title: 'A paper' }] }],
    ['a publication whose DOI is not one', { publications: [{ doi: 'https://example.test' }] }],
    ['a publication from the far future', {
      publications: [{ doi: '10.1000/x', year: 3000 }],
    }],
    ['a body with no profile field in it', {}],
  ])('refuses %s', async (_label, body) => {
    const { version } = await currentGroup();
    await expect(update(body, version)).rejects.toMatchObject({ status: 400 });
  });

  test('refuses a stale version rather than overwriting', async () => {
    const { version } = await currentGroup();
    await update({ tagline: 'first' }, version);

    await expect(update({ tagline: 'second' }, version))
      .rejects.toMatchObject({ status: 409 });
  });
});

describe('what a profile write stores', () => {
  test('accepts the fields, trims the tagline, and bumps the version', async () => {
    const before = await currentGroup();
    const updated = await update({
      tagline: '  Sequencing for the Bloomington research community.  ',
      about_md: '### Working with us\n\nSubmit a project first.',
      profile_visibility: 'PUBLIC',
      links: [
        { type: 'website', url: 'https://cgb.indiana.test', label: 'Facility website' },
        { type: 'contact_email', url: 'genomics-core@iu.test' },
      ],
      publications: [{
        doi: '10.1038/s41477-026-01847-2',
        title: 'Long-read assembly of twelve regional maize landraces',
        container: 'Nature Plants',
        year: 2026,
      }],
    }, before.version);

    expect(updated.tagline).toBe('Sequencing for the Bloomington research community.');
    expect(updated.profile_visibility).toBe('PUBLIC');
    expect(updated.version).toBe(before.version + 1);
    expect(updated.metadata.links).toHaveLength(2);
    expect(updated.metadata.links[0].label).toBe('Facility website');
    expect(updated.metadata.publications[0].year).toBe(2026);
  });

  test('replaces a list outright, so an entry can be removed', async () => {
    const before = await currentGroup();
    const updated = await update({ links: [{ type: 'website', url: 'https://only.test' }] },
      before.version);

    expect(updated.metadata.links).toHaveLength(1);
    expect(updated.metadata.links[0].url).toBe('https://only.test');
  });

  test('leaves metadata keys the profile does not own alone', async () => {
    await prisma.group.update({
      where: { id: group.id },
      data: { metadata: { type: 'core', links: [] } },
    });
    const before = await currentGroup();

    const updated = await update({ tagline: 'still a core' }, before.version);
    expect(updated.metadata.type).toBe('core');
  });

  test('null clears a field', async () => {
    const before = await currentGroup();
    const updated = await update({ tagline: null, about_md: null }, before.version);

    expect(updated.tagline).toBeNull();
    expect(updated.about_md).toBeNull();
  });

  test('records the change in the audit log', async () => {
    const before = await currentGroup();
    await update({ tagline: 'audited' }, before.version);

    const record = await prisma.authorization_audit.findFirst({
      where: { target_id: group.id, event_type: 'GROUP_METADATA_UPDATED' },
      orderBy: { timestamp: 'desc' },
    });
    expect(record).not.toBeNull();
    expect(record.metadata.changed_fields).toContain('tagline');
  });
});

describe('the generated citation', () => {
  test('reads in DataCite order and names the group', () => {
    const line = profileService.generateCitation({
      creator: 'Genomics Core Facility',
      year: 2026,
      title: 'Genomics Core Facility',
      url: 'https://bioloop.test/public/groups/abc',
    });
    expect(line).toBe(
      'Genomics Core Facility (2026). Genomics Core Facility. Bioloop. https://bioloop.test/public/groups/abc',
    );
  });

  test('a collection citation says what kind of thing it is', () => {
    const line = profileService.generateCitation({
      creator: 'Genomics Core Facility',
      year: 2026,
      title: 'Maize Landrace Panel',
      url: 'https://bioloop.test/public/collections/abc',
      isCollection: true,
    });
    expect(line).toContain('Maize Landrace Panel [Data collection].');
  });

  test('a stored citation wins over the generated one', () => {
    const row = {
      id: 'abc',
      name: 'Genomics Core Facility',
      created_at: new Date('2024-03-04T00:00:00Z'),
      metadata: { citation: 'Cite me exactly like this.' },
    };
    expect(profileService.resolveCitation(row, 'groups')).toBe('Cite me exactly like this.');
  });

  test('a row with no stored citation gets one built from its own fields', () => {
    const row = {
      id: 'abc',
      name: 'Genomics Core Facility',
      created_at: new Date('2024-03-04T00:00:00Z'),
      metadata: {},
    };
    expect(profileService.resolveCitation(row, 'groups')).toContain('(2024)');
  });
});
