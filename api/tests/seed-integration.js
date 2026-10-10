const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

if (process.env.NODE_ENV !== 'test'
  || !process.env.API_TEST_DATABASE_URL
  || process.env.DATABASE_URL !== process.env.API_TEST_DATABASE_URL) {
  throw new Error('Refusing to seed a database outside the isolated API test environment');
}

const keysDir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(keysDir, { recursive: true });
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
fs.writeFileSync(path.join(keysDir, 'auth.key'), privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(keysDir, 'auth.pub'), publicKey);

const prisma = new PrismaClient();

async function seed() {
  const roles = await Promise.all(['admin', 'operator', 'user'].map((name) => prisma.role.create({
    data: { name },
  })));
  const adminRole = roles.find((role) => role.name === 'admin');

  await prisma.user.create({
    data: {
      username: 'svc_tasks',
      email: 'svc_tasks@iu.edu',
      name: 'Test Service Account',
      user_role: { create: { role_id: adminRole.id } },
    },
  });
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
