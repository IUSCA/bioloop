const assert = require('assert');
const path = require('node:path');

const config = require('config');
// const _ = require('lodash/fp');
const createError = require('http-errors');

const prisma = require('@/db');
const wfService = require('./workflow');
const userService = require('./user');
const FileGraph = require('./fileGraph');
const workflowService = require('./workflow');
const logger = require('./logger');

const { log_axios_error } = require('../utils');
const {
  DONE_STATUSES, INCLUDE_STATES, INCLUDE_WORKFLOWS, INCLUDE_AUDIT_LOGS,
} = require('../constants');
const CONSTANTS = require('../constants');
const asyncHandler = require('../middleware/asyncHandler');
const { getPermission, accessControl } = require('../middleware/auth');

function get_wf_body(wf_name) {
  assert(config.workflow_registry.has(wf_name), `${wf_name} workflow is not registered`);

  // create a deep copy of the config object because it is immutable
  const wf_body = { ...config.workflow_registry[wf_name] };

  wf_body.name = wf_name;
  wf_body.app_id = config.app_id;
  wf_body.steps = wf_body.steps.map((step) => ({
    ...step,
    queue: step.queue || `${config.app_id}.q`,
  }));
  return wf_body;
}

async function create_workflow(dataset, wf_name, initiator_id) {
  const wf_body = get_wf_body(wf_name);

  // check if a workflow with the same name is not already running / pending on
  // this dataset
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
      ...(initiator_id && { initiator_id }),
    },
  });

  return wf;
}

async function soft_delete(dataset, user_id) {
  if (dataset.archive_path) {
    // if archived, starts a delete archive workflow which will
    // mark the dataset as deleted on success.
    await create_workflow(dataset, 'delete', user_id);
  } else {
    // if not archived, mark the dataset as deleted
    await prisma.dataset.update({
      data: {
        is_deleted: true,
        states: {
          create: {
            state: 'DELETED',
          },
        },
      },
      where: {
        id: dataset.id,
      },
    });
  }

  await prisma.dataset_audit.create({
    data: {
      action: 'delete',
      user_id,
      dataset_id: dataset.id,
    },
  });
}

async function get_dataset({
  id = null,
  files = false,
  workflows = false,
  last_task_run = false,
  prev_task_runs = false,
  only_active = false,
  bundle = false,
  includeProjects = false,
  initiator = false,
  include_source_instrument = false,
}) {
  const fileSelect = files ? {
    select: {
      path: true,
      md5: true,
    },
    where: {
      NOT: {
        filetype: 'directory',
      },
    },
  } : false;

  const workflow_include = initiator ? {
    workflows: {
      select: {
        id: true,
        initiator: true,
      },
    },
  } : INCLUDE_WORKFLOWS;

  const dataset = await prisma.dataset.findFirstOrThrow({
    where: { id },
    include: {
      files: fileSelect,
      ...workflow_include,
      ...INCLUDE_AUDIT_LOGS,
      ...INCLUDE_STATES,
      bundle,
      source_datasets: true,
      derived_datasets: true,
      projects: includeProjects,
      ...(include_source_instrument ? {
        src_instrument: {
          select: {
            name: true,
          },
        },
      } : undefined),
    },
  });
  const dataset_workflows = dataset.workflows;

  if (workflows && dataset.workflows.length > 0) {
    // include workflow objects with dataset
    try {
      const wf_res = await wfService.getAll({
        only_active,
        last_task_run,
        prev_task_runs,
        workflow_ids: dataset.workflows.map((x) => x.id),
      });
      dataset.workflows = wf_res.data.results.map((wf) => {
        const dataset_wf = dataset_workflows.find((dw) => dw.id === wf.id);
        return {
          ...wf,
          ...dataset_wf,
        };
      });
    } catch (error) {
      log_axios_error(error);
      dataset.workflows = [];
    }
  }
  dataset?.audit_logs?.forEach((log) => {
    // eslint-disable-next-line no-param-reassign
    if (log.user) { log.user = log.user ? userService.transformUser(log.user) : null; }
  });

  return dataset;
}

