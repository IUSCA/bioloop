const assert = require('assert');

const { PrismaClient } = require('@prisma/client');

const wfService = require('./workflow');
const userService = require('./user');

const prisma = new PrismaClient();

const INCLUDE_STATES = {
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

const INCLUDE_WORKFLOWS = {
  workflows: {
    select: {
      id: true,
    },
  },
};

const INTEGRATED_WORKFLOW = {
  name: 'Integrated',
  steps: [
    {
      name: 'inspect',
      task: 'scaworkers.workers.inspect.inspect_batch',
    },
    {
      name: 'archive',
      task: 'scaworkers.workers.archive.archive_batch',
    },
    {
      name: 'stage',
      task: 'scaworkers.workers.stage.stage_batch',
    },
    {
      name: 'validate',
      task: 'scaworkers.workers.validate.validate_batch',
    },
    {
      name: 'generate_reports',
      task: 'scaworkers.workers.report.generate',
    },
  ],
};

const STAGE_WORKFLOW = {
  name: 'Stage Batch',
  steps: [
    {
      name: 'stage',
      task: 'scaworkers.workers.stage.stage_batch',
    },
    {
      name: 'validate',
      task: 'scaworkers.workers.validate.validate_batch',
    },
    {
      name: 'generate_reports',
      task: 'scaworkers.workers.report.generate',
    },
  ],
};

const DELETE_WORKFLOW = {
  name: 'Delete Batch',
  steps: [
    {
      name: 'delete',
      task: 'scaworkers.workers.delete.delete_batch',
    },
  ],
};

const WORKFLOW_REGISTRY = {
  delete: DELETE_WORKFLOW,
  stage: STAGE_WORKFLOW,
  integrated: INTEGRATED_WORKFLOW,
};

function create_workflow(wf_name) {
  const wf = WORKFLOW_REGISTRY[wf_name];
  assert(wf, `${wf_name} workflow is not registered`);
  return (batch_id) => wfService.create({
    ...wf,
    args: [batch_id],
  });
}

async function soft_delete(batch_id, user_id) {
  const wf = (await create_workflow('delete')(batch_id)).data;

  await prisma.workflow.create({
    data: {
      id: wf.workflow_id,
      batch_id,
    },
  });

  await prisma.batch_audit.create({
    data: {
      action: 'delete',
      user_id,
      batch_id,
    },
  });
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
  const deleteAudit = prisma.batch_audit.deleteMany({
    where: {
      batch_id: id,
    },
  });
  const deleteStates = prisma.batch_state.deleteMany({
    where: {
      batch_id: id,
    },
  });
  const deleteRaWData = prisma.raw_data.delete({
    where: {
      batch_id: id,
    },
  });
  const deleteDataProduct = prisma.data_product.delete({
    where: {
      batch_id: id,
    },
  });
  const deleteBatch = prisma.batch.delete({
    where: {
      id,
    },
  });

  await prisma.$transaction([
    deleteChecksums,
    deleteWorkflows,
    deleteAudit,
    deleteStates,
    deleteRaWData,
    deleteDataProduct,
    deleteBatch,
  ]);
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
      ...INCLUDE_WORKFLOWS,
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
      ...INCLUDE_STATES,
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
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  get_batch,
  create_workflow,
};
