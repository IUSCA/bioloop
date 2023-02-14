const { PrismaClient } = require('@prisma/client');
const _ = require('lodash');
// const { renameKey } = require('../utils');

const prisma = new PrismaClient();

function transformUser(user) {
  return _(user)
    .set('roles', user.user_role.map((obj) => obj.roles.name))
    .omit(['password', 'id', 'user_role'])
    .value();
}

async function findUserById(id) {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
    include: {
      user_role: {
        select: { roles: true },
      },
    },
  });
  return transformUser(user);
}

async function updateLastLogin(id) {
  return id;
}

module.exports = {
  findUserById,
  updateLastLogin,
};