// async function files_ls({ dataset_id, base = '' }) {
//   /**
//    * root base should be ''
//    * non-root base should end with '/'
//    *
//    * handle non-unix paths
//    * handle paths with escaped /
//    */
//   let base_path = '';
//   if (base === '' || base === '/') base_path = '';
//   else if (!base.endsWith('/')) base_path = `${base}/`;
//   else base_path = base;

//   /**
//    * Find files of a dataset which are immediate children of `base` path
//    *
//    * Query: filter rows by dataset_id, rows starting with `base`,
//    * and rows where the path after `base` does not have /
//    *
//    * Ex: base: 'dir1/', query matches 'dir1/readme.txt', 'dir1/image.jpg'
//    * query does not match 'dir1/dir2/readme.txt'
//    */
//   const filesPromise = prisma.$queryRaw`
//     select *
//     from dataset_file
//     where dataset_id = ${dataset_id}
//       and path like ${base_path}||'%'
//       and position('/' IN substring(path, length(${base_path})+1)) = 0;
//   `;

//   /**
// * Find directories of a dataset which are immediate children of `base` path
// *
//    * Query: filter rows by dataset_id, rows starting with `base`,
//    * and rows where the path after `base` does have / (these files are not immediate children)
//    *
//    * Transform the substring path after `base` by matching with regex
//    * which selects characters which are not /
//    * Returns unique values after transformation
//    *
//    * Ex: base: 'dir1/', query matches 'dir1/dir2/readme.txt', 'dir1/dir3/image.jpg'
//    * does not match 'dir1/readme.txt'.
//    *
//    *
//    * Matched items gets transformed:
//    * 'dir1/dir2/readme.txt' -> 'dir2'
//    * 'dir1/dir3/image.jpg' -> 'dir3'
//    */
//   const directoriesPromise = prisma.$queryRaw`
//     select distinct substring(substring(path, length(${base_path})+1), '([^/]+)') as name
//     from dataset_file
//     where dataset_id = ${dataset_id}
//       and path like ${base_path}||'%'
//       and position('/' IN substring(path, length(${base_path})+1)) != 0;
//   `;

//   // both queries are run asynchronously, wait for them to complete
//   const files = (await filesPromise).map(
//     (file) => Object.assign(file, { size: parseInt(file.size, 10) }),
//   );

//   // for directories, only names are returned
//   // transform them to have similar schema as files
//   const directories = (await directoriesPromise).map((dir) => ({
//     path: path.join(base_path, dir.name),
//     filetype: 'directory',
//     size: 0,
//   }));

//   // return a single list of files and directories
//   return _.concat(files)(directories);
// }

function create_filetree(files) {
  const root = {
    metadata: {},
    children: {},
  };

  files.forEach((file) => {
    const { path: relPath, ...rest } = file;
    const pathObject = path.parse(relPath);
    const parent_dir = pathObject.dir
      .split(path.sep)
      .reduce((parent, dir_name) => {
        const curr = parent.children[dir_name] || {
          metadata: {},
          children: {},
        };
        // eslint-disable-next-line no-param-reassign
        parent.children[dir_name] = curr;
        return curr;
      }, root);
    parent_dir.children[pathObject.base] = {
      metadata: { ...rest },
    };
  });

  return root;
}

/**
 * Check if the user has access to the given dataset.
 * @param dataset_id
 * @param user_id
 * @returns {Promise<boolean>}
 */
async function has_dataset_assoc({
  dataset_id, user_id,
}) {
  const projects = await prisma.project.findMany({
    where: {
      users: {
        some: {
          user: {
            id: user_id,
          },
        },
      },
      datasets: {
        some: {
          dataset: {
            id: dataset_id,
          },
        },
      },
    },
  });

  return projects.length > 0;
}

/**
 * Gets the user who created the given dataset.
 *
 * @param {Object} params - The parameters object.
 * @param {number} params.dataset_id - The ID of the dataset.
 *
 * @returns {Promise<Object>} A promise that resolves to the user object of the user who created the dataset.
 *
 * @throws {Error} If an audit log for the dataset's creation is not found.
 * @throws {Error} If the user who created the dataset cannot be determined.
 */
