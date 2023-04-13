const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function soft_delete(id, user_id) {
  const mark_deleted = prisma.batch.update({
    where: {
      id,
    },
    data: {
      is_deleted: true,
    },
  });
  const log_delete = prisma.batch_audit.create({
    data: {
      action: 'delete',
      user_id,
      batch_id: id,
    },
  });
  const [updatedBatch, _] = await prisma.$transaction([mark_deleted, log_delete]);
  return updatedBatch;
}

async function hard_delete(id) {
  const deleteChecksums = prisma.checksum.deleteMany({
    where: {
      batch_id: id,
    },
  });
  const deleteWorkflows = prisma.workflow.deleteMany({
    where: {
      batch_id: id,
    },
  });
  const deleteBatch = prisma.batch.delete({
    where: {
      id,
    },
  });

  await prisma.$transaction([deleteChecksums, deleteWorkflows, deleteBatch]);
}

module.exports = {
  soft_delete,
  hard_delete,
};
