require('module-alias/register');
const path = require('path');

global.__basedir = path.join(__dirname, '..');
const { PrismaClient } = require('@prisma/client');
const { conversionDefinitions } = require('./seed_data/conversion_definitions');
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
    console.log('Starting conversion definition seeding...');

    // First, ensure cmd_line_programs exist
    console.log('Checking/creating cmd_line_programs...');
    await prisma.cmd_line_program.deleteMany();
    await prisma.cmd_line_program.createMany({
      data: cmdLinePrograms,
    });

    // Get the inserted programs to map their IDs
    const programs = await prisma.cmd_line_program.findMany();
    const programMap = {};
    programs.forEach((program) => {
      programMap[program.name] = program.id;
    });

    // Update conversion definitions with program_id references
    const conversionDefinitionsWithPrograms = conversionDefinitions.map((def) => ({
      ...def,
      program_id: programMap[def.name],
      author_id: 1, // Default to first user (admin)
    }));

    // Delete existing conversion definitions
    console.log('Deleting existing conversion definitions...');
    await prisma.conversion_definition.deleteMany();

    // Insert new conversion definitions
    console.log('Inserting conversion definitions...');
    await prisma.conversion_definition.createMany({
      data: conversionDefinitionsWithPrograms,
    });

    // Update the sequence
    console.log('Updating sequence...');
    await update_seq('conversion_definition');

    console.log('Conversion definition seeding completed successfully!');
    console.log(`Inserted ${conversionDefinitions.length} conversion definitions`);

    // Display the inserted data
    const inserted = await prisma.conversion_definition.findMany({
      orderBy: { id: 'asc' },
      include: {
        program: true,
      },
    });

    console.log('\nInserted conversion definitions:');
    inserted.forEach((cd) => {
      console.log(`- ${cd.name} (ID: ${cd.id}) - ${cd.description} - Program: ${cd.program.name}`);
    });
  } catch (error) {
    console.error('Error seeding conversion definitions:', error);
    throw error;
  }
}

main()
  .then(() => {
    prisma.$disconnect();
    console.log('Database connection closed.');
  })
  .catch(async (e) => {
    console.error('Failed to seed conversion definitions:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