async function get_dataset_creator({ dataset_id }) {
  const dataset_creation_log = await prisma.dataset_audit.findFirst({
    where: {
      dataset_id,
      create_method: {
        in: [
          CONSTANTS.DATASET_CREATE_METHODS.UPLOAD,
          CONSTANTS.DATASET_CREATE_METHODS.IMPORT,
          CONSTANTS.DATASET_CREATE_METHODS.SCAN,
        ],
      },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });
  if (!dataset_creation_log) {
    throw new Error(`Expected to find an audit log for the creation of dataset ${dataset_id}, but found none.`);
  }
  if (!dataset_creation_log.user) {
    throw new Error(`Could not find user who created dataset ${dataset_id}.`);
  }

  return dataset_creation_log.user;
}

/**
 * Determine if the user has access to initiate the given workflow for the given dataset.
 *
 * The access rules are as follows:
 * 1. Users with `admin` or `operator` roles are always allowed to initiate any of the above workflows.
 * 2. Users with 'user' role:
 *     - For `integrated`, `process_dataset_upload`, or `cancel_dataset_upload` workflows:
 *       - They are allowed to proceed only if they created the dataset.
 *     - For other allowed workflows:
 *       - They are allowed to proceed if they are assigned to a project associated with the dataset.
 *
 * If the user doesn't have the necessary permissions, a Forbidden error is thrown.
 * If the dataset creation audit log can't be found, an InternalServerError is thrown.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.workflow - The workflow name which is to be initiated.
 * @param {number} params.dataset_id - The ID of the dataset on which the workflow is to be run.
 * @param {number} params.user_id - The ID of the user who is requesting for the given workflow to be run on the given dataset.
 *
 * @returns {Promise<boolean>}
 */
async function has_workflow_access({ workflow, dataset_id, user_id }) {
  const user = await prisma.user.findUnique({
    where: { id: user_id },
    include: {
      user_role: {
        select: {
          roles: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
  const user_roles = user.user_role.map((ur) => ur.roles.name);

  if (user_roles.some((role) => ['operator', 'admin'].includes(role))) {
    return true;
  }

  let user_has_workflow_access = false;

  if ([CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD,
    CONSTANTS.WORKFLOWS.CANCEL_DATASET_UPLOAD,
    CONSTANTS.WORKFLOWS.INTEGRATED]
    .includes(workflow)) {
    const dataset_creator = await get_dataset_creator({ dataset_id });
    user_has_workflow_access = dataset_creator.id === user_id;
  } else {
    user_has_workflow_access = await has_dataset_assoc({
      dataset_id,
      user_id,
    });
  }

  return user_has_workflow_access;
}

// async function search_files({ dataset_id, query }) {
//   const file_matches_promise = prisma.$queryRaw`
//     select
//       *
//     from
//       dataset_file
//     where
//       dataset_id = ${dataset_id}
//       and substring(path, '([^/]*$)') ilike '%'||${query}||'%'
//   `;

//   const dir_matches_promise = prisma.$queryRaw`
//     select
//       distinct substring(path, '(^.+/)')
//     from
//       dataset_file
//     where
//       dataset_id = ${dataset_id}
//       and substring(path, '(^.+/)') like '%dir%'
//   `;

//   const file_matches = await file_matches_promise;
//   const dir_matches = await dir_matches_promise;

//   return {
//     file_matches,
//     dir_matches,
//   };
// }

async function files_ls({ dataset_id, base = '' }) {
  let base_path = '';
  if (base === '' || base === '/') base_path = '';
  else if (base.endsWith('/')) base_path = base.replace(/\/+$/, '');
  else base_path = base;

  const results = await prisma.dataset_file.findFirstOrThrow({
    where: {
      dataset_id,
      path: base_path,
    },
    include: {
      children: {
        include: {
          child: true,
        },
      },
    },
  });
  return results.children.map((row) => row.child);
}

async function search_files({
  dataset_id, name = '', base = '',
  skip, take,
  extension = null, filetype = null, min_file_size = null, max_file_size = null,
}) {
  // TODO: filter by extension, size, filetype, status

  let base_path = '';
  if (base === '/') base_path = '';
  else if (base.endsWith('/')) base_path = base.replace(/\/+$/, '');
  else base_path = base;

  let size_query = {};
  if (min_file_size && max_file_size) {
    size_query = {
      size: {
        gte: min_file_size,
        lte: max_file_size,
      },
    };
  } else if (min_file_size) {
    size_query = {
      size: {
        gte: min_file_size,
      },
    };
  } else if (max_file_size) {
    size_query = {
      size: {
        lte: max_file_size,
      },
    };
  }

  let name_query = {};
  if (name && extension) {
    name_query = {
      AND: [
        { name: { contains: name, mode: 'insensitive' } },
        { name: { endsWith: extension, mode: 'insensitive' } },
      ],
    };
  } else if (name) {
    name_query = {
      name: {
        contains: name,
        mode: 'insensitive',
      },
    };
  } else if (extension) {
    name_query = {
      name: {
        endsWith: `.${extension}`,
        mode: 'insensitive',
      },
    };
  }

  return prisma.dataset_file.findMany({
    where: {
      dataset_id,
      ...name_query,
      ...(base_path ? { path: { startsWith: base_path } } : {}),
      ...(filetype ? { filetype } : {}),
      ...size_query,
    },
    skip,
    take,
  });
}

async function add_files({ dataset_id, data }) {
  const files = data.map((f) => ({
    dataset_id,
    name: path.parse(f.path).base,
    ...f,
  }));

  // create a file tree using graph data structure
  const graph = new FileGraph(files.map((f) => f.path));

  // query non leaf nodes (directories) from the graph data structure
  const directories = graph.non_leaf_nodes().map((p) => ({
    dataset_id,
    name: path.parse(p).base,
    path: p,
    filetype: 'directory',
  }));

  // create files and directory metadata
  await prisma.dataset_file.createMany({
    data: files.concat(directories),
    skipDuplicates: true,
  });

  // retrieve all files and directories for this dataset to get their ids
  const fileObjs = await prisma.dataset_file.findMany({
    where: {
      dataset_id,
    },
    select: {
      id: true,
      path: true,
    },
  });

  // create a map to lookup ids based on path
  const path_to_ids = fileObjs.reduce((acc, fileObj) => {
    acc[fileObj.path] = fileObj.id;
    return acc;
  }, {});

  // query edges / parent-child relationships from the graph data structure
  const edges = graph.edges().map(([src, dst]) => ({
    parent_id: path_to_ids[src],
    child_id: path_to_ids[dst],
  }));

  await prisma.dataset_file_hierarchy.createMany({
    data: edges,
    skipDuplicates: true,
  });
}

/**
 * Creates a new dataset if one with the same name and type does not already exist.
 *
 * Note: prisma.dataset.upsert is not used here because it cannot indicate whether the dataset was newly created.
 *
 * Using prisma.dataset.create alone would create the dataset if it doesn't exist, but would throw an error if it does.
 * This approach would also increment the sequence ID even if the dataset is not created,
 * leading to large gaps in the sequence when this function is called multiple times for existing datasets.
 *
 * The expected behavior is maintained even under concurrent transactions (default isolation level is read committed):
 * txA: findFirst -> no dataset
 * txB: findFirst -> no dataset
 * txA: create -> dataset created
 * txB: create -> unique constraint violation
 *
 * @param {Object} tx - Database client.
 * @param {Object} data - The data object containing details of the dataset to be created.
 * @return {Promise<Object|undefined>} Returns the created dataset object if successfully created, otherwise returns undefined if a dataset with the same name and type already exists.
 */
async function create(tx, data) {
  // find if a dataset with the same name and type already exists
  const existingDataset = await tx.dataset.findFirst({
    where: {
      name: data.name,
      type: data.type,
      is_deleted: false,
    },
    select: {
      id: true,
    },
  });
  if (existingDataset) {
    return;
  }
  // if it doesn't exist, create it
  // console.log(`creating dataset`, JSON.stringify(data, null, 2));
  try {
    return await tx.dataset.create({
      data,
    });
  } catch (e) {
    console.error('Error creating dataset:', e);
    throw e;
  }
}

const get_dataset_active_workflows = async ({ dataset } = {}) => {
  const datasetWorkflowIds = dataset.workflows.map((wf) => wf.id);
  const workflowQueryResponse = await workflowService.getAll({
    workflow_ids: datasetWorkflowIds,
    app_id: config.get('app_id'),
    status: 'ACTIVE',
  });
  return workflowQueryResponse.data.results;
};

const get_bundle_name = (dataset) => `${dataset.name}.${dataset.type}.tar`;

/**
 * Middleware to check if a user has access to a dataset.
 *
 * @function dataset_access_check
 * @async
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 * @throws {Error} Throws a Forbidden error if the user doesn't have access.
 * @description
 * This middleware function checks if the user has permission to access a dataset.
 * It first checks if the user has general 'read' permission for datasets based on their roles.
 * If not, it then checks if the user is associated with the dataset through a project.
 * If neither condition is met, it throws a Forbidden error.
 * The function assumes that req.params.id contains the dataset id and req.user contains user information.
 */
const dataset_access_check = asyncHandler(async (req, res, next) => {
  // assumes req.params.id is the dataset id user is requesting access check
  const permission = getPermission({
    resource: 'datasets',
    action: 'read',
    requester_roles: req?.user?.roles,
  });

  if (!permission.granted) {
    const user_dataset_assoc = await has_dataset_assoc({
      user_id: req.user.id,
      dataset_id: req.params.id,
    });
    if (!user_dataset_assoc) {
      return next(createError.Forbidden());
    }
  }

  next();
});

/**
 * Middleware to check if a user has access to initiate a workflow on a dataset.
 *
 * @description
 * This middleware checks if the user has the necessary permissions to initiate a workflow on a dataset.
 * There are three conditions to check:
 * - The first check determines if the user has the necessary permissions to
 * create a workflow.
 * - The second check determines if the requested workflow is in the list of workflows that the user's role is allowed
 * to initiate.
 *    - Role `admin` and `operator` are allowed to initiate any workflow.
 *    - Role `user` is allowed to initiate workflows `integrated`, `stage`, `process_dataset_upload`,
 *    and `cancel_dataset_upload`
 * - The third check determines if the user has the necessary permissions to initiate the requested
 * workflow on the requested dataset.
 *    - Role `admin` and `operator` are allowed to initiate any workflow on any dataset.
 *    - Role `user`:
 *      - is allowed to initiate workflows `integrated`, `process_dataset_upload` and `cancel_dataset_upload` if they
 *      created the dataset.
 *      - is allowed to initiate workflow `stage` if they are associated to the dataset via a project that they are a
 *      part of.
 */
const workflow_access_check = [
  // determine if the user has the necessary permissions to create a workflow
  accessControl('workflow')('create'),
  // determine if the requested workflow is in the list of workflows that the user's role is allowed to initiate
  (req, res, next) => {
    // allowed_wfs is an object with keys as workflow names and values as true
    // filter only works on objects not arrays, so we use an object with true
    // value
    const allowed_wfs = req.permission.filter({ [req.params.wf]: true });
    if (allowed_wfs[req.params.wf]) {
      return next();
    }
    // console.error(`Workflow ${req.params.wf} is not in the list of workflows allowed for this user.`);
    next(createError.Forbidden());
  },
  // determine if the user has the necessary permissions to initiate the requested workflow on the requested dataset
  asyncHandler(async (req, res, next) => {
    const requested_dataset_id = parseInt(req.params.id, 10);

    // At this point, it has been determined that the requester is allowed to create workflows.
    // The next step is to check if the user has access to create the requested workflow on
    // the requested dataset.
    let user_has_workflow_access = false;
    try {
      user_has_workflow_access = await has_workflow_access({
        workflow: req.params.wf,
        dataset_id: requested_dataset_id,
        user_id: req.user.id,
      });
    } catch (e) {
      logger.error('Error checking if user has workflow access:', e);
      return next(createError.InternalServerError());
    }

    return user_has_workflow_access ? next() : next(createError.Forbidden());
  }),
];

module.exports = {
  soft_delete,
  get_dataset,
  create_workflow,
  create_filetree,
  files_ls,
  search_files,
  add_files,
  create,
  get_bundle_name,
  get_dataset_active_workflows,
  get_dataset_creator,
  has_dataset_assoc,
  has_workflow_access,
  dataset_access_check,
  workflow_access_check,
};
