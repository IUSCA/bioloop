const path = require('path');

const { PrismaClient } = require('@prisma/client');
// const _ = require('lodash/fp');
const config = require('config');

global.__basedir = path.join(__dirname, '..');

const prisma = new PrismaClient();

if (['production'].includes(config.get('mode'))) {
  // exit if in production mode
  console.error('Seed script should not be run in production mode. Run node src/scripts/init_prod_users.js instead.');
  process.exit(1);
}

async function main() {
  console.log('Creating dataset file types...');

  await prisma.dataset_file_type.createMany({
    data: [
      {
        name: 'FASTQ',
        extension: 'fastq',
      },
      {
        name: 'BAM',
        extension: 'bam',
      },
      {
        name: 'BIGWIG',
        extension: 'bigwig',
      },
      {
        name: 'VCF',
        extension: 'vcf',
      },
    ],
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
