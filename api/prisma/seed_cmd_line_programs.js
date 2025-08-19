require('module-alias/register');
const path = require('path');

global.__basedir = path.join(__dirname, '..');
const { PrismaClient } = require('@prisma/client');
const { cmdLinePrograms } = require('./seed_data/cmd_line_programs');

const prisma = new PrismaClient();

async function update_seq(table) {
  // Get the current maximum value of the id column
  const result = await prisma[table].aggregate({
    _max: {
      id: true,
    },
  });
  const currentMaxId = result?._max?.id || 0;

  // Reset the sequence to the current maximum value
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE ${table}_id_seq RESTART WITH ${currentMaxId + 1}`);
}

async function main() {
  try {
    console.log('Starting cmd_line_program seeding...');

    // Delete existing cmd_line_programs
    console.log('Deleting existing cmd_line_programs...');
    await prisma.cmd_line_program.deleteMany();

    // Insert new cmd_line_programs
    console.log('Inserting cmd_line_programs...');
    await prisma.cmd_line_program.createMany({
      data: cmdLinePrograms,
    });

    // Update the sequence
    console.log('Updating sequence...');
    await update_seq('cmd_line_program');

    console.log('cmd_line_program seeding completed successfully!');
    console.log(`Inserted ${cmdLinePrograms.length} cmd_line_programs`);

    // Display the inserted data
    const inserted = await prisma.cmd_line_program.findMany({
      orderBy: { id: 'asc' },
    });

    console.log('\nInserted cmd_line_programs:');
    inserted.forEach((program) => {
      console.log(`- ${program.name} (ID: ${program.id}) - ${program.executable_path}`);
    });
  } catch (error) {
    console.error('Error seeding cmd_line_programs:', error);
    throw error;
  }
}

main()
  .then(() => {
    prisma.$disconnect();
    console.log('Database connection closed.');
  })
  .catch(async (e) => {
    console.error('Failed to seed cmd_line_programs:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

