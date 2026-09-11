// cSpell: ignore Raman Okafor Nwosu Adeyemi Ferreira Vasquez Baptiste
const admins = [
  {
    // Created at pinned ids by ensureSvcTasksAccount() before this list is walked; the
    // upsert here finds it by email and leaves it alone.
    name: 'svc_tasks',
    username: 'svc_tasks',
  },
  {
    // General-purpose development login. The /auth/test_login route signs in as any active
    // user by username, and exists only when `mode` is localhost, docker, or ci. Seeded as
    // an admin so a developer or an agent can reach every surface without CAS.
    // @see docs/guides/dev-servers.md — Logging in without CAS
    name: 'Test User',
    username: 'test_user',
  },
  // Priya, the flows fixture's platform admin. She is in this list rather than in
  // `flows_cast` below because that is what gives her the `admin` role.
  // @see prisma/seed_data/flows_world.js — CAST
  {
    name: 'Priya Raman',
    username: 'priya',
  },
];

const operators = [
  {
    username: 'arodriguez', // cspell: disable-line
    name: 'Alex Rodriguez',
  },
  {
    username: 'bfoster', // cspell: disable-line
    name: 'Benjamin Foster',
  },
  {
    username: 'ejohnson', // cspell: disable-line
    name: 'Emma Johnson',
  },
];

const users = [
  {
    username: 'ajohnson', // cspell: disable-line
    name: 'Alice Johnson',
  },
  {
    username: 'sdavis', // cspell: disable-line
    name: 'Samuel Davis',
  },
  {
    username: 'ethompson', // cspell: disable-line
    name: 'Emily Thompson',
  },
];

/**
 * The flows fixture's cast, minus Priya, who holds `admin` and is in the list above.
 *
 * Named accounts, so a manual pass can sign in as the person a flow names instead of
 * working out which `user-0NN` was assigned their standing. Their group memberships live in
 * `flows_world.js`; this list only creates the accounts.
 *
 * **Vic is absent on purpose.** Vic is the invitee, and the invitation flows exist to prove
 * that inviting somebody with no account works.
 *
 * @see prisma/seed_data/flows_world.js — CAST
 * @see docs/design/groups/e2e-test-flows.md — The cast and the world
 */
const flows_cast = [
  { username: 'dana', name: 'Dana Okafor' },
  { username: 'alice', name: 'Alice Wong' },
  { username: 'bob', name: 'Bob Ferreira' },
  { username: 'carol', name: 'Carol Nwosu' },
  { username: 'erin', name: 'Erin Vasquez' },
  { username: 'frank', name: 'Frank Adeyemi' },
  { username: 'quinn', name: 'Quinn Baptiste' },
];

const _datasets = [
  {
    id: 1,
    name: 'PCM230203',
    type: 'RAW_DATA',
    num_directories: 35,
    num_files: 116,
    du_size: 160612542453,
    size: 160612394997,
    description: null,
    is_staged: true,
    origin_path: '/origin/path/PCM230203',
    archive_path: 'archive/2023/PCM230203.tar',
    workflows: ['6ca07614-bc84-4e5d-8808-71d0ebaef98b'],
    metadata: {
      num_genome_files: 60,
      report_id: 'a577cb75-bb5c-4b1b-94ed-c4bd96de1188',
      stage_alias: 'ea497ac769f2236b6cd9ae70f288a008',
    },
  },
  {
    id: 2,
    name: 'PCM230327',
    type: 'RAW_DATA',
    num_directories: 6,
    num_files: 13,
    du_size: 58097236036,
    size: 58097207364,
    description: null,
    origin_path: '/origin/path/test/PCM230327PL',
    archive_path: 'archive/2023/PCM230327PL.tar',
    workflows: ['874a4b40-0534-44e3-b4ff-ae029cca5109'],
    metadata: {
      num_genome_files: 12,
      report_id: '9b0b3fba-ccfd-4918-a5ff-ac93fa1a19ae',
    },
  },
  {
    id: 3,
    name: 'PCM230215_657496842_Aborted_WF',
    type: 'RAW_DATA',
    num_directories: 6,
    num_files: 125,
    du_size: 2685335,
    size: 2648471,
    description: null,
    origin_path: '/origin/path/test/PCM230215_657496842_Aborted_WF',
    archive_path: 'archive/2023/PCM230215_657496842_Aborted_WF.tar',
    workflows: ['8afb902b-2ed3-47cd-9390-a262672d2d64'],
    metadata: {
      num_genome_files: 0,
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
    du_size: 137206108342,
    size: 137205924022,
    description: null,
    is_staged: true,
    origin_path: '/origin/path/test/PCM230306PL',
    archive_path: 'archive/2023/PCM230306PL.tar',
    workflows: ['970e13dd-1905-493e-aa3a-13645bd439d9'],
    metadata: {
      num_genome_files: 68,
      report_id: 'fa7d41f5-3813-43f6-9a72-5440ed6eac2b',
    },
  },
  {
    id: 5,
    name: 'bcl_fastq',
    type: 'RAW_DATA',
    num_directories: 976,
    num_files: 4249,
    du_size: 87839405520,
    size: 87835338192,
    description: null,
    is_staged: true,
    origin_path: '/origin/path/bcl_fastq',
    archive_path: 'archive/2023/bcl_fastq.tar',
    metadata: {
      num_genome_files: 636,
    },
    workflows: ['63339ae0-9643-4d8b-aa3a-303434f6bdcd'],
  },
  {
    id: 6,
    name: 'PCM221205',
    type: 'RAW_DATA',
    num_directories: 12,
    num_files: 249,
    du_size: 357839228469,
    size: 357839175221,
    description: null,
    origin_path: '/origin/path/PCM221205',
    archive_path: 'archive/2023/PCM221205.tar',
    metadata: {
      num_genome_files: 93,
    },
    workflows: ['02fc5cba-d4b8-4e74-8e0c-4e187c8e7f68'],
  },
  {
    id: 7,
    name: 'PCM230203',
    type: 'DATA_PRODUCT',
    origin_path: '/origin/path/data_products/PCM230203',
  },
  {
    id: 8,
    name: 'PCM230327',
    type: 'DATA_PRODUCT',
    origin_path: '/origin/path/data_products/PCM230327',
  },
  {
    id: 9,
    name: 'PCM230406',
    type: 'RAW_DATA',
    origin_path: '/origin/path/data_products/PCM230406',
  },
  {
    id: 10,
    name: 'PCM230417',
    type: 'RAW_DATA',
    origin_path: '/origin/path/data_products/PCM230417',
  },
];

const additional_datasets = [11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25]
  .map((id) => ({
    id,
    name: `PCM2304${id}_new`,
    type: 'RAW_DATA',
    origin_path: `/origin/path/data_products/PCM2304${id}`,
  }));

const datasets = _datasets.concat(additional_datasets);

const dataset_hierarchical_association = [{
  source_id: 1,
  derived_id: 7,
}, {
  source_id: 2,
  derived_id: 8,
}];

const dataset_audit_data = [{
  id: 1,
  action: 'DELETE',
  user_id: 2,
  dataset_id: 3,
}];

module.exports = {
  admins,
  operators,
  users,
  flows_cast,
  datasets,
  dataset_hierarchical_association,
  dataset_audit_data,
};
