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
    id: 10,
    name: 'PCM230203',
    num_directories: 35,
    num_files: 116,
    num_genome_files: 60,
    du_size: 160612542453,
    size: 160612394997,
    description: null,
    origin_path: '/N/scratch/dgluser/bs_test/PCM230203',
    archive_path: 'archive/2023/PCM230203.tar',
    stage_path: '/N/scratch/dgluser/test/stage/PCM230203',
    workflows: ['6ca07614-bc84-4e5d-8808-71d0ebaef98b'],
    report_id: 'a577cb75-bb5c-4b1b-94ed-c4bd96de1188',
  },
  {
    id: 15,
    name: 'PCM230327PL',
    num_directories: 6,
    num_files: 13,
    num_genome_files: 12,
    du_size: 58097236036,
    size: 58097207364,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230327PL',
    archive_path: 'archive/2023/PCM230327PL.tar',
    stage_path: '/N/scratch/dgluser/test/stage/PCM230327PL',
    workflows: ['874a4b40-0534-44e3-b4ff-ae029cca5109'],
    report_id: '9b0b3fba-ccfd-4918-a5ff-ac93fa1a19ae',
  },
  {
    id: 11,
    name: 'PCM230215_657496842_Aborted_WF',
    num_directories: 6,
    num_files: 125,
    num_genome_files: 0,
    du_size: 2685335,
    size: 2648471,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230215_657496842_Aborted_WF',
    archive_path: 'archive/2023/PCM230215_657496842_Aborted_WF.tar',
    stage_path: '/N/scratch/dgluser/test/stage/PCM230215_657496842_Aborted_WF',
    workflows: ['8afb902b-2ed3-47cd-9390-a262672d2d64'],
    report_id: null,
  },
  {
    id: 12,
    name: 'PCM230306PL',
    num_directories: 44,
    num_files: 218,
    num_genome_files: 68,
    du_size: 137206108342,
    size: 137205924022,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230306PL',
    archive_path: 'archive/2023/PCM230306PL.tar',
    stage_path: '/N/scratch/dgluser/test/stage/PCM230306PL',
    workflows: ['970e13dd-1905-493e-aa3a-13645bd439d9'],
    report_id: 'fa7d41f5-3813-43f6-9a72-5440ed6eac2b',
  },
  {
    id: 7,
    name: 'bcl_fastq',
    num_directories: 976,
    num_files: 4249,
    num_genome_files: 636,
    du_size: 87839405520,
    size: 87835338192,
    description: null,
    origin_path: '/N/project/DG_Multiple_Myeloma/share/bcl_fastq',
    archive_path: 'archive/2023/bcl_fastq.tar',
    stage_path: '/N/scratch/dgluser/test/stage/bcl_fastq',
    workflows: ['63339ae0-9643-4d8b-aa3a-303434f6bdcd'],
    report_id: null,
  },
  {
    id: 6,
    name: 'PCM221205',
    num_directories: 12,
    num_files: 249,
    num_genome_files: 93,
    du_size: 357839228469,
    size: 357839175221,
    description: null,
    origin_path: '/N/project/DG_Multiple_Myeloma/share/PCM221205',
    archive_path: 'archive/2023/PCM221205.tar',
    stage_path: '/N/scratch/dgluser/test/stage/PCM221205',
    workflows: ['02fc5cba-d4b8-4e74-8e0c-4e187c8e7f68'],
    report_id: null,
  },
  {
    id: 8,
    name: 'sentieon_val_7',
    num_directories: 13871,
    num_files: 28227,
    num_genome_files: 182,
    du_size: 371544389559,
    size: 371543926042,
    description: null,
    origin_path: '/N/project/DG_Multiple_Myeloma/share/sentieon_val_7',
    archive_path: 'archive/2023/sentieon_val_7.tar',
    stage_path: '/N/scratch/dgluser/test/stage/sentieon_val_7',
    workflows: ['e2c47b03-8873-4be1-9c30-b0b3d784c88c'],
    report_id: null,
  },
  {
    id: 13,
    name: 'PCM230215PL',
    num_directories: 20,
    num_files: 90,
    num_genome_files: 30,
    du_size: 151808617759,
    size: 151808531743,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230215PL',
    archive_path: 'archive/2023/PCM230215PL.tar',
    stage_path: '/N/scratch/dgluser/test/stage/PCM230215PL',
    workflows: ['94e78cd2-d836-4175-8199-562da80867e5'],
    report_id: '93bcfa16-a813-4116-86a6-bf9bef7bc48f',
  },
  {
    id: 14,
    name: 'PCM230314PL',
    num_directories: 24,
    num_files: 98,
    num_genome_files: 38,
    du_size: 124798978226,
    size: 124798875826,
    description: null,
    origin_path: '/N/scratch/dgluser/test/PCM230314PL',
    archive_path: 'archive/2023/PCM230314PL.tar',
    stage_path: '/N/scratch/dgluser/test/stage/PCM230314PL',
    workflows: ['9d4941bd-182c-4314-8825-e62869839c5f'],
    report_id: '997b10c0-5ead-41db-93d3-787d4e36641f',
  },
];

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
    return prisma.batch.upsert({
      where: {
        id: batch_obj.id,
      },
      update: {},
      create: {
        ...batch_obj,
        workflows: {
          create: workflows.map((workflow_id) => ({ id: workflow_id })),
        },
      },
    });
  });
  await Promise.all(batchPromises);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
