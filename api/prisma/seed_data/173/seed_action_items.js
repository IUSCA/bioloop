const { PrismaClient } = require('@prisma/client');
const config = require('config');

const prisma = new PrismaClient();

const actionItems = [{
  type: config.ACTION_ITEMS_TYPES.DUPLICATE_INGESTION,
  label: 'Duplicate Ingestion',
  original_dataset_id: 1,
  duplicate_dataset_id: 2,
  active: true,
  acknowledged_by_id: null,
}, {
  type: config.ACTION_ITEMS_TYPES.DUPLICATE_INGESTION,
  label: 'Duplicate Ingestion',
  original_dataset_id: 2,
  duplicate_dataset_id: 4,
  active: true,
  acknowledged_by_id: null,
}, {
  type: config.ACTION_ITEMS_TYPES.DUPLICATE_INGESTION,
  label: 'Duplicate Ingestion',
  original_dataset_id: 2,
  duplicate_dataset_id: 5,
  active: false,
  acknowledged_by_id: null,
  checks: [{
    check: 'num_files_same',
    passed: false,
    details: {
      original_files_count: 20,
      duplicate_files_count: 30,
    },
  }, {
    check: 'checksums_validated',
    passed: false,
    details: {
      conflicting_checksum_files: [{
        name: 'checksum_error_file_1',
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
    check: 'all_original_files_found',
    passed: false,
    details: {
      missing_files: [{
        name: 'missing_file_1',
        path: '/path/to/file_1',
      }, {
        name: 'missing_file_2',
        path: '/path/to/file_2',
      }],
    },
  }],
}];

async function main() {
  await prisma.ingestion_action_item.deleteMany({});
  await prisma.ingestion_action_item.createMany({ data: actionItems });
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
