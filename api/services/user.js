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

const transformUser = _.flow([
  ({ user_role, ...user }) => ({
    ...user,
    roles: user_role.map(({ roles }) => roles.name),
  }),
  _.omit(['password', 'id', 'user_role']),
]);

async function findUserByCASId(cas_id) {
  const user = await prisma.user.findUnique({
    where: {
      cas_id,
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
  findUserByCASId,
  updateLastLogin,
};
