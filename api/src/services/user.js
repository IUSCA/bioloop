const { Prisma, PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');

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
  // do not throw error if no results are found, instead return null
  // findFirst return null if no results are found
  const user = await prisma.user.findFirst({
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
/** The function `findAll` is used to retrieve a list of users from the database with various filtering, sorting,
 * and pagination options. */
async function findAll({
  search, sortBy, sort_order, skip, take,
}) {
  const sort_sql = Prisma.raw(`"${sortBy}" ${sort_order}`);
  /**
 * Constructs a SQL query to:
 * 1. Join `user`, `user_login`, `user_role`, and `role` tables to retrieve user details, roles, and last login info.
 * 2. Filter users based on the search term.
 * 3. Group results by user ID and login method.
 * 4. Sort results by the specified column and order, with nulls last.
 * 5. Apply pagination using limit and offset.
 * Executes the query and returns the total user count and details.
 */
  const sql = Prisma.sql`
  with results as (
      select u.*, ul.last_login, ul."method", array_agg(r."name") as roles from "user" u
      left join user_login ul on u.id = ul.user_id
      left join user_role ur on ur.user_id = u.id
      left join "role" r on r.id = ur.role_id
      where u."name" ilike ${`%${search}%`} or u."email" ilike ${`%${search}%`} or u."username" ilike ${`%${search}%`}
      group by u.id, ul.last_login, ul."method"
    )
    select *, count(*) over() as total_count from results
    order by ${sort_sql} nulls last
    ${take !== undefined ? Prisma.sql`limit ${take}  offset ${skip}` : Prisma.empty}
  `;

  const users = await prisma.$queryRaw(sql);
  const total_count = Number(users.length ? users[0].total_count : 0);

  return {
    count: total_count,
    users: users.map(({ last_login, method, ...rest }) => ({
      ...rest,
      login: {
        last_login,
        method,
      },
    })),
  };
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

async function canUpdateUser(username, requester) {
  if (
    requester.username === username
    || requester.roles.includes('admin')
  ) { return true; }
  const resource = transformUser(
    await prisma.user.findUniqueOrThrow(
      {
        where: { username },
        include: INCLUDE_ROLES_LOGIN,
      },
    ),
  );

  return resource.roles?.includes('user');
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
  canUpdateUser,
  INCLUDE_ROLES_LOGIN,
};
