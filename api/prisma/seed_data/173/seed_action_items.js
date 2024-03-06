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
