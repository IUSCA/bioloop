/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');

const prisma = new PrismaClient();

async function main() {
  /**
   * Deletes datasets by ids and all these following associations
   * dataset_hierarchy, dataset_audit, dataset_state, dataset_file,
   * dataset_file_hierarchy, project_dataset
   *
   * Usage: node src/scripts/delete_datasets.js <ids>
   * ex: node src/scripts/delete_datasets.js 1 2 3
   */
  const args = process.argv.slice(2);
  const ids = args.map(_.toInteger);

  if (ids.every(_.isInteger)) {
    const res = await prisma.dataset.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
    return res;
  }
  console.error('one or more args is not a integer');
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
