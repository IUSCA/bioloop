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

const INCLUDE_AUDIT_LOGS = {
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
    deleteBatch,
  ]);
}

async function get_batch({
  id = null,
  checksums = false,
  workflows = false,
  last_task_run = false,
  prev_task_runs = false,
}) {
  const checksumSelect = checksums ? {
    select: {
      path: true,
      md5: true,
    },
  } : false;

  const batch = await prisma.batch.findFirst({
    where: { id },
    include: {
      metadata: checksumSelect,
      ...INCLUDE_WORKFLOWS,
      ...INCLUDE_AUDIT_LOGS,
      ...INCLUDE_STATES,
      source_batches: true,
      derived_batches: true,
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

function create_batch(_data) {
  const { workflow_id, state, ...data } = _data;

  // create workflow association
  if (workflow_id) {
    data.workflows = {
      create: [
        {
          id: workflow_id,
        },
      ],
    };
  }

  // add a state
  data.states = {
    create: [
      {
        state: state || 'REGISTERED',
      },
    ],
  };

  // create batch along with associations
  return prisma.batch.create({
    data,
    include: {
      ...INCLUDE_WORKFLOWS,
      ...INCLUDE_STATES,
      raw_data: true,
      data_product: true,
    },
  });
}

module.exports = {
  soft_delete,
  hard_delete,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  get_batch,
  create_workflow,
  create_batch,
};
