const { Prisma } = require('@prisma/client');
const prisma = require('@/db');

async function createNonce({ purpose, expiresIn } = {}) {
  const row = await prisma.nonce.create({
    data: {
      purpose: purpose ?? Prisma.skip,
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000) : Prisma.skip,
    },
  });
  return row.id;
}

async function useNonce(nonce) {
  const deleted = await prisma.nonce.deleteMany({
    where: {
      id: nonce,
      OR: [
        { expires_at: null }, // Nonces without expiration
        { expires_at: { gte: new Date() } }, // Or nonces that haven't expired yet
      ],
    },
  });
  return deleted.count > 0;
}

/**
 * Deletes expired nonces from the database based on the specified expiration criteria.
 *
 * A nonce is considered expired if:
 * - `expires_at` is set and is less than the current time.
 * - OR `expires_at` is null and `created_at` is older than the specified expiration time.
 *
 * @async
 * @function deleteExpiredNonces
 * @param {number} expirationSeconds - The number of seconds to determine the expiration cutoff for nonces.
 * @returns {Promise<number>} The count of nonces that were deleted.
 */
async function deleteExpiredNonces(expirationSeconds) {
  const cutoffDate = new Date(Date.now() - expirationSeconds * 1000);
  const deleted = await prisma.nonce.deleteMany({
    where: {
      OR: [
        { expires_at: { lte: new Date() } },
        {
          AND: [
            { created_at: { lte: cutoffDate } },
            { expires_at: null },
          ],
        },
      ],
    },
  });
  return deleted.count;
}

module.exports = {
  createNonce,
  useNonce,
  deleteExpiredNonces,
};
