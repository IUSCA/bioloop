const { PrismaClient } = require('@prisma/client');

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
  const admins = ['ccbrandt', 'deduggi', 'svc_tasks'];

  const admin_promises = admins.map((username) => prisma.user.upsert({
    where: { email: `${username}@iu.edu` },
    update: {},
    create: {
      username,
      email: `${username}@iu.edu`,
      cas_id: username,
      name: username,
      user_role: {
        create: [{ role_id: 1 }, { role_id: 2 }],
      },
    },
  }));

  await Promise.all(admin_promises);

  // eslint-disable-next-line no-console
  console.log(`created ${admins.length} admin users`);

  const tables = ['user', 'role'];
  await Promise.all(tables.map(update_seq));
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
