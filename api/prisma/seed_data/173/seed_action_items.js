const { PrismaClient } = require('@prisma/client');
const config = require('config');

const prisma = new PrismaClient();

const actionItem = {
  type: config.ACTION_ITEMS_TYPES.DUPLICATE_INGESTION,
  label: 'Duplicate Ingestion',
  dataset_id: 2,
  active: true,
  acknowledged_by_id: null,
  metadata: { duplicate_dataset_id: 5 },

};

const checks = [{
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
  passed: false,
  label: 'All Original Files Found',
  report: {
    missing_files: [{
      name: 'missing_file_1',
      path: '/path/to/file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/file_2',
    }, {
      name: 'missing_file_1',
      path: '/path/to/file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/file_2',
    }, {
      name: 'missing_file_1',
      path: '/path/to/file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/file_2',
    }, {
      name: 'missing_file_1',
      path: '/path/to/file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/file_2',
    }, {
      name: 'missing_file_1',
      path: '/path/to/file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/file_2',
    }, {
      name: 'missing_file_1',
      path: '/path/to/file_1',
    }, {
      name: 'missing_file_2',
      path: '/path/to/file_2',
    }],
  },
}];

async function main() {
  await prisma.dataset_action_item.deleteMany({});
  await prisma.dataset_action_item.create({
    data: {
      ...actionItem,
      checks: { create: checks },
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
