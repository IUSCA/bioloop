const assert = require('assert');
const path = require('node:path');

const { PrismaClient } = require('@prisma/client');
const config = require('config');
// const _ = require('lodash/fp');

const wfService = require('./workflow');
const userService = require('./user');
const { log_axios_error } = require('../utils');
const FileGraph = require('./fileGraph');
const {
  DONE_STATUSES, INCLUDE_STATES, INCLUDE_WORKFLOWS, INCLUDE_AUDIT_LOGS,
} = require('../constants');

const prisma = new PrismaClient();

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
  include_upload_log = false,
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
      dataset_upload_log: include_upload_log ? {
        include: {
          upload_log: {
            select: {
              id: true,
              files: true,
              status: true,
            },
          },
        },
      } : false,
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

module.exports = {
  soft_delete,
  get_dataset,
  create_workflow,
  create_filetree,
  has_dataset_assoc,
  files_ls,
  search_files,
  add_files,
};
