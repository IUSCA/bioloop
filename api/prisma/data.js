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

const admins = [
  {
    name: 'Rishi Pandey',
    username: 'ripandey',
  }, {
    name: 'Charles Brandt',
    username: 'ccbrandt',
  }, {
    name: 'Deepak Duggirala',
    username: 'deduggi',
  }, {
    name: 'Ryan Long',
    username: 'ryanlong',
  }, {
    name: 'svc_tasks',
    username: 'svc_tasks',
  },
];

const operators = [
  {
    username: 'arodriguez',
    name: 'Alex Rodriguez',
  },
  {
    username: 'bfoster',
    name: 'Benjamin Foster',
  },
  {
    username: 'ejohnson',
    name: 'Emma Johnson',
  },
];

const users = [
  {
    username: 'ajohnson',
    name: 'Alice Johnson',
  },
  {
    username: 'sdavis',
    name: 'Samuel Davis',
  },
  {
    username: 'ethompson',
    name: 'Emily Thompson',
  },
];

const datasets = [
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
    origin_path: '/N/scratch/scauser/bs_test/PCM230203',
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
    origin_path: '/N/scratch/scauser/test/PCM230327PL',
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
    origin_path: '/N/scratch/scauser/test/PCM230215_657496842_Aborted_WF',
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
    origin_path: '/N/scratch/scauser/test/PCM230306PL',
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
    origin_path: '/N/project/DG_Multiple_Myeloma/share/bcl_fastq',
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
    origin_path: '/N/project/DG_Multiple_Myeloma/share/PCM221205',
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
    origin_path: '/N/project/DG_Multiple_Myeloma/share/data_products/PCM230203',
  },
  {
    id: 8,
    name: 'PCM230327',
    type: 'DATA_PRODUCT',
    origin_path: '/N/project/DG_Multiple_Myeloma/share/data_products/PCM230327',
  },
  {
    id: 9,
    name: 'PCM230406',
    type: 'RAW_DATA',
    origin_path: '/N/project/DG_Multiple_Myeloma/share/data_products/PCM230406',
  },
  {
    id: 10,
    name: 'PCM230417',
    type: 'RAW_DATA',
    origin_path: '/N/project/DG_Multiple_Myeloma/share/data_products/PCM230417',
  },
];

const dataset_heirarchical_association = [{
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
  measurement: 'sda',
  subject: 'host1',
  usage: 300400,
  limit: 50000000,
}];

const dataset_audit_data = [{
  id: 1,
  action: 'DELETE',
  user_id: 2,
  dataset_id: 3,
}];

const contacts = [{
  id: 1,
  type: 'email',
  value: 'sarah.williams@example.com',
}, {
  id: 2,
  type: 'email',
  value: 'johndoe1985@emailprovider.com',
}, {
  id: 3,
  type: 'email',
  value: 'emily.jones42@example.net',
}];

const projects = [
  {
    id: '1B3D3059-4038-4CBC-BA8D-AF25AC70F829',
    name: 'ILMN_2518_Jackson_DNAseq8_June2023',
  },
  {
    id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    name: 'ILMN_8902_Anderson_DNAseq3_July2023',
  },
  {
    id: 'D77C44B9-3905-4DC2-ACB0-BA285361755A',
    name: 'ILMN_6247_Sanchez_DNAseq9_August2023',
  },
];

const project_user_assoc = [
  {
    project_id: '1B3D3059-4038-4CBC-BA8D-AF25AC70F829',
    user_id: 1,
  },
  {
    project_id: '1B3D3059-4038-4CBC-BA8D-AF25AC70F829',
    user_id: 2,
  },
  {
    project_id: '1B3D3059-4038-4CBC-BA8D-AF25AC70F829',
    user_id: 3,
  },
  {
    project_id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    user_id: 5,
  },
  {
    project_id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    user_id: 6,
  },
];

const project_dataset_assoc = [
  {
    project_id: '1B3D3059-4038-4CBC-BA8D-AF25AC70F829',
    dataset_id: 3,
  },
  {
    project_id: '1B3D3059-4038-4CBC-BA8D-AF25AC70F829',
    dataset_id: 8,
  },
  {
    project_id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    dataset_id: 7,
  },
  {
    project_id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    dataset_id: 8,
  },
];

const project_contact_assoc = [
  {
    project_id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    contact_id: 1,
  },
  {
    project_id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    contact_id: 2,
  },
  {
    project_id: '69EF006F-53E0-432A-87F4-AECBD181FFE8',
    contact_id: 3,
  },
];

module.exports = {
  roles,
  admins,
  operators,
  users,
  datasets,
  dataset_heirarchical_association,
  metrics,
  dataset_audit_data,
  contacts,
  projects,
  project_user_assoc,
  project_dataset_assoc,
  project_contact_assoc,
};
