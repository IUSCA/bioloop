const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Create default roles
const roles = [{
  id: 1,
  name: 'admin',
  description: 'Access to the Admin Panel',
},
{
  id: 2,
  name: 'operator',
  description: 'Operator level access',
},
{
  id: 3,
  name: 'user',
  description: 'User level access',
}];

const batches = [
  {
    id: 1,
    name: 'PCM230203',
    type: 'RAW_DATA',
    num_directories: 35,
    num_files: 116,
    num_genome_files: 60,
    du_size: 160612542453,
    size: 160612394997,
    description: null,
    origin_path: '/N/scratch/dgluser/bs_test/PCM230203',
    archive_path: 'archive/2023/PCM230203.tar',
    workflows: ['6ca07614-bc84-4e5d-8808-71d0ebaef98b'],
    attributes: {
      report_id: 'a577cb75-bb5c-4b1b-94ed-c4bd96de1188',
    },
  },
  {
    id: 2,
    name: 'PCM230327',
    type: 'RAW_DATA',
    num_directories: 6,
    num_files: 13,
    num_genome_files: 12,
    du_size: 58097236036,
    size: 58097207364,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230327PL',
    archive_path: 'archive/2023/PCM230327PL.tar',
    workflows: ['874a4b40-0534-44e3-b4ff-ae029cca5109'],
    attributes: {
      report_id: '9b0b3fba-ccfd-4918-a5ff-ac93fa1a19ae',
    },
  },
  {
    id: 3,
    name: 'PCM230215_657496842_Aborted_WF',
    type: 'RAW_DATA',
    num_directories: 6,
    num_files: 125,
    num_genome_files: 0,
    du_size: 2685335,
    size: 2648471,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230215_657496842_Aborted_WF',
    archive_path: 'archive/2023/PCM230215_657496842_Aborted_WF.tar',
    workflows: ['8afb902b-2ed3-47cd-9390-a262672d2d64'],
    attributes: {
      report_id: null,
    },
    is_deleted: true,
  },
  {
    id: 4,
    name: 'PCM230306',
    type: 'RAW_DATA',
    num_directories: 44,
    num_files: 218,
    num_genome_files: 68,
    du_size: 137206108342,
    size: 137205924022,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230306PL',
    archive_path: 'archive/2023/PCM230306PL.tar',
    workflows: ['970e13dd-1905-493e-aa3a-13645bd439d9'],
    attributes: {
      report_id: 'fa7d41f5-3813-43f6-9a72-5440ed6eac2b',
    },
  },
  {
    id: 5,
    name: 'bcl_fastq',
    type: 'RAW_DATA',
    num_directories: 976,
    num_files: 4249,
    num_genome_files: 636,
    du_size: 87839405520,
    size: 87835338192,
    description: null,
    origin_path: '/N/project/DG_Multiple_Myeloma/share/bcl_fastq',
    archive_path: 'archive/2023/bcl_fastq.tar',
    workflows: ['63339ae0-9643-4d8b-aa3a-303434f6bdcd'],
  },
  {
    id: 6,
    name: 'PCM221205',
    type: 'RAW_DATA',
    num_directories: 12,
    num_files: 249,
    num_genome_files: 93,
    du_size: 357839228469,
    size: 357839175221,
    description: null,
    origin_path: '/N/project/DG_Multiple_Myeloma/share/PCM221205',
    archive_path: 'archive/2023/PCM221205.tar',
    workflows: ['02fc5cba-d4b8-4e74-8e0c-4e187c8e7f68'],
  },
  {
    id: 7,
    name: 'PCM230203',
    type: 'DATA_PRODUCT',
  },
  {
    id: 8,
    name: 'PCM230327',
    type: 'DATA_PRODUCT',
  },
];

const batch_heirarchical_association = [{
  source_id: 1,
  derived_id: 7,
}, {
  source_id: 2,
  derived_id: 8,
}];

const metrics = [{
  measurement: '/N/scratch files',
  subject: 'host1',
  usage: 500200,
  limit: 8000000,
}, {
  measurement: '/N/scratch',
  subject: 'host1',
  usage: 100400,
  limit: 6000000,
}, {
  measurement: 'SDA',
  subject: 'host1',
  usage: 300400,
  limit: 50000000,
}];

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

async function main() {
  await Promise.allSettled(roles.map((role) => prisma.role.upsert({
    where: { id: role.id },
    create: role,
    update: role,
  })));

  // Create default admins
  const admins = ['ccbrandt', 'deduggi'];

  const admin_promises = admins.map((username) => prisma.user.upsert({
    where: { email: `${username}@iu.edu` },
    update: {},
    create: {
      username,
      email: `${username}@iu.edu`,
      cas_id: username,
      name: username,
      user_role: {
        create: [{ role_id: 1 }, { role_id: 2 }],
      },
    },
  }));

  await Promise.all(admin_promises);

  // create test user
  const users = ['test_user'];

  const user_promises = users.map((username) => prisma.user.upsert({
    where: { email: `${username}@iu.edu` },
    update: {},
    create: {
      username,
      email: `${username}@iu.edu`,
      cas_id: username,
      name: username,
      user_role: {
        create: [{ role_id: 3 }],
      },
    },
  }));

  await Promise.all(user_promises);

  const batchPromises = batches.map((batch) => {
    const { workflows, ...batch_obj } = batch;
    if (workflows) {
      batch_obj.workflows = {
        create: workflows.map((workflow_id) => ({ id: workflow_id })),
      };
    }
    return prisma.batch.upsert({
      where: {
        id: batch_obj.id,
      },
      update: {},
      create: batch_obj,
    });
  });
  await Promise.all(batchPromises);

  // upsert raw data - data product associations
  await Promise.all(
    batch_heirarchical_association.map((sd) => prisma.batch_hierarchy.upsert({
      where: {
        source_id_derived_id: sd,
      },
      update: {},
      create: sd,
    })),
  );

  // update the auto increment id's sequence numbers
  const tables = ['batch', 'user', 'role'];
  await Promise.all(tables.map(update_seq));

  // add metrics
  await prisma.metric.createMany({
    data: metrics,
  });
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
