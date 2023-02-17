const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
// const { renameKey } = require('../utils');

const prisma = new PrismaClient();

// using lodash chain api
// function transformUser(user) {
//   return _(user)
//     .set('roles', user.user_role.map((obj) => obj.roles.name))
//     .omit(['password', 'id', 'user_role'])
//     .value();
// }

// TODO: what happens if input is null or malformed
const transformUser = _.flow([
  ({ user_role, ...user }) => ({
    ...user,
    roles: user_role.map(({ roles }) => roles.name),
  }),
  _.omit(['password', 'id', 'user_role']),
]);

async function findActiveUserBy(key, value) {
  const user = await prisma.user.findFirst({
    where: {
      is_deleted: false,
      [key]: value,
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
  findActiveUserBy,
  updateLastLogin,
};
