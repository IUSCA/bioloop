const assert = require('assert');
const path = require('node:path');
const { Prisma } = require('@prisma/client');

const config = require('config');
// const _ = require('lodash/fp');
const createError = require('http-errors');

const _ = require('lodash/fp');
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

/**
 * Normalizes the name of a dataset to be compatible with the system.
 * @param name - The provided dataset name.
 * @returns {string} The normalized dataset name.
 */
function normalize_name(name) {
  // replace all character other than a-z, 0-9, _ and - with -
  // replace consecutive hyphens with one -

  return (name || '')
    .replaceAll(/[\W]/g, '-')
    .replaceAll(/-+/g, '-');
}

/**
 * Generates the absolute path where a dataset will be uploaded to.
 *
 * @function getUploadedDatasetPath
 * @param {Object} params - The parameters object.
 * @param {number|null} [params.datasetId=null] - The ID of the dataset to be uploaded.
 * @param {string|null} [params.datasetType=null] - The type of the dataset to be uploaded.
 * @returns {string} The absolute path where the uploaded dataset should be stored.
 */
const getUploadedDatasetPath = ({ datasetId = null, datasetType = null } = {}) => path.join(
  config.upload.path,
  datasetType.toLowerCase(),
  `${datasetId}`,
  'processed',
);

// /**
//  * Deep merges an override object into a target object.
//  *
//  * @function deepMerge
//  * @param {Object} target - The target object to merge into.
//  * @param {Object} override - The override object to merge from.
//  * @returns {Object} The merged object.
//  */
// function deepMerge(target, override) {
//   const result = { ...target };

//   Object.keys(override).forEach((key) => {
//     if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
//       result[key] = deepMerge(target[key] || {}, override[key]);
//     } else {
//       result[key] = override[key];
//     }
//   });

//   return result;
// }

/**
 * Applies overrides to workflow steps based on step name matching.
 *
 * @function applyStepOverrides
 * @param {Array} steps - The original workflow steps.
 * @param {Object} stepOverrides - The step overrides keyed by step name.
 * @returns {Array} The modified workflow steps.
 */
function applyStepOverrides(steps, stepOverrides) {
  console.log('applyStepOverrides, steps');
  console.dir(steps, { depth: null });
  console.log('applyStepOverrides, stepOverrides');
  console.dir(stepOverrides, { depth: null });
  console.log('applyStepOverrides, steps.map');
  return steps.map((step) => {
    const override = stepOverrides.find((o) => o.task === step.task);
    
    console.log('applyStepOverrides, step');
    console.dir(step, { depth: null });
    console.log('applyStepOverrides, override');
    console.dir(override, { depth: null });
    if (override) {
      console.log('applyStepOverrides, override found');
      console.dir(override, { depth: null });
      return _.merge(step, override);
    }
    console.log('applyStepOverrides, override not found');
    console.dir(override, { depth: null });
    return step;
  });
}

/**
 * Retrieves and prepares the workflow body for a given workflow name.
 *
 * @function get_wf_body
 * @param {string} wf_name - The name of the workflow for which the workflow body is to be constructed.
 * @param {Object} [overrides] - Optional workflow configuration overrides.
 * @throws {AssertionError} Throws an error if the workflow is not registered in the configuration.
 * @returns {Object} The constructed workflow body for the requested workflow.
 */
function get_wf_body(wf_name, overrides = null) {
  assert(config.workflow_registry.has(wf_name), `${wf_name} workflow is not registered`);

  // create a deep copy of the config object because it is immutable
  const wf_body = { ...config.workflow_registry[wf_name] };

  wf_body.name = wf_name;
  wf_body.app_id = config.app_id;
  wf_body.steps = wf_body.steps.map((step) => ({
    ...step,
    queue: step.queue || `${config.app_id}.q`,
  }));

  console.log('get_wf_body, wf_body before overrides');
  console.dir(wf_body, { depth: null });

  console.log('get_wf_body, overrides', overrides);

  // Apply runtime overrides if provided
  if (overrides) {
    console.log('get_wf_body, overrides apply');
    // Apply step-specific overrides
    if (overrides.steps) {
      wf_body.steps = applyStepOverrides(wf_body.steps, overrides.steps);
    }

    // // Apply any other top-level overrides (excluding steps to avoid conflicts)
    // const { steps: _excludeSteps, ...otherOverrides } = overrides;
    // wf_body = deepMerge(wf_body, otherOverrides);
    // console.log('wf_body after overrides');
    // console.dir(wf_body, { depth: null });
  }

  console.log('get_wf_body, wf_body after overrides');
  console.dir(wf_body, { depth: null });

  return wf_body;
}

