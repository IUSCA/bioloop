const assert = require('assert');

const { PrismaClient } = require('@prisma/client');
const config = require('config');

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

const DONE_STATUSES = ['REVOKED', 'FAILURE', 'SUCCESS'];

async function create_workflow(dataset, wf_name) {
  const wf_body = config.workflow_registry[wf_name];
  assert(wf_body, `${wf_name} workflow is not registered`);

  wf_body.name = wf_name;
  wf_body.project = config.project;

  // check if a workflow with the same name is not already running / pending on this dataset
  const active_wfs_with_same_name = dataset.workflows
    .filter((_wf) => _wf.name === wf_body.name)
    .filter((_wf) => !DONE_STATUSES.includes(_wf.status));

  assert(active_wfs_with_same_name.length === 0, 'A workflow with the same name is either pending / running');

  // create the workflow
  const wf = (await wfService.create({
    ...wf_body,
    args: [dataset.id],
  })).data;

  // add association to the dataset
  await prisma.workflow.create({
    data: {
      id: wf.workflow_id,
      dataset_id: dataset.id,
    },
  });

  return wf;
}

async function soft_delete(dataset, user_id) {
  await create_workflow(dataset, 'delete');

  await prisma.dataset_audit.create({
    data: {
      action: 'delete',
      user_id,
      dataset_id: dataset.id,
    },
  });
}

async function hard_delete(id) {
  const deleteChecksums = prisma.checksum.deleteMany({
    where: {
      dataset_id: id,
    },
  });
  const deleteWorkflows = prisma.workflow.deleteMany({
    where: {
      dataset_id: id,
    },
  });
  const deleteAudit = prisma.dataset_audit.deleteMany({
    where: {
      dataset_id: id,
    },
  });
  const deleteStates = prisma.dataset_state.deleteMany({
    where: {
      dataset_id: id,
    },
  });
  const deleteAssociations = prisma.dataset_hierarchy.deleteMany({
    where: {
      OR: [
        {
          source_id: id,
        },
        {
          derived_id: id,
        },
      ],
    },
  });
  const deleteDataset = prisma.dataset.delete({
    where: {
      id,
    },
  });

  await prisma.$transaction([
    deleteChecksums,
    deleteWorkflows,
    deleteAudit,
    deleteStates,
    deleteAssociations,
    deleteDataset,
  ]);
}

async function get_dataset({
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

  const dataset = await prisma.dataset.findFirst({
    where: { id },
    include: {
      metadata: checksumSelect,
      ...INCLUDE_WORKFLOWS,
      ...INCLUDE_AUDIT_LOGS,
      ...INCLUDE_STATES,
      source_datasets: true,
      derived_datasets: true,
    },
  });

  if (dataset) {
    let _dataset = dataset;
    if (workflows) {
      // include workflow with dataset
      const _includeWorkflows = wfService.includeWorkflows(
        last_task_run,
        prev_task_runs,
      );
      _dataset = await _includeWorkflows(dataset);
    }
    _dataset?.audit_logs?.forEach((log) => {
      // eslint-disable-next-line no-param-reassign
      if (log.user) { log.user = log.user ? userService.transformUser(log.user) : null; }
    });
    return _dataset;
  }
  return null;
}

module.exports = {
  soft_delete,
  hard_delete,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  get_dataset,
  create_workflow,
};
