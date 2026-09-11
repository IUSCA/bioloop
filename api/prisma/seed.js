/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
require('module-alias/register');
const path = require('path');

global.__basedir = path.join(__dirname, '..');
const { PrismaClient, SUBJECT_TYPE, RESOURCE_TYPE } = require('@prisma/client');
const _ = require('lodash/fp');
const dayjs = require('dayjs');
const config = require('config');

const data = require('./seed_data/data');
const { random_files } = require('./seed_data/random_paths');
const { generate_data_access_logs } = require('./seed_data/data_access_logs');
const { generate_staged_logs } = require('./seed_data/staged_logs');
const { generate_stage_request_logs } = require('./seed_data/stage_request_logs');
const { generate_date_range } = require('../src/services/datetime');
const datasetService = require('../src/services/dataset');
const groupData = require('./seed_data/groups');
const {
  GRANT_ACCESS_TYPES, UNASSIGNED_DATASETS_GROUP_ID,
} = require('../src/constants');
const { generateGroupAccessSeedData } = require('./seed_data/groups_access_data');
const { seedFlowsWorld, GROUP_ID_SET: FLOWS_GROUP_IDS } = require('./seed_data/flows_world');
const { seedBaseline } = require('./seed_baseline');

const prisma = new PrismaClient();

if (['production'].includes(config.get('mode'))) {
  // exit if in production mode
  console.error('Seed script should not be run in production mode. Run `npm run seed:prod` instead.');
  process.exit(1);
}

