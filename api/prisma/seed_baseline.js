/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */

/**
 * The rows every deployment needs, in every environment, and nothing else.
 *
 * A production database is this module plus whatever the operators go on to create through
 * the application. A development database is this module plus prisma/seed.js, which adds
 * dummy datasets, groups, collections, and traffic on top. seed.js calls seedBaseline()
 * first, so the two never drift.
 *
 * Everything here is idempotent. Re-running changes nothing that has not changed in the
 * source data, so it is safe to run on every deploy.
 *
 * Run it with:
 *
 *   cd api && npm run seed:prod            # write
 *   cd api && npm run seed:prod -- --dry-run   # validate the JSON files, write nothing
 *
 * @see docs/guides/production-seeding.md
 */

require('module-alias/register');
const path = require('path');

global.__basedir = global.__basedir || path.join(__dirname, '..');

const { PrismaClient, SUBJECT_TYPE } = require('@prisma/client');
const { readFromJSON } = require('../src/utils');
const {
  ROLES,
  GRANT_ACCESS_TYPES,
  GRANT_ACCESS_TYPE_IMPLICATIONS,
  GRANT_PRESETS,
  AUTHENTICATED_USERS_GROUP_ID,
  PUBLIC_GROUP_ID,
  UNASSIGNED_DATASETS_GROUP_ID,
} = require('../src/constants');
const { ensureSvcTasksAccount } = require('../src/services/system_accounts');

/**
 * The JSON files holding the people who should exist on day one, and the role each file
 * confers. Every file lives in the `api/` directory and is a JSON array of objects with
 * `name`, `username`, and `email`. A missing or empty file is fine and is skipped.
 *
 * All three are gitignored, because they name real people.
 */
const USER_FILES = [
  { file: 'admins.json', role_id: 1, role_name: 'admin' },
  { file: 'operators.json', role_id: 2, role_name: 'operator' },
  { file: 'users.json', role_id: 3, role_name: 'user' },
];

/** The file holding the instrument drop directories the API may import from. */
const IMPORT_SOURCES_FILE = 'import_sources.json';

class SeedError extends Error {}

/**
 * Abort with every problem at once, rather than one per run.
 *
 * A first-time deployment usually has several typos in the JSON files, and finding them one
 * failed run at a time is the slowest way to do it.
 */
