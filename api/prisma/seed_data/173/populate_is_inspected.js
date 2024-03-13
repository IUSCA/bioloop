const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // `is_inspected` is a new field introduced in Bioloop ticket #173. It is intended
  // to be true for datasets that have passed the `inspect` step, and false otherwise.
  // The  updated schema file will set the value of this field to false when the field
  // is created. We are updating it to true below for all datasets that currently exist
  // in the system, since they all must have passed the `inspect` step at some point in
  // the past.
  await prisma.dataset.updateMany({
    where: {},
    data: {
      is_inspected: true,
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
