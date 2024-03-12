const { PrismaClient } = require('@prisma/client');
const config = require('config');

const prisma = new PrismaClient();

const notification1 = {
  label: 'Duplicate Ingestion',
  acknowledged_by_id: null,
};
const actionItem1 = {
  type: 'DUPLICATE_INGESTION',
  dataset_id: 3,
  metadata: { duplicate_dataset_id: 5 },
};
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
  type: 'NO_MISSING_FILES',
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
  label: 'Duplicate Ingestion',
  acknowledged_by_id: null,
};
const actionItem2 = {
  type: 'DUPLICATE_INGESTION',
  dataset_id: 10,
  metadata: { duplicate_dataset_id: 11 },
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
  type: 'NO_MISSING_FILES',
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
  label: 'Duplicate Ingestion',
  acknowledged_by_id: null,
};
const actionItem3 = {
  type: 'DUPLICATE_INGESTION',
  dataset_id: 10,
  metadata: { duplicate_dataset_id: 11 },
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
  type: 'NO_MISSING_FILES',
  label: 'All Original Files Found',
  passed: true,
  report: {
    missing_files: [],
  },
}];

async function main() {
  await prisma.notification.deleteMany({});
  await prisma.notification.create({
    data: {
      ...notification1,
      dataset_action_items: {
        create: {
          ...actionItem1,
          ingestion_checks: { create: checks1 },
        },
      },
    },
  });
  await prisma.notification.create({
    data: {
      ...notification2,
      dataset_action_items: {
        create: {
          ...actionItem2,
          ingestion_checks: { create: checks2 },
        },
      },
    },
  });
  await prisma.notification.create({
    data: {
      ...notification3,
      dataset_action_items: {
        create: {
          ...actionItem3,
          ingestion_checks: { create: checks3 },
        },
      },
    },
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