/**
 * Creates a new workflow for a dataset.
 *
 * @async
 * @function create_workflow
 * @param {Object} dataset - The dataset object for which the workflow is being created.
 * @param {string} wf_name - The name of the workflow to be created.
 * @param {number} initiator_id - The ID of the user initiating the workflow.
 * @param {Object} [overrides] - Optional workflow configuration overrides.
 * @throws {AssertionError} Throws an error if a workflow with the same name is already running or pending for the dataset.
 * @returns {Promise<Object>} The created workflow object.
 *
 * @description
 * This function performs the following steps:
 * 1. Retrieves the workflow body for the provided workflow name.
 * 2. Applies any runtime overrides to the workflow configuration.
 * 3. Checks if there's already an active workflow with the same name for the given dataset.
 * 4. If no active workflow exists, it creates a new workflow using the workflow service.
 * 5. Associates the newly created workflow with the dataset in the database.
 * 6. Returns the created workflow object.
 */
async function create_workflow(dataset, wf_name, initiator_id, overrides = null) {
  console.log('create_workflow, overrides', overrides);

  const wf_body = get_wf_body(wf_name, overrides);

  // check if a workflow with the same name is not already running / pending on
  // this dataset
  const active_wfs_with_same_name = dataset.workflows
    .filter((_wf) => _wf.name === wf_body.name)
    .filter((_wf) => !DONE_STATUSES.includes(_wf.status));

  assert(active_wfs_with_same_name.length === 0, 'A workflow with the same name is either pending / running');

  console.log('create_workflow, wf_body');
  console.dir(wf_body, { depth: null });

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

/**
 * Soft-deletes a dataset or initiates a delete-archive workflow.
 *
 * @async
 * @function soft_delete
 * @param {Object} dataset - The dataset object to be deleted.
 * @param {number} user_id - The ID of the user initiating the delete action.
 * @returns {Promise<void>}
 * @description
 * If the dataset has an archive_path, it starts a delete-archive workflow.
 * If the dataset is not archived, it marks the dataset as deleted in the database.
 * In both cases, it creates an audit log entry for the delete action.
 */
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

/**
 * Retrieves a dataset with specified details and related information.
 *
 * @async
 * @function get_dataset
 * @param {Object} params - The parameters object.
 * @param {number} params.id - The ID of the dataset to retrieve.
 * @param {boolean} [params.files=false] - Whether to include information about files associated with this dataset.
 * @param {boolean} [params.workflows=false] - Whether to include information about workflows associated with this dataset.
 * @param {boolean} [params.last_task_run=false] - Whether to include the last task run information for workflows associated with this dataset.
 * @param {boolean} [params.prev_task_runs=false] - Whether to include previous task runs information for workflows associated with this dataset.
 * @param {boolean} [params.only_active=false] - Whether to include only active workflows associated with this dataset.
 * @param {boolean} [params.bundle=false] - Whether to include bundle information for this dataset.
 * @param {boolean} [params.includeProjects=false] - Whether to include projects associated with this dataset.
 * @param {boolean} [params.initiator=false] - Whether to include the initiators of the workflows associated with this dataset.
 * @param {boolean} [params.include_source_instrument=false] - Whether to include source instrument where this dataset was collected from.
 * @returns {Promise<Object>} The dataset object with requested details and related information.
 * @throws {Error} If the dataset is not found or if there's an error retrieving workflow information.
 */
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
    if (log.user) {
      log.user = log.user ? userService.transformUser(log.user) : null;
    }
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

/**
 * Creates a file tree structure from a list of files.
 *
 * @function create_filetree
 * @param {Array} files - An array of file objects.
 * @returns {Object} A tree structure representing the file hierarchy.
 */
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
 * Checks if a user has an association with a dataset.
 *
 * @async
 * @function has_dataset_assoc
 * @param {Object} params - The parameters object.
 * @param {number} params.dataset_id - The ID of the dataset.
 * @param {number} params.user_id - The ID of the user.
 * @returns {Promise<boolean>} True if the user is associated with the dataset, false otherwise.
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
 * 1. Users with `admin` or `operator` roles are always allowed to initiate any workflows.
 * 2. Users with 'user' role:
 *     - For `integrated`, `process_dataset_upload`, or `cancel_dataset_upload` workflows:
 *       - They are allowed to proceed only if they created the dataset.
 *     - For other allowed workflows (like `stage`):
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

/**
 * Lists files in a dataset directory.
 *
 * @async
 * @function files_ls
 * @param {Object} params - The parameters object.
 * @param {number} params.dataset_id - The ID of the dataset.
 * @param {string} [params.base=''] - The base path to list files from.
 * @returns {Promise<Array>} An array of file objects.
 */
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

/**
 * Searches for files in a dataset based on various criteria.
 *
 * @async
 * @function search_files
 * @param {Object} params - The parameters object.
 * @param {number} params.dataset_id - The ID of the dataset.
 * @param {string} [params.name=''] - The name to search for.
 * @param {string} [params.base=''] - The base path to search from.
 * @param {number} params.skip - The number of items to skip.
 * @param {number} params.take - The number of items to take.
 * @param {string} [params.extension] - The file extension to filter by.
 * @param {string} [params.filetype] - The file type to filter by.
 * @param {number} [params.min_file_size] - The minimum file size to filter by.
 * @param {number} [params.max_file_size] - The maximum file size to filter by.
 * @returns {Promise<Array>} An array of matching file objects.
 */
async function search_files({
  dataset_id, name = '', base = '',
  skip, take,
  extension = null, filetype = null, min_file_size = null, max_file_size = null,
  sort_order = null, sort_by = null,
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

  let orderBy = {};
  if (sort_order && sort_by) {
    orderBy = {
      [sort_by]: {
        sort: sort_order,
        nulls: 'last',
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
    orderBy,
  });
}

/**
 * Adds files to a dataset.
 *
 * @async
 * @function add_files
 * @param {Object} params - The parameters object.
 * @param {number} params.dataset_id - The ID of the dataset.
 * @param {Array} params.data - An array of file objects to add.
 */
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

/**
 * Retrieves active workflows for a given dataset.
 *
 * @async
 * @function get_dataset_active_workflows
 * @param {Object} params - The parameters object.
 * @param {Object} params.dataset - The dataset object for which workflows are to be retrieved.
 * @returns {Promise<Array>} A promise that resolves to an array of active workflow objects.
 *
 * @example
 * const dataset = { workflows: [{ id: 'wf1' }, { id: 'wf2' }] };
 * const activeWorkflows = await get_dataset_active_workflows({ dataset });
 */
const get_dataset_active_workflows = async ({ dataset } = {}) => {
  const datasetWorkflowIds = dataset.workflows.map((wf) => wf.id);
  const workflowQueryResponse = await workflowService.getAll({
    workflow_ids: datasetWorkflowIds,
    app_id: config.get('app_id'),
    status: 'ACTIVE',
  });
  return workflowQueryResponse.data.results;
};

/**
 * Gets the bundle name for a staged dataset.
 *
 * @function get_bundle_name
 * @param {Object} dataset - The dataset which has been or will be staged.
 * @returns {string} The name of the bundle which contains the staged dataset.
 */
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

/**
 * Builds a query object for fetching datasets based on various criteria.
 *
 * @function buildDatasetsFetchQuery
 * @param {Object} params - The parameters for building the query.
 * @param {boolean} [params.deleted] - Whether to include deleted datasets.
 * @param {boolean} [params.archived] - Whether to include archived datasets.
 * @param {boolean} [params.staged] - Whether to include staged datasets.
 * @param {string} [params.type] - The type of datasets to fetch.
 * @param {string} [params.name] - The name (or part of the name) of datasets to fetch.
 * @param {number} [params.days_since_last_staged] - Number of days since the dataset was last staged.
 * @param {boolean} [params.has_workflows] - Whether to include datasets with workflows.
 * @param {boolean} [params.has_derived_data] - Whether to include datasets with derived data.
 * @param {boolean} [params.has_source_data] - Whether to include datasets with source data.
 * @param {string} [params.created_at_start] - Start date for dataset creation time range.
 * @param {string} [params.created_at_end] - End date for dataset creation time range.
 * @param {string} [params.updated_at_start] - Start date for dataset update time range.
 * @param {string} [params.updated_at_end] - End date for dataset update time range.
 * @param {boolean} [params.match_name_exact] - Whether to match the dataset name exactly.
 * @param {number} [params.id] - The ID of the requested dataset
 * @param {string} [params.username] - The username to filter datasets by user's projects.
 * @returns {Object} A query object for use with Prisma ORM.
 */
const buildDatasetsFetchQuery = ({
  deleted,
  archived,
  staged,
  type,
  name,
  days_since_last_staged,
  has_workflows,
  has_derived_data,
  has_source_data,
  created_at_start,
  created_at_end,
  updated_at_start,
  updated_at_end,
  match_name_exact,
  id,
  username,
}) => {
  const query_obj = _.omitBy(_.isUndefined)({
    is_deleted: deleted,
    is_staged: staged,
    type,
    name: name ? {
      ...(match_name_exact ? { equals: name } : { contains: name }),
      mode: 'insensitive', // case-insensitive search
    } : undefined,
  });

  // has_workflows=true: datasets with one or more workflows associated
  // has_workflows=false: datasets with no workflows associated
  // has_workflows=undefined/null: no query based on workflow association
  if (!_.isNil(has_workflows)) {
    query_obj.workflows = { [has_workflows ? 'some' : 'none']: {} };
  }

  if (!_.isNil(has_derived_data)) {
    query_obj.derived_datasets = { [has_derived_data ? 'some' : 'none']: {} };
  }

  if (!_.isNil(has_source_data)) {
    query_obj.source_datasets = { [has_source_data ? 'some' : 'none']: {} };
  }

  if (!_.isNil(archived)) {
    query_obj.archive_path = archived ? { not: null } : null;
  }

  // staged datasets where there is no STAGED state in last x days
  if (_.isNumber(days_since_last_staged)) {
    const xDaysAgo = new Date();
    xDaysAgo.setDate(xDaysAgo.getDate() - days_since_last_staged);

    query_obj.is_staged = true;
    query_obj.NOT = {
      states: {
        some: {
          state: 'STAGED',
          timestamp: {
            gte: xDaysAgo,
          },
        },
      },
    };
  }

  // created_at filter
  if (created_at_start && created_at_end) {
    query_obj.created_at = {
      gte: new Date(created_at_start),
      lte: new Date(created_at_end),
    };
  }

  // updated_at filter
  if (updated_at_start && updated_at_end) {
    query_obj.updated_at = {
      gte: new Date(updated_at_start),
      lte: new Date(updated_at_end),
    };
  }

  // id filter
  if (id) {
    // if id is an array, use 'in' operator
    if (Array.isArray(id)) {
      query_obj.id = { in: id };
    } else {
      query_obj.id = id;
    }
  }

  // Filter by projects assigned to this user if username is provided
  if (username) {
    query_obj.projects = {
      some: {
        project: {
          users: {
            some: {
              user: {
                username,
              },
            },
          },
        },
      },
    };
  }

  return query_obj;
};

/**
 * Generates a Prisma query object for creating a new dataset.
 *
 * @function buildDatasetCreateQuery
 * @param {Object} data - The data for creating the dataset.
 * @param {string} data.name - The name of the dataset.
 * @param {string} data.type - The type of the dataset.
 * @param {BigInt} [data.du_size] - The disk usage size of the dataset.
 * @param {BigInt} [data.size] - The size of the dataset.
 * @param {string} data.origin_path - The origin path of the dataset.
 * @param {BigInt} [data.bundle_size] - The size of the dataset bundle.
 * @param {string} [data.workflow_id] - The ID of the associated workflow.
 * @param {string} [data.project_id] - The ID of the associated project.
 * @param {string} data.user_id - The ID of the user creating the dataset.
 * @param {string} [data.src_instrument_id] - The ID of the source instrument.
 * @param {string} [data.src_dataset_id] - The ID of the source dataset.
 * @param {string} [data.state='REGISTERED'] - The initial state of the dataset.
 * @param {string} [data.create_method=CONSTANTS.DATASET_CREATE_METHODS.SCAN] - The method used to create the dataset.
 * @param {Object} [data.metadata] - Additional metadata for the dataset.
 * @returns {Object} An object containing the query for creating a new dataset in the database.
 *
 * @description
 * This function prepares a query object for creating a new dataset in the database.
 * It normalizes the dataset name, sets up associations with workflows and projects,
 * connects to source instruments and datasets, sets the initial state,
 * and creates an audit log entry for the dataset creation.
 */
const buildDatasetCreateQuery = (data) => {
  /* eslint-disable no-unused-vars */
  const {
    name, type, du_size, size, origin_path, bundle_size, metadata, workflow_id,
    project_id, user_id, src_instrument_id, src_dataset_id, state, create_method,
  } = data;
  /* eslint-disable no-unused-vars */

  // gather non-null data to create a new dataset
  const create_query = _.flow([
    _.pick(['name', 'type', 'origin_path', 'du_size', 'size', 'bundle_size', 'metadata']),
    _.omitBy(_.isNil),
  ])(data);

  create_query.name = normalize_name(create_query.name); // normalize name

  // create workflow association
  if (workflow_id) {
    create_query.workflows = {
      create: [
        {
          id: workflow_id,
        },
      ],
    };
  }

  if (project_id) {
    create_query.projects = {
      create: [{
        project_id,
        assignor_id: user_id ?? Prisma.skip,
      }],
    };
  }

  if (src_instrument_id) {
    create_query.src_instrument = {
      connect: {
        id: src_instrument_id,
      },
    };
  }

  if (src_dataset_id) {
    create_query.source_datasets = {
      create: [{
        source_id: src_dataset_id,
      }],
    };
  }

  // add a state
  create_query.states = {
    create: [
      {
        state: state || 'REGISTERED',
      },
    ],
  };

  create_query.audit_logs = {
    create: [
      {
        action: 'create',
        create_method: create_method || CONSTANTS.DATASET_CREATE_METHODS.SCAN,
        user_id: user_id ?? Prisma.skip,
      },
    ],
  };

  return create_query;
};

/**
 * Initiates a workflow which either processes or cancels a dataset upload.
 *
 * @async
 * @function initiateUploadWorkflow
 * @param {Object} options - The options object.
 * @param {Object} options.dataset - The dataset to initiate the workflow on.
 * @param {string} options.requestedWorkflow - The name of the workflow to initiate.
 * @param {Object} options.user - The user initiating the workflow.
 * @returns {Promise<Object>} An object containing the initiated workflow and any error messages.
 * @property {Object|null} workflowInitiated - The initiated workflow object, or null if not initiated.
 * @property {string|null} workflowInitiationError - Error message if workflow initiation failed, or null if successful.
 *
 * @description
 * This function attempts to initiate either the 'process_dataset_upload' or the 'cancel_dataset_upload' workflow
 * on a given dataset.
 *
 * `process_dataset_upload` -> This workflow initiates the processing of a dataset upload,
 * which registers the dataset in the system. This workflow is triggered after the entirety of the dataset's contents
 * have been uploaded.
 *
 * `cancel_dataset_upload`  -> This workflow cancels an incomplete dataset upload.
 *  A dataset upload is considered incomplete if one of the following conditions is met:
 * - All files have not been uploaded
 * - All files have been uploaded but the `process_dataset_upload` has not been initiated.
 *
 * It is possible that the API may receive requests to initiate both of these workflows on the same dataset in
 * proximity, thus triggering both of these workflows in parallel, which would result in a conflict.
 * To avoid this:
 * - Workflow `process_dataset_upload` should not be initiated if workflow `cancel_dataset_upload` is
 * already in progress.
 * - Workflow `cancel_dataset_upload` should not be initiated if workflow `process_dataset_upload` is already
 * in progress.
 *
 * This function checks for a potential conflicting workflow that may already be in progress before initiating
 * the requested workflow. If a conflicting workflow is found, the function will not initiate the requested workflow
 * and will return an error message instead.
 */
const initiateUploadWorkflow = async ({ dataset = null, requestedWorkflow = null, user = null } = {}) => {
  // return {
  //   workflowInitiated: true,
  //   workflowInitiationError: null,
  // };

  logger.info(`Received request to initiate workflow ${requestedWorkflow} on dataset ${dataset.id}`);

  const uploadedDataset = dataset;
  uploadedDataset.workflows = await get_dataset_active_workflows({ dataset });

  let requestedWorkflowInitiated;
  let workflowInitiationError;

  const conflictingUploadWorkflow = requestedWorkflow === CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD
    ? CONSTANTS.WORKFLOWS.CANCEL_DATASET_UPLOAD
    : CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD;
  logger.info(`Workflow ${requestedWorkflow} will not be started if conflicting workflow `
      + `${conflictingUploadWorkflow} is running on dataset ${dataset.id}`);
  logger.info(`Checking if conflicting workflow ${conflictingUploadWorkflow} is running on dataset ${dataset.id}`);
  const foundConflictingUploadWorkflow = uploadedDataset.workflows.find(
    (wf) => wf.name === conflictingUploadWorkflow,
  );
  if (!foundConflictingUploadWorkflow) {
    logger.info(`Conflicting workflow ${conflictingUploadWorkflow} is not running on dataset ${dataset.id}`);
    logger.info(`Starting workflow ${requestedWorkflow} on dataset ${dataset.id}`);
    requestedWorkflowInitiated = await create_workflow(
      uploadedDataset,
      requestedWorkflow,
      user.id,
    );
  } else {
    workflowInitiationError = `The workflow ${requestedWorkflow} cannot be started on dataset ${dataset.id} `
        + `because conflicting workflow ${foundConflictingUploadWorkflow.id}) is `
        + 'already in progress.';
    logger.error(workflowInitiationError);
  }

  return { workflowInitiated: requestedWorkflowInitiated, workflowInitiationError };
};

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
  getUploadedDatasetPath,
  buildDatasetCreateQuery,
  buildDatasetsFetchQuery,
  normalize_name,
  initiateUploadWorkflow,
};