function refuse(what, problems) {
  throw new SeedError(`${what}:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
}

// ── Preflight ────────────────────────────────────────────────────────────────

/**
 * Confirm the migrations have run.
 *
 * The system principals, the `Unassigned Datasets` group, and the restriction types are
 * inserted by migrations rather than by this script, because the constraints that reference
 * them are created in the same migration. Seeding a database that has only had
 * `prisma migrate deploy` partially applied produces foreign key errors several hundred
 * lines later, naming a constraint rather than the missing step.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function assertMigrationsRan(prisma) {
  const required = [
    [AUTHENTICATED_USERS_GROUP_ID, 'the Authenticated Users principal'],
    [PUBLIC_GROUP_ID, 'the Public principal'],
    [UNASSIGNED_DATASETS_GROUP_ID, 'the Unassigned Datasets group'],
  ];

  const found = await prisma.group.findMany({
    where: { id: { in: required.map(([id]) => id) } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((g) => g.id));

  const problems = required
    .filter(([id]) => !foundIds.has(id))
    .map(([id, label]) => `${label} (group ${id}) is missing`);

  if (await prisma.restriction_type.count() === 0) {
    problems.push('the restriction_type table is empty');
  }

  if (problems.length > 0) {
    problems.push('run `npx prisma migrate deploy` before seeding');
    refuse('The database is not fully migrated', problems);
  }
}

// ── Reference data ───────────────────────────────────────────────────────────

/**
 * Roles, at their pinned ids.
 *
 * The description is refreshed on every run, so an edit to ROLES reaches a database that
 * already has the row. The id and name are the contract and never change.
 */
async function seedRoles(prisma) {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      create: role,
      update: { name: role.name, description: role.description },
    });
  }
  return ROLES.length;
}

/**
 * The grant vocabulary: access types, the partial order over them, and the presets built
 * from them.
 *
 * The implication table is the part that is easy to miss. The authorization engine reads
 * `grant_access_type_implication` at evaluation time and closes over it transitively, so a
 * deployment without those rows silently refuses a caller who holds DATASET:DOWNLOAD but
 * not DATASET:VIEW_METADATA.
 *
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */
async function seedGrantVocabulary(prisma) {
  for (const accessType of GRANT_ACCESS_TYPES) {
    await prisma.grant_access_type.upsert({
      where: { id: accessType.id },
      create: accessType,
      update: {
        name: accessType.name,
        description: accessType.description,
        long_description: accessType.long_description,
        category: accessType.category,
        sort_order: accessType.sort_order,
        is_requestable: accessType.is_requestable,
      },
    });
  }

  // The edges are written by name in constants.js and resolved to ids here, so this has to
  // follow the access types themselves.
  const idByName = new Map(GRANT_ACCESS_TYPES.map((t) => [t.name, t.id]));
  const unknown = GRANT_ACCESS_TYPE_IMPLICATIONS
    .flat()
    .filter((name) => !idByName.has(name));
  if (unknown.length > 0) {
    refuse(
      'GRANT_ACCESS_TYPE_IMPLICATIONS names access types that do not exist',
      [...new Set(unknown)],
    );
  }

  await prisma.grant_access_type_implication.createMany({
    data: GRANT_ACCESS_TYPE_IMPLICATIONS.map(([implying, implied]) => ({
      implying_id: idByName.get(implying),
      implied_id: idByName.get(implied),
    })),
    skipDuplicates: true,
  });

  for (const preset of GRANT_PRESETS) {
    const { access_type_ids, ...row } = preset;
    await prisma.grant_preset.upsert({
      where: { id: row.id },
      create: row,
      update: {
        name: row.name,
        description: row.description,
        resource_types: row.resource_types,
        is_active: true,
      },
    });

    // A preset's membership is replaced rather than added to, so an access type removed
    // from GRANT_PRESETS stops being conferred by it.
    await prisma.grant_preset_item.deleteMany({
      where: { preset_id: row.id, access_type_id: { notIn: access_type_ids } },
    });
    await prisma.grant_preset_item.createMany({
      data: access_type_ids.map((access_type_id) => ({ preset_id: row.id, access_type_id })),
      skipDuplicates: true,
    });
  }

  // A preset no longer in GRANT_PRESETS is retired rather than deleted, because grants and
  // access request items still reference it by id.
  // @see docs/design/groups/design.md — The seeded presets
  await prisma.grant_preset.updateMany({
    where: { id: { notIn: GRANT_PRESETS.map((p) => p.id) }, is_active: true },
    data: { is_active: false },
  });

  // An access type no longer in GRANT_ACCESS_TYPES is deleted, and its implication edges go
  // with it. This has to follow the presets, whose membership was just replaced. A grant, an
  // access request item, or a retired preset that still names the type blocks the delete,
  // and the seed refuses rather than leaving a type nothing lists. The references are
  // checked first because Postgres reports the foreign keys as RESTRICT, which Prisma
  // surfaces as an unknown error with no code to match.
  const listedAccessTypeIds = GRANT_ACCESS_TYPES.map((t) => t.id);
  const unlisted = { access_type_id: { notIn: listedAccessTypeIds } };
  const staleReferences = await Promise.all([
    prisma.grant.count({ where: unlisted }),
    prisma.access_request_item.count({ where: unlisted }),
    prisma.grant_preset_item.count({ where: unlisted }),
  ]);
  if (staleReferences.some((n) => n > 0)) {
    const stale = await prisma.grant_access_type.findMany({
      where: { id: { notIn: listedAccessTypeIds } },
      select: { name: true },
    });
    refuse(
      'Access types removed from GRANT_ACCESS_TYPES are still referenced; reset the database '
      + 'or remove the grants, access request items, and presets that name them',
      stale.map((t) => t.name),
    );
  }
  await prisma.grant_access_type.deleteMany({ where: { id: { notIn: listedAccessTypeIds } } });

  return {
    accessTypes: GRANT_ACCESS_TYPES.length,
    implications: GRANT_ACCESS_TYPE_IMPLICATIONS.length,
    presets: GRANT_PRESETS.length,
  };
}

// ── Users ────────────────────────────────────────────────────────────────────

/**
 * Read the three user files and return one validated list, or refuse.
 *
 * Two people cannot share an email or a username, whatever the case, because the database
 * matches both exactly and login would then resolve to whichever row happened to be
 * inserted first. Listing one person in two files is the same problem wearing a different
 * hat: it is a request for two roles that the schema records as one, so it is reported
 * rather than resolved by file order.
 */
function collectUsersFromJSON() {
  const problems = [];
  const collected = [];

  for (const { file, role_id, role_name } of USER_FILES) {
    const entries = readFromJSON(file);
    entries.forEach((entry, i) => {
      const where = `${file}[${i}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        problems.push(`${where} is not an object`);
        return;
      }
      const missing = ['name', 'username', 'email']
        .filter((f) => typeof entry[f] !== 'string' || entry[f].trim() === '');
      if (missing.length > 0) {
        problems.push(`${where} is missing ${missing.join(', ')}`);
        return;
      }
      collected.push({
        where,
        role_id,
        role_name,
        name: entry.name.trim(),
        username: entry.username.trim(),
        email: entry.email.trim(),
      });
    });
  }

  for (const field of ['email', 'username']) {
    const seen = new Map();
    for (const user of collected) {
      const key = user[field].toLowerCase();
      if (seen.has(key)) {
        problems.push(`${field} "${user[field]}" appears in both ${seen.get(key)} and ${user.where}`);
      } else {
        seen.set(key, user.where);
      }
    }
  }

  if (problems.length > 0) {
    refuse('The user JSON files have problems', problems);
  }
  return collected;
}

