/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
require('module-alias/register');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { readUsersFromJSON } = require('../utils');
const { GRANT_ACCESS_TYPES } = require('../constants');

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
  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      create: role,
      update: role,
    });
  }

  console.log(`created ${roles.length} roles`);

  // Create default admins
  const _admins = [
    {
      name: 'svc_tasks',
      username: 'svc_tasks',
      email: 'svc_tasks@iu.edu',
    },
  ];

  const additional_admins = readUsersFromJSON('admins.json');

  const admins = _admins
    .concat(additional_admins)
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

  for (const user of admins.concat(operators).concat(users)) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
  }

  console.log(`created ${admins.length} administrators`);
  console.log(`created ${operators.length} operators`);
  console.log(`created ${users.length} users`);

  // Upsert grant access types
  for (const gat of GRANT_ACCESS_TYPES) {
    await prisma.grant_access_type.upsert({
      where: { id: gat.id },
      update: {},
      create: gat,
    });
  }

  console.log(`created ${GRANT_ACCESS_TYPES.length} grant access types`);

  const tables = ['user', 'role', 'grant_access_type'];
  for (const table of tables) {
    await update_seq(table);
  }
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
