/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');

const prisma = new PrismaClient();

async function main() {
  /**
   * Unstages all datasets that are currently staged
   *
   * Usage: node src/scripts/unstage_datasets.js
   */
  const res = await prisma.dataset.updateMany({
    where: {
      is_staged: true,
    },
    data: {
      is_staged: false,
    },
  });

  console.log(`Deleted ${res.count} staged datasets`);
  console.dir(res, { depth: null });

  return res;
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
