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

async function main() {
  await Promise.allSettled(roles.map((role) => prisma.role.upsert({
    where: { id: role.id },
    create: role,
    update: role,
  })));

  // Create default admins
  const admins = ['ccbrandt', 'deduggi'];

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

  // create test user
  const users = ['test_user'];

  const user_promises = users.map((username) => prisma.user.upsert({
    where: { email: `${username}@iu.edu` },
    update: {},
    create: {
      username,
      email: `${username}@iu.edu`,
      cas_id: username,
      name: username,
      user_role: {
        create: [{ role_id: 3 }],
      },
    },
  }));

  await Promise.all(user_promises);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
