require('module-alias/register');
const path = require('path');

global.__basedir = path.join(__dirname, '..');
const { PrismaClient } = require('@prisma/client');
const { argumentData } = require('./seed_data/arguments');
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
    console.log('Starting argument seeding...');

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

    // Update arguments with program_id references based on linking logic
    const argumentDataWithPrograms = [];

    // bcl2fastq links to all args
    const bcl2fastqProgramId = programMap.bcl2fastq;
    argumentData.forEach((arg) => {
      argumentDataWithPrograms.push({
        ...arg,
        program_id: bcl2fastqProgramId,
      });
    });

    // Other programs link to no lane splitting, delete undetermined, filter single index
    const otherProgramNames = [
      'bcl-convert', 'cellranger-v8.0.1', 'cellranger-v6.1.2', 'cellranger-v4.0.0',
      'cellranger-arc', 'cellranger-arc-v2', 'cellranger-atac', 'spaceranger-v3.0.1',
      'spaceranger-v1.3.1', 'spaceranger-v1.1.0',
    ];

    const commonArgs = argumentData.filter((arg) => ['--no-lane-splitting', '--delete-undetermined', '--filter-single-index'].includes(arg.name));

    otherProgramNames.forEach((programName) => {
      const programId = programMap[programName];
      if (programId) {
        commonArgs.forEach((arg) => {
          argumentDataWithPrograms.push({
            ...arg,
            program_id: programId,
          });
        });
      }
    });

    // Delete existing arguments
    console.log('Deleting existing arguments...');
    await prisma.argument.deleteMany();

    // Insert new arguments
    console.log('Inserting arguments...');
    await prisma.argument.createMany({
      data: argumentDataWithPrograms,
    });

    // Update the sequence
    console.log('Updating sequence...');
    await update_seq('argument');

    console.log('Argument seeding completed successfully!');
    console.log(`Inserted ${argumentDataWithPrograms.length} arguments`);

    // Display the inserted data
    const inserted = await prisma.argument.findMany({
      orderBy: { id: 'asc' },
      include: {
        program: true,
      },
    });

    console.log('\nInserted arguments:');
    inserted.forEach((arg) => {
      console.log(`- ${arg.name} (ID: ${arg.id}) - Program: ${arg.program.name} - Position: ${arg.position}`);
    });
  } catch (error) {
    console.error('Error seeding arguments:', error);
    throw error;
  }
}

main()
  .then(() => {
    prisma.$disconnect();
    console.log('Database connection closed.');
  })
  .catch(async (e) => {
    console.error('Failed to seed arguments:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
