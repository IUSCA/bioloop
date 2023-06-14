const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
// const { renameKey } = require('../utils');

const prisma = new PrismaClient();

const INCLUDE_ROLES_LOGIN = {
  user_role: {
    select: { roles: true },
  },
  login: {
    select: {
      last_login: true,
      method: true,
    },
  },
};

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
    roles: user_role?.map(({ roles }) => roles.name),
  }),
  _.omit(['password', 'user_role']),
]);

async function findRoles(roles, _prisma) {
  const __primsa = _prisma || prisma;
  return __primsa.role.findMany({
    where: {
      OR: roles.map((role) => ({
        name: {
          equals: role,
        },
      })),
    },
  });
}

async function setPassword({ user_id, password, _prisma }) {
  // use the global prisma if not given
  const __prisma = _prisma || prisma;
  return __prisma.$queryRaw`
    UPDATE "user_password"
    SET password = crypt(${password}, gen_salt('bf'))
    where id = ${user_id};
  `;
}

async function findActiveUserBy(key, value) {
  const user = await prisma.user.findFirstOrThrow({
    where: {
      is_deleted: false,
      [key]: value,
    },
    include: INCLUDE_ROLES_LOGIN,
  });
  return user ? transformUser(user) : user;
}

async function updateLastLogin({ id, method }) {
  return prisma.user_login.upsert({
    where: {
      user_id: id,
    },
    update: {
      last_login: new Date(),
      method,
    },
    create: {
      user_id: id,
      method,
    },
  });
}

async function findAll(sort) {
  const users = await prisma.user.findMany({
    include: INCLUDE_ROLES_LOGIN,
    orderBy: sort.map(({ key, dir }) => ({ [key]: dir })),
  });
  return users.map(transformUser);
}

async function createUser(data) {
  const userData = _.flow([
    _.pick(['username', 'name', 'email', 'cas_id', 'notes']),
    _.omitBy(_.isNil),
  ])(data);
  const roleObjs = await findRoles(data.roles || []);

  const user = await prisma.user.create({
    data: {
      ...userData,
      ...(roleObjs && {
        user_role: {
          create: roleObjs.map((r) => ({ role_id: r.id })),
        },
      }),
    },
    include: INCLUDE_ROLES_LOGIN,
  });

  return user ? transformUser(user) : user;
}

async function softDeleteUser(username) {
  const updatedUser = await prisma.user.update({
    where: {
      username,
    },
    data: {
      is_deleted: true,
    },
    include: INCLUDE_ROLES_LOGIN,
  });
  return updatedUser ? transformUser(updatedUser) : updatedUser;
}

// async function setRoles(user_id, role_ids) {

// }

async function updateUser(username, data) {
  const updates = _.flow([
    _.pick(['username', 'name', 'email', 'cas_id', 'notes', 'is_deleted']),
    _.omitBy(_.isNil),
  ])(data);

  const updatedUser = await prisma.$transaction(async (_prisma) => {
    // find user to update
    const user = await _prisma.user.findUniqueOrThrow({ where: { username } });

    // delete existing user-role connections for this user
    await _prisma.user_role.deleteMany({ where: { user_id: user.id } });

    // find role ids
    const roleRows = await findRoles(data.roles || [], _prisma);

    // update user
    return _prisma.user.update({
      where: {
        username,
      },
      data: {
        ...updates,
        user_role: {
          create: roleRows.map((r) => ({ role_id: r.id })),
        },
      },
      include: INCLUDE_ROLES_LOGIN,
    });
  });
  return updatedUser ? transformUser(updatedUser) : updatedUser;
}

module.exports = {
  transformUser,
  findActiveUserBy,
  updateLastLogin,
  findAll,
  createUser,
  setPassword,
  softDeleteUser,
  updateUser,
  findRoles,
};