async function update_seq(table) {
  // Get the current maximum value of the id column
  const result = await prisma[table].aggregate({
    _max: {
      id: true,
    },
  });
  const currentMaxId = result?._max?.id || 0;

  // Reset the sequence to the current maximum value
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE ${table}_id_seq RESTART WITH ${currentMaxId + 1}`);
}

async function put_dataset_files({ dataset_id, num_files = 1000, max_depth = 5 }) {
  const files = random_files(num_files, max_depth, dataset_id);
  await prisma.dataset_file.deleteMany({
    where: { dataset_id },
  });
  await datasetService.add_files({ dataset_id, data: files });
}

// Given an array of entities, inserts a random date per entity, which is helpful for creating
// variability in the dates that get inserted into persistent storage
function insert_random_dates(arr) {
  const min_date = dayjs(
    new Date(),
  ).subtract(arr.length, 'month').toDate();

  const arr_date_range = generate_date_range(
    min_date,
    new Date(),
  );
  const ret = arr.map((e) => ({
    ...e,
    date: arr_date_range[Math.floor(Math.random() * arr_date_range.length)],
  }));

  return ret;
}

// Generates num number of mock users
function createRandomUsers(num) {
  const numDigits = String(num).length;
  return _.range(0, num).map((i) => {
    const paddedIndex = String(i + 1).padStart(numDigits, '0');
    return {
      username: `user-${paddedIndex}`,
      name: `name-${paddedIndex}`,
    };
  });
}

async function main() {
  // Everything a deployment needs in any environment: roles, the svc_tasks service account,
  // the grant vocabulary, and any users listed in admins.json, operators.json, and
  // users.json. Production runs this and stops; the rest of this file is dummy data.
  await seedBaseline(prisma);

  // Seed import sources for non-production environments.
  //
  // The directory holding them comes from config so a native dev environment and the
  // docker stack can differ: `import.sources_dir` defaults to /opt/sca/data/imports,
  // which is what workers/bin/init_dirs.sh creates on the shared volume, and
  // IMPORT_SOURCES_DIR overrides it with a path on the developer's machine.
  //
  // The path has to be absolute and has to exist where both the API and the workers can
  // read it. The API serves the browse endpoint from it, and a dataset imported from
  // here keeps it as its origin_path, which a worker later archives from.
  const importSourcesDir = config.get('import.sources_dir');
  const importSources = [
    {
      path: path.join(importSourcesDir, 'genomics_lab_instrument_drop'),
      label: 'Genomics Lab',
      description: 'Drop location for genomics lab instrument output',
      sort_order: 1,
    },
    {
      path: path.join(importSourcesDir, 'proteomics_lab_instrument_drop'),
      label: 'Proteomics Lab',
      description: 'Drop location for proteomics lab instrument output',
      sort_order: 2,
    },
  ];
  await Promise.all(
    importSources.map((source) => prisma.import_source.upsert({
      where: { path: source.path },
      create: source,
      update: { label: source.label, description: source.description, sort_order: source.sort_order },
    })),
  );
  // eslint-disable-next-line no-console
  console.log(`seeded ${importSources.length} import sources`);

  // Mock admins. The real ones, and svc_tasks, are already in place from seedBaseline();
  // these upserts find them by email and leave them alone, because `update` is empty.
  const admin_data = insert_random_dates(data.admins);
  for (const admin of admin_data) {
    await prisma.user.upsert({
      where: { email: `${admin.username}@iu.edu` },
      update: {},
      create: {
        username: admin.username,
        email: `${admin.username}@iu.edu`,
        cas_id: admin.username,
        name: admin.name,
        created_at: admin.date,
        user_role: {
          create: [{ role_id: 1 }],
        },
        subject: {
          create: {
            type: SUBJECT_TYPE.USER,
          },
        },
      },
    });
  }

  // create operators
  const operator_data = insert_random_dates(data.operators);
  for (const user of operator_data) {
    prisma.user.upsert({
      where: { email: `${user.username}@iu.edu` },
      update: {},
      create: {
        username: user.username,
        email: `${user.username}@iu.edu`,
        cas_id: user.username,
        name: user.name,
        created_at: user.date,
        user_role: {
          create: [{ role_id: 2 }],
        },
        subject: {
          create: {
            type: SUBJECT_TYPE.USER,
          },
        },
      },
    });
  }

  // create test user
  const user_data = insert_random_dates(
    // `flows_cast` is the named fixture cast. It joins the ordinary users so the accounts
    // get the `user` role and nothing more; their standing is written by seedFlowsWorld().
    data.users.concat(data.flows_cast).concat(createRandomUsers(100)), // mock some extra users
  );
  for (const user of user_data) {
    await prisma.user.upsert({
      where: { email: `${user.username}@iu.edu` },
      update: {},
      create: {
        username: user.username,
        email: `${user.username}@iu.edu`,
        cas_id: user.username,
        name: user.name,
        created_at: user.date,
        user_role: {
          create: [{ role_id: 3 }],
        },
        subject: {
          create: {
            type: SUBJECT_TYPE.USER,
          },
        },
      },
    });
  }

  // Groups come before datasets, because a dataset is created in the group that owns it.
  // Seeding them the other way round meant parking every dataset in `Unassigned Datasets`
  // and reassigning it at the end of the run, which cost three things: the upsert key no
  // longer matched on a second run, the owning group was drawn from the regenerated
  // `resource_id` and so differed after every reset, and `generateCollections()` bucketed
  // datasets by an owner that had not been written yet, leaving every collection empty.
  const { groups } = groupData;

  // create subject entries for each group to reference, with type set to GROUP
  await Promise.all(
    groups.map((g) => prisma.subject.upsert({
      where: {
        id: g.id,
      },
      update: {},
      create: {
        id: g.id,
        type: SUBJECT_TYPE.GROUP,
      },
    })),
  );

  await Promise.all(
    // archive_key is frozen at creation and equals the slug at that moment. createGroup()
    // does the same, and the migration backfilled existing rows the same way.
    // @see docs/design/groups/dataset-storage.md — Archival
    groups.map((g) => prisma.group.upsert({
      where: {
        id: g.id,
      },
      update: {},
      create: { ...g, archive_key: g.slug },
    })),
  );

  const { group_closure } = groupData;
  await Promise.all(
    group_closure.map((gc) => prisma.group_closure.upsert({
      where: {
        ancestor_id_descendant_id: {
          ancestor_id: gc.ancestor_id,
          descendant_id: gc.descendant_id,
        },
      },
      update: {},
      create: gc,
    })),
  );

  // // get ids of randomly generated users to add to groups
  const userRecords = await prisma.user.findMany({
    where: {
      username: {
        startsWith: 'user-',
      },
    },
    select: {
      subject_id: true,
    },
  });
  const userIds = userRecords.map((u) => u.subject_id);

  const systemAdmin = await prisma.user.findUnique({
    where: {
      username: 'svc_tasks',
    },
    select: {
      subject_id: true,
    },
  });

  const group_user = groupData.generateGroupUserMemberships(userIds, systemAdmin.subject_id);
  // group_user has no composite key: a user may hold several memberships of one group over
  // time, at most one of them open. skipDuplicates relies on the partial unique index over
  // open rows, so re-seeding never opens a second membership.
  await prisma.group_user.createMany({ data: group_user, skipDuplicates: true });

  // The owning group of each import source. A source with no group is invisible to the v2
  // browse routes.
  // @see docs/design/groups/dataset-creation-plan.md — B1
  await prisma.import_source.updateMany({
    where: { label: 'Genomics Lab' },
    data: { owner_group_id: '83101409-fa05-44be-abca-c91fff4f9754' }, // Genomics Core
  });
  await prisma.import_source.updateMany({
    where: { label: 'Proteomics Lab' },
    data: { owner_group_id: '79606964-2385-4c72-8f5f-6d3412049a1c' }, // Bioinformatics Core
  });

  // Every group a seeded dataset may be sitting in: the ones this file creates, plus the
  // quarantine group an older version of it parked them in.
  const seedOwnedGroupIds = [...groups.map((g) => g.id), UNASSIGNED_DATASETS_GROUP_ID];

  for (const dataset of data.datasets) {
    // prisma threw error if id is included in upsert create object
    // eslint-disable-next-line no-unused-vars
    const { id, workflows, ...dataset_obj } = dataset;
    if (workflows) {
      dataset_obj.workflows = {
        create: workflows.map((workflow_id) => ({ id: workflow_id })),
      };
    }

    // create resource row for each dataset to reference, with type set to DATASET
    dataset_obj.resource = {
      create: {
        type: RESOURCE_TYPE.DATASET,
      },
    };

    const owner_group_id = groupData.ownerGroupIdForDataset(dataset_obj.name);

    // Find the row this seed wrote last time. The unique key is scoped to the owning group,
    // and an older version of this file put these datasets in a different group, so the
    // search covers every group the seed touches rather than only the one computed above.
    // That makes a re-run correct the owner instead of trying to insert a second copy.
    const existing = await prisma.dataset.findFirst({
      where: {
        name: dataset_obj.name,
        type: dataset_obj.type,
        is_deleted: dataset_obj.is_deleted || false,
        owner_group_id: { in: seedOwnedGroupIds },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.dataset.update({
        where: { id: existing.id },
        data: { owner_group_id },
      });
    } else {
      // `resource: { create: ... }` above selects the relation form of the create input,
      // which rejects a scalar foreign key, so connect the group rather than setting the id.
      dataset_obj.owner_group = { connect: { id: owner_group_id } };
      await prisma.dataset.create({ data: dataset_obj });
    }
  }

  // upsert raw data - data product associations
  await Promise.all(
    data.dataset_hierarchical_association.map((sd) => prisma.dataset_hierarchy.upsert({
      where: {
        source_id_derived_id: sd,
      },
      update: {},
      create: sd,
    })),
  );

  // update dataset audit data
  await Promise.all(
    data.dataset_audit_data.map((d) => prisma.dataset_audit.upsert({
      where: {
        id: d.id,
      },
      update: {},
      create: d,
    })),
  );

  // upsert dataset_files
  await put_dataset_files({ dataset_id: 1, num_files: 100, max_depth: 1 });
  await put_dataset_files({ dataset_id: 2, num_files: 100, max_depth: 3 });
  await put_dataset_files({ dataset_id: 3, num_files: 1000, max_depth: 2 });
  await put_dataset_files({ dataset_id: 7, num_files: 100, max_depth: 1 });
  await put_dataset_files({ dataset_id: 8, num_files: 100 });

  const datasets = await prisma.dataset.findMany();
  const dataset_ids = datasets.map((d) => d.id);
  // create data access logs for the last 1 year
  const data_access_logs = await generate_data_access_logs(1, dataset_ids);
  // delete pre-existing records
  await prisma.data_access_log.deleteMany();
  await prisma.data_access_log.createMany({
    data: data_access_logs,
  });

  // create staged datasets' logs for the last 1 year
  const staged_logs = generate_staged_logs(1, dataset_ids);
  // delete pre-existing records
  await prisma.dataset_state.deleteMany();
  await prisma.dataset_state.createMany({
    data: staged_logs,
  });

  // create stage request logs for the last 1 year
  const stage_request_logs = await generate_stage_request_logs(1, dataset_ids);
  // delete pre-existing records
  await prisma.stage_request_log.deleteMany();
  await prisma.stage_request_log.createMany({
    data: stage_request_logs,
  });

  // The access types, their implications, and the presets are seeded by seedBaseline().
  // Only the name-to-id lookup is needed here, for the owning-group grants further down.
  const accessTypeIdByName = new Map(GRANT_ACCESS_TYPES.map((gat) => [gat.name, gat.id]));

  // // create collections
  const collections = groupData.generateCollections(20, datasets);
  // console.log(JSON.stringify(collections, null, 2));
  await Promise.all(
    collections.map(({ dataset_ids: _dsIds, ...c }) => prisma.$transaction(async (tx) => {
      // create resource with type COLLECTION for this collection to reference
      await tx.resource.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          type: RESOURCE_TYPE.COLLECTION,
        },
      });

      await tx.collection.upsert({
        where: { id: c.id },
        update: {},
        create: {
          ...c,
        },
      });

      // upsert collection-dataset associations
      await tx.collection_dataset.createMany({
        data: _dsIds.map((dataset_id) => ({ collection_id: c.id, dataset_id })),
        skipDuplicates: true,
      });
    })),
  );

  // The named fixture world from the flows page, beside the sample world above rather than
  // instead of it. Seeded here, before the grants are derived, so its datasets and its
  // collection pick up the owning-group grants the loop at the end of this function writes
  // for every group.
  // @see docs/design/groups/e2e-test-flows.md — The cast and the world
  const flowsCounts = await seedFlowsWorld(prisma, {
    SUBJECT_TYPE,
    RESOURCE_TYPE,
    systemAdminSubjectId: systemAdmin.subject_id,
  });
  // eslint-disable-next-line no-console
  console.log('seeded the flows fixture world:', flowsCounts);

  // Seed some sample access requests + grants for UI / test coverage (derived from groups/users/datasets)
  const groupsWithMembers = await prisma.group.findMany({
    include: {
      members: true,
      owned_datasets: true,
      owned_collections: true,
    },
  });

  // The flows groups are excluded. This generator writes sample access requests and a global
  // grant to each of the two system principals, and both would break the flows world: a
  // principal grant reaches Quinn, whose whole purpose is to reach nothing, and a seeded
  // request on a fixture resource makes a refusal flow pass for the wrong reason.
  // @see docs/design/groups/e2e-test-flows.md — What the world must not contain
  const accessSeedData = generateGroupAccessSeedData({
    groups: groupsWithMembers.filter((g) => !FLOWS_GROUP_IDS.has(g.id)),
    systemAdminSubjectId: systemAdmin.subject_id,
  });

  await prisma.grant.createMany({
    data: accessSeedData.grants,
    skipDuplicates: true,
  });

  // The owning group reads what it governs. Written here as well as in the services, because
  // the seed inserts resources directly and the backfill migration runs before the seed, so
  // a freshly reset database would otherwise have resources with no owning-group grant.
  // @see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read
  const svcTasks = await prisma.user.findUniqueOrThrow({
    where: { username: 'svc_tasks' },
    select: { subject_id: true },
  });

  const owningGroupGrants = [];
  for (const g of groupsWithMembers) {
    for (const d of g.owned_datasets.filter((x) => !x.is_deleted)) {
      owningGroupGrants.push({
        subject_id: g.id,
        resource_id: d.resource_id,
        access_type_id: accessTypeIdByName.get('DATASET:LIST_FILES'),
        creation_type: 'SYSTEM_BOOTSTRAP',
        granted_by: svcTasks.subject_id,
        issuing_authority_id: g.id,
        justification: 'Seeded at creation: the owning group reads what it governs',
      });
    }
    for (const c of g.owned_collections) {
      owningGroupGrants.push({
        subject_id: g.id,
        resource_id: c.id,
        access_type_id: accessTypeIdByName.get('COLLECTION:LIST_CONTENTS'),
        creation_type: 'SYSTEM_BOOTSTRAP',
        granted_by: svcTasks.subject_id,
        issuing_authority_id: g.id,
        justification: 'Seeded at creation: the owning group reads what it governs',
      });
    }
  }
  await prisma.grant.createMany({ data: owningGroupGrants, skipDuplicates: true });

  await Promise.all(
    accessSeedData.accessRequests.map((r) => prisma.access_request.upsert({
      where: { id: r.id },
      update: {},
      create: r,
    })),
  );

  await Promise.all(
    accessSeedData.accessRequestItems.map((item) => prisma.access_request_item.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    })),
  );

  /**
   * @note ⚠️ IMPORTANT: Always keep the sequence number update code at the end of this function.
   * The `update_seq` calls must execute after all data operations are complete to ensure
   * auto-increment ID sequences are properly synchronized with the database state.
   * Failure to do so may result in ID conflicts and errors in subsequent database operations.
   */

  // update the auto increment id's sequence numbers
  const tables = [
    'dataset', 'user', 'role', 'dataset_audit', 'grant_access_type', 'grant_preset',
  ];
  await Promise.all(tables.map(update_seq));
}

main()
  .then(() => {
    prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
