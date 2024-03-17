const { PrismaClient } = require('@prisma/client');
const config = require('config');

const prisma = new PrismaClient();

if (['production'].includes(config.get('mode'))) {
  // exit if in production mode
  console.error('Seed scripts should not be run in production mode.');
  process.exit(1);
}

const notification1 = {
  type: 'INCOMING_DUPLICATE_DATASET',
  label: 'Duplicate Ingestion',
  acknowledged_by_id: null,
};
const actionItem1 = {
  type: 'DUPLICATE_INGESTION',
  dataset_id: 3,
  metadata: { original_dataset_id: 5 },
};
// const duplicateEntry1 = {
//   original_dataset_id: 5,
//   duplicate_dataset_id: 3,
// };
const checks1 = [{
  type: 'FILE_COUNT',
  passed: false,
  label: 'Number of Files Match',
  report: {
    original_files_count: 200000000,
    duplicate_files_count: 300000000,
  },
}, {
  type: 'CHECKSUMS_MATCH',
  passed: false,
  label: 'Checksums Validated',
  report: {
    conflicting_checksum_files: [{
      name: 'checksum_error_file_1',
      path: '/path/to/checksum_error_file_1',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_file_2',
      path: '/path/to/checksum_error_file_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }],
  },
}, {
  type: 'FILES_MISSING_FROM_DUPLICATE',
  label: 'All Original Files Found',
  passed: false,
  report: {
    missing_files: [{
      name: 'missing_file_1',
      path: '/path/to/missing_file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/missing_file_1',
    }],
  },
}, {
  type: 'FILES_MISSING_FROM_ORIGINAL',
  label: 'All Original Files Found',
  passed: false,
  report: {
    missing_files: [{
      name: 'missing_file_1',
      path: '/path/to/missing_file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/missing_file_1',
    }],
  },
}];

const notification2 = {
  type: 'INCOMING_DUPLICATE_DATASET',
  label: 'Duplicate Ingestion',
  acknowledged_by_id: null,
};
const actionItem2 = {
  type: 'DUPLICATE_INGESTION',
  dataset_id: 10,
  metadata: { original_dataset_id: 11 },
};
const duplicateEntry2 = {
  original_dataset_id: 11,
  duplicate_dataset_id: 10,
};
const checks2 = [{
  type: 'FILE_COUNT',
  passed: true,
  label: 'Number of Files Match',
  report: {
    original_files_count: 20,
    duplicate_files_count: 20,
  },
}, {
  type: 'CHECKSUMS_MATCH',
  passed: false,
  label: 'Checksums Validated',
  report: {
    conflicting_checksum_files: [{
      name: 'checksum_error_file_1',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2.json',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }, {
      name: 'checksum_error_2',
      path: '/path/to/checksum_error_2',
      original_md5: 'original_md5',
      duplicate_md5: 'duplicate_md5',
    }],
  },
}, {
  type: 'FILES_MISSING_FROM_ORIGINAL',
  label: 'All Original Files Found',
  passed: false,
  report: {
    missing_files: [{
      name: 'missing_file_1',
      path: '/path/to/missing_file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/missing_file_1',
    }],
  },
}, {
  type: 'FILES_MISSING_FROM_DUPLICATE',
  label: 'All Original Files Found',
  passed: false,
  report: {
    missing_files: [{
      name: 'missing_file_1',
      path: '/path/to/missing_file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/missing_file_1',
    }],
  },
}];

const notification3 = {
  type: 'INCOMING_DUPLICATE_DATASET',
  label: 'Duplicate Ingestion',
  acknowledged_by_id: null,
};
const actionItem3 = {
  type: 'DUPLICATE_INGESTION',
  dataset_id: 10,
  metadata: { original_dataset_id: 11 },
};
const checks3 = [{
  type: 'FILE_COUNT',
  passed: true,
  label: 'Number of Files Match',
  report: {
    original_files_count: 20,
    duplicate_files_count: 20,
  },
}, {
  type: 'CHECKSUMS_MATCH',
  passed: true,
  label: 'Checksums Validated',
  report: {
    conflicting_checksum_files: [],
  },
}, {
  type: 'FILES_MISSING_FROM_ORIGINAL',
  label: 'All Original Files Found',
  passed: true,
  report: {
    missing_files: [],
  },
}, {
  type: 'FILES_MISSING_FROM_DUPLICATE',
  label: 'All Original Files Found',
  passed: true,
  report: {
    missing_files: [],
  },
}];

const duplicateDataset = {
  name: 'PCM230306',
  type: 'DUPLICATE',
  num_directories: 35,
  num_files: 116,
  du_size: 160612542453,
  size: 160612394997,
  description: null,
  is_staged: true,
  origin_path: '/origin/path/PCM230306',
  archive_path: 'archive/2023/PCM230306.tar',
  metadata: {
    num_genome_files: 60,
    report_id: 'a577cb75-bb5c-4b1b-94ed-c4bd96de1188',
    stage_alias: 'ea497ac769f2236b6cd9ae70f288a008',
  },
};

async function main() {
  await prisma.dataset.deleteMany({
    where: {
      type: 'DUPLICATE',
      name: 'PCM230306',
    },
  });

  const createdDuplicate = await prisma.dataset.create({
    data: duplicateDataset,
  });

  const matchingDatasets = await prisma.dataset.findMany({
    where: {
      name: createdDuplicate.name,
      is_deleted: false,
    },
  });

  if (matchingDatasets.length !== 2) {
    throw new Error('Invalid state');
  }

  const originalDataset = matchingDatasets.find((dataset) => dataset.id !== createdDuplicate.id);

  const duplicateEntry1 = {
    original_dataset_id: originalDataset.id,
    duplicate_dataset_id: createdDuplicate.id,
  };

  await prisma.notification.deleteMany({});
  await prisma.dataset_action_item.deleteMany({});
  await prisma.dataset_ingestion_check.deleteMany({});
  await prisma.duplicate_dataset.deleteMany({});

  await prisma.notification.create({
    data: {
      ...notification1,
      dataset_action_items: {
        create: {
          ...actionItem1,
          dataset_id: createdDuplicate.id,
          ingestion_checks: { create: checks1 },
        },
      },
    },
  });
  await prisma.duplicate_dataset.create({
    data: duplicateEntry1,
  });

  console.log(createdDuplicate.id);

  // await prisma.notification.create({
  //   data: {
  //     ...notification2,
  //     dataset_action_items: {
  //       create: {
  //         ...actionItem2,
  //         ingestion_checks: { create: checks2 },
  //       },
  //     },
  //   },
  // });
  // await prisma.duplicate_dataset.create({
  //   data: duplicateEntry2,
  // });
  //
  // await prisma.notification.create({
  //   data: {
  //     ...notification3,
  //     dataset_action_items: {
  //       create: {
  //         ...actionItem3,
  //         ingestion_checks: { create: checks3 },
  //       },
  //     },
  //   },
  // });
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
