const { PrismaClient } = require('@prisma/client');

const wfService = require('./workflow');
const userService = require('./user');

const prisma = new PrismaClient();

const include_states = {
  states: {
    select: {
      state: true,
      timestamp: true,
      metadata: true,
    },
    orderBy: {
      timestamp: 'desc',
    },
  },
};

const include_workflows = {
  workflows: {
    select: {
      id: true,
    },
  },
};

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

async function get_batch({
  id = null,
  raw_data_id = null,
  data_product_id = null,
  checksums = false,
  workflows = false,
  last_task_run = false,
  prev_task_runs = false,
}) {
  let query = null;
  if (id) {
    query = { id };
  } else if (raw_data_id) {
    query = {
      raw_data: {
        id: raw_data_id,
      },
    };
  } else if (data_product_id) {
    query = {
      data_product: {
        id: data_product_id,
      },
    };
  } else {
    throw new Error('invalid parameters - at least one of id, raw_data_id, data_product_id must be provided');
  }

  const checksumSelect = checksums ? {
    select: {
      path: true,
      md5: true,
    },
  } : false;

  const batch = await prisma.batch.findFirst({
    where: query,
    include: {
      metadata: checksumSelect,
      ...include_workflows,
      audit_logs: {
        include: {
          user: {
            include: {
              user_role: {
                select: { roles: true },
              },
            },
          },
        },
      },
      ...include_states,
      raw_data: true,
      data_product: true,
    },
  });

  if (batch) {
    let _batch = batch;
    if (workflows) {
      // include workflow with batch
      const _includeWorkflows = wfService.includeWorkflows(
        last_task_run,
        prev_task_runs,
      );
      _batch = await _includeWorkflows(batch);
    }
    _batch?.audit_logs?.forEach((log) => {
      // eslint-disable-next-line no-param-reassign
      if (log.user) { log.user = log.user ? userService.transformUser(log.user) : null; }
    });
    return _batch;
  }
  return null;
}

module.exports = {
  soft_delete,
  hard_delete,
  include_states,
  include_workflows,
  get_batch,
};
