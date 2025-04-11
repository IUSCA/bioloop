const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createNonce({ purpose, expiresIn } = {}) {
  const row = await prisma.nonce.create({
    data: {
      purpose,
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    },
  });
  return row.id;
}

async function useNonce(nonce) {
  const deleted = await prisma.nonce.deleteMany({
    where: {
      id: nonce,
      OR: [
        { expires_at: null },
        { expires_at: { gte: new Date() } },
      ],
    },
  });
  return deleted.count > 0;
}

module.exports = {
  createNonce,
  useNonce,
};
