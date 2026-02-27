/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
require('module-alias/register');
const path = require('path');

global.__basedir = path.join(__dirname, '..');
const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
const dayjs = require('dayjs');
const config = require('config');

const { normalize_name } = require('../src/services/project');
const data = require('./seed_data/data');
const { random_files } = require('./seed_data/random_paths');
const { generate_data_access_logs } = require('./seed_data/data_access_logs');
const { generate_staged_logs } = require('./seed_data/staged_logs');
const { generate_stage_request_logs } = require('./seed_data/stage_request_logs');
const { generate_date_range } = require('../src/services/datetime');
const datasetService = require('../src/services/dataset');
const { readUsersFromJSON } = require('../src/utils');
const groupData = require('./seed_data/groups');

const prisma = new PrismaClient();

if (['production'].includes(config.get('mode'))) {
  // exit if in production mode
  console.error('Seed script should not be run in production mode. Run node src/scripts/init_prod_users.js instead.');
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

// Generates different values of space utilization metrics, by the hour, based
// on the number of hours provided
function create_metrics_per_hour(num_hours) {
  const metrics_data = [];
  let metricsTimestamp = new Date();
  _.range(0, num_hours).forEach((hour_count) => {
    const hour_metrics = data.metrics.map((m) => ({
      ...m,
      timestamp: metricsTimestamp,
      usage: m.usage + Math.ceil(Math.random(0, hour_count) * 100),
    }));
    metrics_data.push(...hour_metrics);
    metricsTimestamp = dayjs(metricsTimestamp).subtract(1, 'hour').toDate();
  });
  return metrics_data;
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
  // enforce order of creation to assign deterministic ids
  for (const role of data.roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      create: role,
      update: {},
    });
  }

  // Create default admins
  const additional_admins = readUsersFromJSON('admins.json');
  const admin_data = insert_random_dates(data.admins.concat(additional_admins));
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
      },
    });
  }

  // create test user
  const user_data = insert_random_dates(
    data.users.concat(createRandomUsers(100)), // mock some extra users
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
      },
    });
  }

  const datasetPromises = data.datasets.map((dataset) => {
    const { workflows, ...dataset_obj } = dataset;
    if (workflows) {
      dataset_obj.workflows = {
        create: workflows.map((workflow_id) => ({ id: workflow_id })),
      };
    }
    return prisma.dataset.upsert({
      where: {
        id: dataset_obj.id,
      },
      update: {},
      create: dataset_obj,
    });
  });
  await Promise.all(datasetPromises);

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

  // create contact
  await Promise.all(
    data.contacts.map((c) => prisma.contact.upsert({
      where: {
        id: c.id,
      },
      update: {},
      create: c,
    })),
  );

  // create project data
  await Promise.all(
    data.projects.map((p) => prisma.project.upsert({
      where: {
        id: p.id,
      },
      update: {},
      create: {
        slug: normalize_name(p.name),
        ...p,
      },
    })),
  );

  // create project user associations
  await Promise.all(
    data.project_user_assoc.map((pu) => prisma.project_user.upsert({
      where: {
        project_id_user_id: pu,
      },
      update: {},
      create: pu,
    })),
  );

  // create project dataset associations
  await Promise.all(
    data.project_dataset_assoc.map((pd) => prisma.project_dataset.upsert({
      where: {
        project_id_dataset_id: pd,
      },
      update: {},
      create: pd,
    })),
  );

  // create project contact associations
  await Promise.all(
    data.project_contact_assoc.map((pc) => prisma.project_contact.upsert({
      where: {
        project_id_contact_id: pc,
      },
      update: {},
      create: pc,
    })),
  );

  // upsert dataset_files
  await put_dataset_files({ dataset_id: 1, num_files: 100, max_depth: 1 });
  await put_dataset_files({ dataset_id: 2, num_files: 100, max_depth: 3 });
  await put_dataset_files({ dataset_id: 3, num_files: 1000, max_depth: 2 });
  await put_dataset_files({ dataset_id: 7, num_files: 100, max_depth: 1 });
  await put_dataset_files({ dataset_id: 8, num_files: 100 });

  // update the auto increment id's sequence numbers
  const tables = ['dataset', 'user', 'role', 'dataset_audit', 'contact'];
  await Promise.all(tables.map(update_seq));

  // add metrics
  // delete first to not overwrite data.
  await prisma.metric.deleteMany();
  await prisma.metric.createMany({
    data: create_metrics_per_hour(72), // 72 hours = 3 days
  });

  // create data access logs for the last 1 year
  const data_access_logs = await generate_data_access_logs(1);
  // delete pre-existing records
  await prisma.data_access_log.deleteMany();
  await prisma.data_access_log.createMany({
    data: data_access_logs,
  });

  // create staged datasets' logs for the last 1 year
  const staged_logs = generate_staged_logs(1);
  // delete pre-existing records
  await prisma.dataset_state.deleteMany();
  await prisma.dataset_state.createMany({
    data: staged_logs,
  });

  // create stage request logs for the last 1 year
  const stage_request_logs = await generate_stage_request_logs(1);
  // delete pre-existing records
  await prisma.stage_request_log.deleteMany();
  await prisma.stage_request_log.createMany({
    data: stage_request_logs,
  });

  // create instruments
  // delete pre-existing records
  await prisma.instrument.deleteMany();
  await prisma.instrument.createMany({
    data: _.range(0, 10).map((i) => ({
      name: `Instrument ${i + 1}`,
      host: `instrument ${i + 1}.iu.edu`,
    })),
  });

  // create groups and group closure data
  const { groups } = groupData;
  await Promise.all(
    groups.map((g) => prisma.group.upsert({
      where: {
        id: g.id,
      },
      update: {},
      create: g,
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

  // get ids of randomly generated users to add to groups
  const randomUserRecords = await prisma.user.findMany({
    where: {
      username: {
        startsWith: 'user-',
      },
    },
    select: {
      id: true,
    },
  });
  const randomUserIds = randomUserRecords.map((u) => u.id);

  const group_user = groupData.generateGroupUserMemberships(randomUserIds);
  await Promise.all(
    group_user.map((gu) => prisma.group_user.upsert({
      where: {
        group_id_user_id: {
          group_id: gu.group_id,
          user_id: gu.user_id,
        },
      },
      update: {},
      create: gu,
    })),
  );

  // updates datasets with owner_group_id
  const dataset_ids = data.datasets.map((d) => d.id);
  const dataset_group_updates = groupData.generateDatasetOwnerships(dataset_ids);
  await Promise.all(
    dataset_group_updates.map((dgu) => prisma.dataset.update({
      where: { id: dgu.dataset_id },
      data: { owner_group_id: dgu.owner_group_id },
    })),
  );

  // create collections
  const datasets = await prisma.dataset.findMany({});
  const collections = groupData.generateCollections(20, datasets);
  await Promise.all(
    collections.map(({ dataset_ids: _dsIds, ...c }) => prisma.$transaction(async (tx) => {
      await tx.collection.upsert({
        where: { id: c.id },
        update: {},
        create: {
          ...c,
        },
      });

      // upsert collection-dataset associations
      await Promise.all(
        _dsIds.map((dataset_id) => tx.collection_dataset.upsert({
          where: {
            collection_id_dataset_id: {
              collection_id: c.id,
              dataset_id,
            },
          },
          update: {},
          create: {
            collection_id: c.id,
            dataset_id,
          },
        })),
      );
    })),
  );
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