/**
 * Create the listed users, leaving any that already exist exactly as they are.
 *
 * An existing row is never updated. A name, a role, or an email changed through the admin
 * panel is the current truth, and a stale JSON file left on the server should not be able to
 * reverse it on the next deploy.
 */
async function seedUsers(prisma, users, { dryRun }) {
  if (users.length === 0) return { created: 0, existing: 0 };

  const present = await prisma.user.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(present.map((u) => u.email));
  const toCreate = users.filter((u) => !existingEmails.has(u.email));

  if (!dryRun) {
    for (const user of toCreate) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          name: user.name,
          username: user.username,
          email: user.email,
          cas_id: user.username,
          user_role: { create: [{ role_id: user.role_id }] },
          subject: { create: { type: SUBJECT_TYPE.USER } },
        },
      });
    }
  }

  return { created: toCreate.length, existing: users.length - toCreate.length };
}

// ── Import sources ───────────────────────────────────────────────────────────

/**
 * Read import_sources.json and return one validated list, or refuse.
 *
 * `path` is the canonical absolute path shown in the UI and stored on every dataset imported
 * from the source, so it has to be absolute and unique. `mounted_path` is where the API
 * process actually finds it, when a container mount puts it somewhere else.
 */
function collectImportSourcesFromJSON() {
  const problems = [];
  const collected = [];
  const seen = new Map();

  readFromJSON(IMPORT_SOURCES_FILE).forEach((entry, i) => {
    const where = `${IMPORT_SOURCES_FILE}[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where} is not an object`);
      return;
    }
    if (typeof entry.path !== 'string' || entry.path.trim() === '') {
      problems.push(`${where} is missing the required "path" field`);
      return;
    }
    const sourcePath = entry.path.trim();
    if (!path.isAbsolute(sourcePath)) {
      problems.push(`${where} path "${sourcePath}" is not absolute`);
      return;
    }
    if (seen.has(sourcePath)) {
      problems.push(`path "${sourcePath}" appears in both ${seen.get(sourcePath)} and ${where}`);
      return;
    }
    seen.set(sourcePath, where);
    collected.push({
      path: sourcePath,
      label: entry.label ?? null,
      description: entry.description ?? null,
      sort_order: entry.sort_order ?? null,
      mounted_path: entry.mounted_path ?? null,
    });
  });

  if (problems.length > 0) {
    refuse(`${IMPORT_SOURCES_FILE} has problems`, problems);
  }
  return collected;
}

/**
 * Upsert the import sources.
 *
 * Unlike users, the descriptive fields are refreshed on every run: an import source is
 * deployment configuration rather than a record someone maintains in the UI. `owner_group_id`
 * and `status` are deliberately left alone, because a platform admin sets those after the
 * groups exist.
 *
 * @see docs/design/groups/dataset-creation-plan.md — B1
 */
async function seedImportSources(prisma, sources, { dryRun }) {
  if (sources.length === 0) return { created: 0, updated: 0 };

  const present = await prisma.import_source.findMany({
    where: { path: { in: sources.map((s) => s.path) } },
    select: { path: true },
  });
  const existingPaths = new Set(present.map((s) => s.path));

  if (!dryRun) {
    for (const source of sources) {
      await prisma.import_source.upsert({
        where: { path: source.path },
        create: source,
        update: {
          label: source.label,
          description: source.description,
          sort_order: source.sort_order,
          mounted_path: source.mounted_path,
        },
      });
    }
  }

  return {
    created: sources.filter((s) => !existingPaths.has(s.path)).length,
    updated: existingPaths.size,
  };
}

