/* eslint-disable no-console */
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { readUsersFromJSON } = require('../utils');

global.__basedir = path.join(__dirname, '..', '..');

const prisma = new PrismaClient();

// Create default roles
const roles = [{
  id: 1,
  name: 'admin',
  description: 'Access to the Admin Panel',
},
{
  id: 2,
  name: 'operator',
  description: 'Operator level access',
},
{
  id: 3,
  name: 'user',
  description: 'User level access',
}];

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
  await Promise.allSettled(roles.map((role) => prisma.role.upsert({
    where: { id: role.id },
    create: role,
    update: role,
  })));

  // eslint-disable-next-line no-console
  console.log(`created ${roles.length} roles`);

  // Create default admins
  const _admins = [
    {
      id: 1,
      name: 'svc_tasks',
      username: 'svc_tasks',
      email: 'svc_tasks@iu.edu',
    },
  ];

  await Promise.all(_admins
    .map((user) => prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        ...user,
        cas_id: user.username,
        user_role: {
          create: [{ role_id: 1 }],
        },
      },
    })));

  const tables = ['user', 'role'];
  await Promise.all(tables.map(update_seq));

  // Create users from json files
  const additional_admins = readUsersFromJSON('admins.json');

  const admins = additional_admins
    .map((user) => ({
      ...user,
      cas_id: user.username,
      user_role: {
        create: [{ role_id: 1 }],
      },
    }));

  const users_read = readUsersFromJSON('users.json');
  const users = users_read.map((user) => ({
    ...user,
    cas_id: user.username,
    user_role: {
      create: [{ role_id: 3 }],
    },
  }));

  const operators_read = readUsersFromJSON('operators.json');
  const operators = operators_read.map((user) => ({
    ...user,
    cas_id: user.username,
    user_role: {
      create: [{ role_id: 2 }],
    },
  }));

  const promises = admins
    .concat(operators)
    .concat(users)
    .map((user) => prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    }));

  await Promise.all(promises);
  await Promise.all(tables.map(update_seq));

  console.log(`created ${admins.length} adminstrators`);
  console.log(`created ${operators.length} operators`);
  console.log(`created ${users.length} users`);
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
