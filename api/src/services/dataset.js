const assert = require('assert');
const path = require('node:path');

const { PrismaClient } = require('@prisma/client');
const config = require('config');
// const _ = require('lodash/fp');

const createError = require('http-errors');
const wfService = require('./workflow');
const userService = require('./user');
const { log_axios_error } = require('../utils');
const FileGraph = require('./fileGraph');

const prisma = new PrismaClient();

const INCLUDE_DUPLICATIONS = {
  duplicated_from: {
    include: {
      duplicate_dataset: {
        include: {
          action_items: true,
        },
      },
      original_dataset: true,
    },
  },
  duplicated_by: {
    include: {
      duplicate_dataset: {
        include: {
          action_items: true,
        },
      },
      original_dataset: true,
    },
  },
};

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

const INCLUDE_FILES = {
  files: {
    select: {
      path: true,
      md5: true,
      name: true,
    },
    where: {
      NOT: {
        filetype: 'directory',
      },
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

async function create_workflow(dataset, wf_name) {
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
    },
  });

  return wf;
}

async function soft_delete(dataset, user_id) {
  if (dataset.archive_path) {
    // if archived, starts a delete archive workflow which will
    // mark the dataset as deleted on success.
    await create_workflow(dataset, 'delete');
  } else {
    // if not archived, mark the dataset as deleted
    await prisma.dataset.update({
      data: {
        is_deleted: true,
        name: `${dataset.name}-${dataset.id}`,
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
  include_duplications = false,
  include_action_items = false,
}) {
  const dataset = await prisma.dataset.findFirstOrThrow({
    where: { id },
    include: {
      ...(files && INCLUDE_FILES),
      ...INCLUDE_WORKFLOWS,
      ...INCLUDE_AUDIT_LOGS,
      ...INCLUDE_STATES,
      bundle,
      source_datasets: true,
      derived_datasets: true,
      ...(include_duplications && INCLUDE_DUPLICATIONS),
      action_items: include_action_items ? {
        where: {
          active: true,
        },
      } : undefined,
    },
  });

  if (workflows && dataset.workflows.length > 0) {
    // include workflow objects with dataset
    try {
      const wf_res = await wfService.getAll({
        only_active,
        last_task_run,
        prev_task_runs,
        workflow_ids: dataset.workflows.map((x) => x.id),
      });
      dataset.workflows = wf_res.data.results;
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
    const { path: relpath, ...rest } = file;
    const pathObject = path.parse(relpath);
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
    // console.log(pathObject);
    parent_dir.children[pathObject.base] = {
      metadata: { ...rest },
    };
  });

  return root;
}

async function has_dataset_assoc({
  dataset_id, username,
}) {
  const projects = await prisma.project.findMany({
    where: {
      users: {
        some: {
          user: {
            username,
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

  // create a file tree using graph datastructure
  const graph = new FileGraph(files.map((f) => f.path));

  // query non leaf nodes (directories) from the graph datastrucure
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

  // retrive all files and directories for this dataset to get their ids
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

  // query edges / parent-child relationships from the graph datastructure
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
 * Returns the highest version for datasets that match a given criteria.
 * @param dataset_name
 * @param dataset_type
 * @param is_deleted
 * @param is_duplicate
 * @returns {Promise<number|number>}
 */
async function get_dataset_latest_version({
  dataset_name, dataset_type, is_deleted, is_duplicate,
}) {
  const matching_datasets = await prisma.dataset.findMany({
    where: {
      name: dataset_name,
      type: dataset_type,
      is_deleted,
      is_duplicate,
    },
    orderBy: {
      version: 'desc',
    },
  });
  return matching_datasets.length > 0
    ? matching_datasets[0].version
    : 0;
}

async function validate_duplication_state(duplicate_dataset_id) {
  const duplicate_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: {
      duplicated_from: true,
      states: {
        orderBy: {
          timestamp: 'desc',
        },
      },
    },
  });

  if (!duplicate_dataset.is_duplicate) {
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be a duplicate, but it is not.`);
  }

  const matching_original_datasets = await prisma.dataset.findMany({
    where: {
      name: duplicate_dataset.name,
      type: duplicate_dataset.type,
      is_deleted: false,
      is_duplicate: false,
    },
  });

  console.log('matchingDatsets:');
  console.dir(matching_original_datasets, { depth: null });

  // Do a sanity check to ensure that there is exactly one matching original
  // dataset of this type before replacing it with the incoming duplicate
  // dataset. If not, the system is in an invalid state and should not
  // proceed.
  if (matching_original_datasets.length !== 1) {
    throw new Error(`Expected to find one active (not deleted) original ${duplicate_dataset.type} named ${duplicate_dataset.name}, but found ${matching_original_datasets.length}.`);
  }

  // Ensure that the matching original dataset's id is the same as the
  // `original_dataset_id` to linked to the duplicate dataset. If not, the
  // system is in an invalid state and should not proceed.
  if (duplicate_dataset.duplicated_from.original_dataset_id !== matching_original_datasets[0].id) {
    throw new Error(`Expected original dataset to have id
       ${duplicate_dataset.duplicated_from.original_dataset_id}, but matching original
        dataset has id ${matching_original_datasets[0].id}.`);
  }

  const original_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset.duplicated_from.original_dataset_id,
    },
  });

  console.log('validate_duplication_state: duplicate_dataset:');
  console.dir(duplicate_dataset, { depth: null });

  return { original_dataset, duplicate_dataset };
}

/**
 * Can be used to perform sanity checks regarding the states of the duplicate
 * dataset and the dataset that it was duplicated from,
 * before accepting or rejecting the duplicate dataset.
 *
 * Returns an object containing the original and the duplicate datasets, if they
 * are in their expected states. Throws errors otherwise.
 * @param {Number} duplicate_dataset_id The duplicate dataset which is to be accepted
 * into the system.
 * @returns Object
 */
async function validate_state_before_original_dataset_resource_purge(duplicate_dataset_id) {
  const returned = await validate_duplication_state(duplicate_dataset_id);

  console.log('returned:');
  console.dir(returned, { depth: null });

  const { original_dataset, duplicate_dataset } = returned;

  console.log('duplicate_dataset:');
  console.dir(duplicate_dataset, { depth: null });

  console.log('original_dataset:');
  console.dir(original_dataset, { depth: null });

  // throw error if this dataset is not ready for acceptance or rejection yet,
  // or if it is not already undergoing accetance.
  // (i.e. the duplicate comparison process is still running)
  const latestState = duplicate_dataset.states[0].state;
  if (latestState !== 'DUPLICATE_READY'
      && latestState !== 'DUPLICATE_ACCEPTANCE_IN_PROGRESS') {
    // eslint-disable-next-line no-useless-concat
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_READY or DUPLICATE_ACCEPTANCE_IN_PROGRESS, but current state is '
        + `${latestState}.`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

async function validate_state_after_original_dataset_resource_purge(duplicate_dataset_id) {
  const duplicate_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: {
      duplicated_from: true,
      states: {
        orderBy: {
          timestamp: 'desc',
        },
      },
    },
  });

  // (i.e. the duplicate comparison process is still running)
  const duplicate_dataset_latest_state = duplicate_dataset.states[0].state;

  if (duplicate_dataset_latest_state !== 'DUPLICATE_ACCEPTANCE_IN_PROGRESS' && duplicate_dataset_latest_state !== 'DUPLICATE_ACCEPTED') {
    throw new Error(`Expected duplicate dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_ACCEPTANCE_IN_PROGRESS or DUPLICATE_ACCEPTED, but current state '
        + `is ${duplicate_dataset_latest_state}.`);
  }

  const original_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset.duplicated_from.original_dataset_id,
    },
    include: {
      states: {
        orderBy: {
          timestamp: 'desc',
        },
      },
    },
  });

  const original_dataset_latest_state = original_dataset.states[0].state;
  if (original_dataset_latest_state !== 'RESOURCES_PURGED' && original_dataset_latest_state !== 'OVERWRITTEN') {
    throw new Error(`Expected original dataset ${original_dataset.id} to be in one of states `
        + `RESOURCES_PURGED, but current state is ${original_dataset_latest_state}`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

async function validate_state_before_rejected_dataset_resource_purge(duplicate_dataset_id) {
  const {
    duplicate_dataset,
    original_dataset,
  } = await validate_duplication_state(duplicate_dataset_id);

  // throw error if this dataset is not ready for acceptance or rejection yet,
  // or if it is not already undergoing accetance.
  // (i.e. the duplicate comparison process is still running)
  const latest_state = duplicate_dataset.states[0].state;
  if (latest_state !== 'DUPLICATE_READY'
      && latest_state !== 'DUPLICATE_REJECTION_IN_PROGRESS') {
    // eslint-disable-next-line no-useless-concat
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_READY or DUPLICATE_REJECTION_IN_PROGRESS, but current state is '
        + `${latest_state}.`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

async function validate_state_after_rejected_dataset_resource_purge(duplicate_dataset_id) {
  const {
    duplicate_dataset,
    original_dataset,
  } = await validate_duplication_state(duplicate_dataset_id);

  // throw error if this dataset is not ready for acceptance or rejection yet,
  // or if it is not already undergoing accetance.
  // (i.e. the duplicate comparison process is still running)
  const latest_state = duplicate_dataset.states[0].state;
  if (latest_state !== 'RESOURCES_PURGED'
      && latest_state !== 'DUPLICATE_REJECTION_IN_PROGRESS') {
    // eslint-disable-next-line no-useless-concat
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_READY or DUPLICATE_REJECTION_IN_PROGRESS, but current state is '
        + `${latest_state}.`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

/**
 * Initiates the replacement of a dataset by its incoming duplicate,
 * by performing the database write operations needed to overwrite an existing
 * dataset with its duplicate.
 *
 * The following write operations are performed:
 *
 * Returns the dataset that was previously a duplicate and has now replaced
 * the dataset that it was duplicated from. Upon successful execution,
 * both datasets are left in a state of DUPLICATE_ACCEPTANCE_IN_PROGRESS,
 * and their action items are locked. This is done because these the process of
 * overwriting a dataset with a duplicate also involves cleaning filesystem
 * resources, which is an async process. Once the resources have been cleaned
 * up, another API call updates the state of the dataset and their
 * corresponding action items. This is the point when the replacement of the
 * original dataset with its incoming duplicate is considered complete.
 *
 * This method is expected to be idempotent (the resultant end state
 * should be the same every time this method is called).
 *
 * @param {Number} duplicate_dataset_id - The duplicate dataset to be accepted.
 * @param {Number} accepted_by_id - id of the user who is accepting the duplicate dataset.
 */
async function initiate_duplicate_acceptance({ duplicate_dataset_id, accepted_by_id }) {
  const {
    original_dataset,
    duplicate_dataset,
  } = await
  validate_state_before_original_dataset_resource_purge(duplicate_dataset_id);

  // write queries to be run in a single transaction, before a workflow is
  // launched to handle the acceptance/rejection on the worker-end.
  const update_queries = [];

  // accept the duplicate dataset
  update_queries.push(prisma.dataset.update({
    where: {
      id: duplicate_dataset.id,
    },
    data: {
      action_items: {
        updateMany: {
          where: {
            // updateMany works here because exactly one
            // action item of type DUPLICATE_DATASET_INGESTION is created for a
            // dataset when it is duplicated from another.
            type: 'DUPLICATE_DATASET_INGESTION',
            active: true,
          },
          data: {
            status: 'ACKNOWLEDGED',
          },
        },
      },
    },
    include: {
      duplicated_from: true,
    },
  }));
  // if an audit log hasn't been created for the acceptance of the incoming
  // duplicate, create one.
  const acceptance_audit_logs = await prisma.dataset_audit.findMany({
    where: {
      action: 'duplicate_acceptance_initiated',
      user_id: accepted_by_id,
      dataset_id: duplicate_dataset.id,
    },
  });
  if (acceptance_audit_logs.length < 1) {
    update_queries.push(prisma.dataset_audit.create({
      data: {
        action: 'duplicate_acceptance_initiated',
        user: {
          connect: {
            id: accepted_by_id,
          },
        },
        dataset: {
          connect: {
            id: duplicate_dataset.id,
          },
        },
      },
    }));
  }
  // if a state update record hasn't been created for the acceptance of the
  // incoming duplicate, create one.
  const acceptance_state_logs = await prisma.dataset_state.findMany({
    where: {
      state: 'DUPLICATE_ACCEPTANCE_IN_PROGRESS',
      dataset_id: duplicate_dataset.id,
    },
  });
  if (acceptance_state_logs.length < 1) {
    update_queries.push(prisma.dataset_state.create({
      data: {
        state: 'DUPLICATE_ACCEPTANCE_IN_PROGRESS',
        dataset: {
          connect: {
            id: duplicate_dataset.id,
          },
        },
      },
    }));
  }

  // if an audit log hasn't been created for the original dataset being
  // overwritten , create one.
  const overwrite_audit_logs = await prisma.dataset_audit.findMany({
    where: {
      action: 'overwrite_initiated',
      user_id: accepted_by_id,
      dataset_id: original_dataset.id,
    },
  });
  if (overwrite_audit_logs.length < 1) {
    update_queries.push(prisma.dataset_audit.create({
      data: {
        action: 'overwrite_initiated',
        user: {
          connect: {
            id: accepted_by_id,
          },
        },
        dataset: {
          connect: {
            id: original_dataset.id,
          },
        },
      },
    }));
  }
  // if a state update record hasn't been created for the overwrite of the
  // original dataset, create one.
  const overwrite_state_logs = await prisma.dataset_state.findMany({
    where: {
      state: 'OVERWRITE_IN_PROGRESS',
      dataset_id: original_dataset.id,
    },
  });
  if (overwrite_state_logs.length < 1) {
    update_queries.push(prisma.dataset_state.create({
      data: {
        state: 'OVERWRITE_IN_PROGRESS',
        dataset: {
          connect: {
            id: original_dataset.id,
          },
        },
      },
    }));
  }

  // 4. Finally, the duplicates that will be rejected will need their
  // `is_deleted` and `version` updated. For this, first, find the max version
  // of previously-rejected duplicates having this name

  const latest_rejected_duplicate_version = await get_dataset_latest_version({
    dataset_name: duplicate_dataset.name,
    dataset_type: duplicate_dataset.type,
    is_deleted: true,
    is_duplicate: true,
  });

  // Check if other duplicates having this name and type are active in the
  // system. These will be rejected.
  const other_duplicates = await prisma.dataset.findMany({
    where: {
      name: duplicate_dataset.name,
      type: duplicate_dataset.type,
      is_deleted: false,
      is_duplicate: true,
      NOT: { id: duplicate_dataset_id },
    },
  });
  // For the duplicates that are about to be rejected:
  // 1. lock the action items associated with them.
  // 2. create audit logs to indicate that these datasets were
  // rejected.
  let i = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const d of other_duplicates) {
    i += 1;
    // eslint-disable-next-line no-await-in-loop
    const current_duplicate = await prisma.dataset.findUnique({
      where: {
        id: d.id,
      },
      include: {
        states: {
          orderBy: {
            timestamp: 'desc',
          },
        },
      },
    });

    // eslint-disable-next-line no-await-in-loop
    const rejection_audit_logs = await prisma.dataset_audit.findMany({
      where: {
        action: 'duplicate_rejected',
        user_id: accepted_by_id,
        dataset_id: d.id,
      },
    });
    if (rejection_audit_logs.length < 1) {
      update_queries.push(prisma.dataset_audit.create({
        data: {
          action: 'duplicate_rejected',
          user: {
            connect: {
              id: accepted_by_id,
            },
          },
          dataset: {
            connect: {
              id: d.id,
            },
          },
        },
      }));
    }

    // if a state update record hasn't been created for the overwrite of the
    // original dataset, create one.
    // eslint-disable-next-line no-await-in-loop
    const rejection_state_logs = await prisma.dataset_state.findMany({
      where: {
        state: 'REJECTED_DUPLICATE',
        dataset_id: d.id,
      },
    });
    if (rejection_state_logs.length < 1) {
      update_queries.push(prisma.dataset_state.create({
        data: {
          state: 'REJECTED_DUPLICATE',
          dataset: {
            connect: {
              id: d.id,
            },
          },
        },
      }));
    }

    const duplicate_latest_state = current_duplicate.states[0].state;

    update_queries.push(prisma.dataset.update({
      where: {
        id: d.id,
      },
      data: {
        is_deleted: true,
        version: duplicate_latest_state !== 'REJECTED_DUPLICATE'
          ? latest_rejected_duplicate_version + i
          : undefined,
        action_items: {
          updateMany: {
            where: {
              type: 'DUPLICATE_DATASET_INGESTION',
              active: true,
            },
            data: {
              status: 'RESOLVED',
              active: false,
            },
          },
        },
      },
    }));
  }

  // At this point, both the original and the incoming duplicate datasets are
  // considered "locked", and write operations on either of them should be
  // forbidden, until the lock is removed by another process.

  console.log('made it to the end before transaction');

  const [dataset_being_accepted] = await prisma.$transaction(update_queries);

  // if (true) {
  //   throw new Error('error before DB writes');
  // }

  console.log('made it to the end after transaction');

  return dataset_being_accepted;
}

async function complete_duplicate_acceptance({ duplicate_dataset_id }) {
  const {
    original_dataset,
    duplicate_dataset,
  } = await validate_state_after_original_dataset_resource_purge(duplicate_dataset_id);

  // assumes states are sorted descending by timestamp
  const original_dataset_state = original_dataset.states[0].state;

  const update_queries = [];

  update_queries.push(prisma.dataset.update({
    where: {
      id: duplicate_dataset.id,
    },
    data: {
      is_duplicate: false,
      // if incoming duplicate's version is not already updated, update it
      version: (!original_dataset.is_deleted && original_dataset_state !== 'OVERWRITTEN') ? original_dataset.version + 1 : undefined,
      action_items: {
        // Update the action item.
        // This updateMany is expected to update exactly one action item.
        updateMany: {
          where: {
            type: 'DUPLICATE_DATASET_INGESTION',
            active: true,
          },
          data: {
            status: 'RESOLVED',
            active: false,
          },
        },
      },
      audit_logs: {
        // Update the audit log.
        // This updateMany is expected to update exactly one audit_log, since
        // only one audit log should be created per action.
        updateMany: {
          where: {
            action: 'duplicate_acceptance_initiated',
          },
          data: {
            action: 'duplicate_accepted',
          },
        },
      },
      //
    },
  }));

  // if a state update record hasn't been created for the overwrite of the
  // original dataset, create one.
  // eslint-disable-next-line no-await-in-loop
  const acceptance_state_logs = await prisma.dataset_state.findMany({
    where: {
      state: 'DUPLICATE_ACCEPTED',
      dataset_id: duplicate_dataset_id,
    },
  });
  if (acceptance_state_logs.length < 1) {
    update_queries.push(prisma.dataset_state.create({
      data: {
        state: 'DUPLICATE_ACCEPTED',
        dataset: {
          connect: {
            id: duplicate_dataset_id,
          },
        },
      },
    }));
  }

  update_queries.push(prisma.dataset.update({
    where: {
      id: original_dataset.id,
    },
    data: {
      is_deleted: true,
      audit_logs: {
        // Update the audit log.
        // This updateMany is expected to update exactly one audit_log, since
        // only one audit log should be created per action.
        updateMany: {
          where: {
            action: 'overwrite_initiated',
          },
          data: {
            action: 'overwritten',
          },
        },
      },
    },
  }));

  // if a state update record hasn't been created for the overwrite of the
  // original dataset, create one.
  // eslint-disable-next-line no-await-in-loop
  const overwrite_state_logs = await prisma.dataset_state.findMany({
    where: {
      state: 'OVERWRITTEN',
      dataset_id: original_dataset.id,
    },
  });
  if (overwrite_state_logs.length < 1) {
    update_queries.push(prisma.dataset_state.create({
      data: {
        state: 'OVERWRITTEN',
        dataset: {
          connect: {
            id: original_dataset.id,
          },
        },
      },
    }));
  }

  // transfer dataset hierarchies from original to incoming duplicate dataset
  update_queries.push(prisma.dataset_hierarchy.updateMany({
    where: {
      source_id: original_dataset.id,
    },
    data: {
      source_id: duplicate_dataset.id,
    },
  }));
  update_queries.push(prisma.dataset_hierarchy.updateMany({
    where: {
      derived_id: original_dataset.id,
    },
    data: {
      derived_id: duplicate_dataset.id,
    },
  }));

  // Operators will likely be more interested in seeing the access statistics
  // for this dataset across all of its duplicates. Therefore, any previous
  // access attempts associated with the original dataset's id can be
  // overwritten with the incoming duplicate dataset's id.
  update_queries.push(
    prisma.data_access_log.updateMany({
      where: {
        dataset_id: original_dataset.id,
      },
      data: {
        dataset_id: duplicate_dataset.id,
      },
    }),
  );
  update_queries.push(
    prisma.stage_request_log.updateMany({
      where: {
        dataset_id: original_dataset.id,
      },
      data: {
        dataset_id: duplicate_dataset.id,
      },
    }),
  );

  // update the project-dataset relationship
  update_queries.push(prisma.project_dataset.updateMany({
    where: {
      dataset_id: original_dataset.id,
    },
    data: {
      dataset_id: duplicate_dataset.id,
    },
  }));

  const [accepted_dataset] = await prisma.$transaction(update_queries);

  // if (true) {
  //   throw new Error('error after DB writes');
  // }

  return accepted_dataset;
}

/**
 * Performs the database write operations needed to reject an incoming
 * duplicate dataset.
 *
 * This method is expected to be idempotent (the resultant end state
 * should be the same every time this method is called).
 *
 * @param {Number} duplicate_dataset_id - The duplicate dataset to be rejected.
 * @param {Number} rejected_by_id - id of the user who is rejecting the duplicate dataset.
 */
async function initiate_duplicate_rejection({ duplicate_dataset_id, rejected_by_id }) {
  const { duplicate_dataset } = await validate_state_before_rejected_dataset_resource_purge(
    duplicate_dataset_id,
  );

  const update_queries = [];

  const rejection_audit_logs = await prisma.dataset_audit.findMany({
    where: {
      action: 'duplicate_rejected',
      user_id: rejected_by_id,
      dataset_id: duplicate_dataset.id,
    },
  });
  if (rejection_audit_logs.length < 1) {
    update_queries.push(prisma.dataset_audit.create({
      data: {
        action: 'duplicate_rejected',
        user: {
          connect: {
            id: rejected_by_id,
          },
        },
        dataset: {
          connect: {
            id: duplicate_dataset.id,
          },
        },
      },
    }));
  }

  // if a state update record hasn't been created for the overwrite of the
  // original dataset, create one.
  // eslint-disable-next-line no-await-in-loop
  const rejection_state_logs = await prisma.dataset_state.findMany({
    where: {
      state: 'DUPLICATE_REJECTION_IN_PROGRESS',
      dataset_id: duplicate_dataset.id,
    },
  });
  if (rejection_state_logs.length < 1) {
    update_queries.push(prisma.dataset_state.create({
      data: {
        state: 'DUPLICATE_REJECTION_IN_PROGRESS',
        dataset: {
          connect: {
            id: duplicate_dataset.id,
          },
        },
      },
    }));
  }

  await prisma.$transaction(update_queries);

  const dataset_being_rejected = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset.id,
    },
  });
  return dataset_being_rejected;
}

async function complete_duplicate_rejection({ duplicate_dataset_id }) {
  const { duplicate_dataset } = await validate_state_after_rejected_dataset_resource_purge(
    duplicate_dataset_id,
  );

  // assumes states are sorted descending by timestamp
  const duplicate_dataset_latest_state = duplicate_dataset.states[0].state;

  const latest_rejected_duplicate_version = await get_dataset_latest_version({
    dataset_name: duplicate_dataset.name,
    dataset_type: duplicate_dataset.type,
    is_deleted: true,
    is_duplicate: true,
  });

  const update_queries = [];

  update_queries.push(prisma.dataset.update({
    where: {
      id: duplicate_dataset_id,
    },
    data: {
      is_deleted: true,
      version: (!duplicate_dataset.is_deleted && duplicate_dataset_latest_state === 'RESOURCES_PURGED')
        ? latest_rejected_duplicate_version + 1
        : undefined,
      action_items: {
        // Update the action item.
        // This updateMany is expected to update exactly one action item.
        updateMany: {
          where: {
            type: 'DUPLICATE_DATASET_INGESTION',
            active: true,
          },
          data: {
            status: 'RESOLVED',
            active: false,
          },
        },
      },
    },
  }));

  // if a state update record hasn't been created for the overwrite of the
  // original dataset, create one.
  // eslint-disable-next-line no-await-in-loop
  const rejection_state_logs = await prisma.dataset_state.findMany({
    where: {
      state: 'DUPLICATE_REJECTED',
      dataset_id: duplicate_dataset.id,
    },
  });
  if (rejection_state_logs.length < 1) {
    update_queries.push(prisma.dataset_state.create({
      data: {
        state: 'DUPLICATE_REJECTED',
        dataset: {
          connect: {
            id: duplicate_dataset.id,
          },
        },
      },
    }));
  }

  const [rejected_dataset] = await prisma.$transaction(update_queries);
  return rejected_dataset;
}

module.exports = {
  soft_delete,
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  get_dataset,
  create_workflow,
  create_filetree,
  has_dataset_assoc,
  files_ls,
  search_files,
  add_files,
  initiate_duplicate_acceptance,
  complete_duplicate_acceptance,
  initiate_duplicate_rejection,
  complete_duplicate_rejection,
};