// ── Sequences ────────────────────────────────────────────────────────────────

/**
 * Point each identity sequence past the highest id present.
 *
 * Rows inserted with an explicit id do not advance the sequence, so the next generated id
 * would collide. `pg_get_serial_sequence` resolves the sequence name, which keeps this
 * correct for `user`, whose table name needs quoting.
 */
async function realignSequences(prisma) {
  const tables = ['user', 'role', 'grant_access_type', 'grant_preset'];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), `
      + `GREATEST((SELECT COALESCE(MAX(id), 1) FROM "${table}"), 1))`,
    );
  }
  return tables;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Seed everything a deployment needs regardless of environment.
 *
 * Order matters in three places: roles come before `svc_tasks`, which takes role 1;
 * `svc_tasks` comes before anything crediting a system-issued row to it; and access types
 * come before the implications and presets that reference them by id.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 * @param {boolean} [options.dryRun] validate and report, write nothing
 * @param {boolean} [options.quiet] suppress the progress lines, for use from seed.js
 * @returns {Promise<object>} counts, one key per step
 */
async function seedBaseline(prisma, { dryRun = false, quiet = false } = {}) {
  const say = quiet ? () => {} : (msg) => console.log(msg);

  // Read and validate both files before touching the database, so a typo in users.json
  // fails before any row is written.
  const users = collectUsersFromJSON();
  const importSources = collectImportSourcesFromJSON();

  await assertMigrationsRan(prisma);

  if (dryRun) {
    const userPlan = await seedUsers(prisma, users, { dryRun });
    const sourcePlan = await seedImportSources(prisma, importSources, { dryRun });
    say(`dry run: ${users.length} user(s) listed, ${userPlan.created} would be created, `
      + `${userPlan.existing} already exist`);
    say(`dry run: ${importSources.length} import source(s) listed, ${sourcePlan.created} would be `
      + `created, ${sourcePlan.updated} would be updated`);
    say('dry run: no rows were written');
    return { dryRun: true, users: userPlan, importSources: sourcePlan };
  }

  const roles = await seedRoles(prisma);
  say(`roles: ${roles}`);

  const svcTasks = await ensureSvcTasksAccount(prisma);
  say(`service account: svc_tasks (id ${svcTasks.user_id}, subject ${svcTasks.subject_id})`);
  if (!svcTasks.pinned) {
    // Not an error. Everything resolves svc_tasks by username, so a database that could not
    // give it the pinned ids still works — but a reader comparing against constants.js
    // deserves to be told, and `npm run seed:prod` is where they will see it.
    say('  note: svc_tasks does not hold the pinned ids in SVC_TASKS_USER_ID / '
      + 'SVC_TASKS_SUBJECT_ID, because the database already had those rows. Nothing at '
      + 'runtime depends on them; reissue APP_API_TOKEN if the account was just created.');
  }

  const vocabulary = await seedGrantVocabulary(prisma);
  say(`grant access types: ${vocabulary.accessTypes}, implications: ${vocabulary.implications}, `
    + `presets: ${vocabulary.presets}`);

  const userCounts = await seedUsers(prisma, users, { dryRun });
  say(`users: ${userCounts.created} created, ${userCounts.existing} already present`);

  const sourceCounts = await seedImportSources(prisma, importSources, { dryRun });
  say(`import sources: ${sourceCounts.created} created, ${sourceCounts.updated} updated`);

  // Must be last: every step above may insert a row at an explicit id.
  await realignSequences(prisma);

  return {
    roles, ...vocabulary, users: userCounts, importSources: sourceCounts,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !['--dry-run', '-n'].includes(a));
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown[0]}`);
    console.error('Usage: node prisma/seed_baseline.js [--dry-run|-n]');
    process.exit(1);
  }
  const dryRun = args.length > 0;

  const prisma = new PrismaClient();
  try {
    console.log(dryRun ? '=== seed_baseline (dry run) ===' : '=== seed_baseline ===');
    await seedBaseline(prisma, { dryRun });
    console.log('=== done ===');
  } catch (e) {
    // A validation failure is the operator's to fix and reads better without a stack.
    console.error(e instanceof SeedError ? `\n${e.message}\n` : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  seedBaseline,
  SeedError,
  // Exported for tests/seed_baseline.test.js, which checks the validation without a database.
  collectUsersFromJSON,
  collectImportSourcesFromJSON,
  USER_FILES,
  IMPORT_SOURCES_FILE,
};
