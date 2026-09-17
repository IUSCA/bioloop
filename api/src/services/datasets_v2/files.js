const path = require('node:path');

const createError = require('http-errors');
const config = require('config');

const prisma = require('@/db');
const { assertPossible, withStateFields } = require('@/state').import('dataset');
const FileGraph = require('@/services/fileGraph');
const authService = require('@/services/auth');
const logger = require('@/services/logger');

/**
 * A dataset's integer primary key and the fields its state rules read, from its resource UUID.
 *
 * @param {string} resource_id
 * @returns {Promise<{id: number, is_deleted: boolean, owner_group: {is_archived: boolean}}>}
 * @throws {createError.NotFound} when no dataset carries that resource id
 */
async function findDatasetRow(resource_id) {
  const dataset = await prisma.dataset.findUnique(withStateFields({
    where: { resource_id },
    select: { id: true },
  }));
  if (!dataset) throw createError.NotFound('Dataset not found');
  return dataset;
}

/**
 * Adds files to a dataset.
 *
 * @async
 * @function addFilesToDataset
 * @description This function is idempotent, so it can be called multiple times with overlapping file paths without creating duplicate entries in the database.
 * It will maintain the file hierarchy by inferring directories from the file paths and creating metadata for them as well.
 * @param {Object} params - The parameters object.
 * @param {number} params.dataset_row_id - The dataset's integer primary key.
 * @param {Array} params.data - An array of file objects to add.
 * @param {string} params.data[].path - The path of the file.
 * @param {number} params.data[].size - The size of the file in bytes.
 * @param {string} params.data[].md5 - The MD5 hash of the file.
 * @param {string} params.data[].filetype - The type of the file (e.g., 'file' or 'directory').
 * @returns {Promise<void>} A promise that resolves when the files have been added.
 * @throws {Error} Throws an error if there is an issue adding the files to the dataset.
 */
async function addFilesToDataset({ dataset_row_id, data }) {
  // 1. create file graph data structure from the list of file paths
  // 2. infer directories from the data structure and create metadata for them as well,
  //    so we can maintain the file hierarchy in the database
  // 3. create entries for files and directories in the database
  // 4. fetch them back to get their ids
  // 5. create entries in the dataset_file_hierarchy table to maintain parent-child relationships

  const files = data.map((f) => ({
    dataset_id: dataset_row_id,
    name: path.parse(f.path).base,
    ...f,
  }));

  // create a file tree using graph data structure
  const graph = new FileGraph(files.map((f) => f.path));

  // query non leaf nodes (directories) from the graph data structure
  const directories = graph.non_leaf_nodes().map((p) => ({
    dataset_id: dataset_row_id,
    name: path.parse(p).base,
    path: p,
    filetype: 'directory',
  }));

  // create files and directory metadata
  const allFiles = files.concat(directories);

  await prisma.$transaction(async (tx) => {
    await tx.dataset_file.createMany({
      data: allFiles,
      skipDuplicates: true,
    });

    // retrieve all files and directories for this dataset to get their ids
    const fileObjs = await tx.dataset_file.findMany({
      where: {
        dataset_id: dataset_row_id,
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

    await tx.dataset_file_hierarchy.createMany({
      data: edges,
      skipDuplicates: true,
    });
  });
}

/**
 * Normalizes a base path by removing trailing slashes.
 * @param {string} base - The base path to normalize
 * @returns {string} The normalized base path. Returns an empty string if input is '/',
 *                   removes trailing slashes if present, otherwise returns the path as-is
 */
function normalizeBasePath(base) {
  if (base === '/') return '';
  if (base.endsWith('/')) return base.replace(/\/+$/, '');
  return base;
}

/**
 * Lists files in a dataset directory. Similar to the 'ls' command in Unix,
 * it returns files and directories directly under the specified base path, without recursively listing all files in
 * subdirectories.
 *
 * `dataset_resource_id` is the dataset's resource UUID, matching every other v2 entry point, and is
 * resolved to the integer `dataset_file.dataset_id` here rather than by the caller.
 *
 * A dataset that holds no files, and a base path with nothing under it, are both an empty
 * listing. Only an unknown dataset is a 404, so "no files yet" stays distinguishable from
 * "no such dataset".
 *
 * @async
 * @function files_ls
 * @param {Object} params - The parameters object.
 * @param {string} params.dataset_resource_id - The dataset's resource UUID.
 * @param {string} [params.base=''] - The base path to list files from.
 * @returns {Promise<Array>} An array of file objects, empty when nothing is under the base path.
 * @throws {createError.NotFound} when no dataset carries that resource id.
 */
async function listFiles({ dataset_resource_id, base = '' }) {
  // A deleted dataset's files are gone, so the listing is a conflict rather than an empty
  // result: an empty listing means "no files yet", which this is not.
  const dataset_row = await findDatasetRow(dataset_resource_id);
  assertPossible('list_files', dataset_row);
  const dataset_row_id = dataset_row.id;
  const base_path = normalizeBasePath(base);

  const results = await prisma.dataset_file.findFirst({
    where: {
      dataset_id: dataset_row_id,
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
  if (!results) return [];
  return results.children.map((row) => row.child);
}

/**
 * Creates a file tree structure from a list of files.
 *
 * @function createFileTree
 * @param {Array} files - An array of file objects.
 * @returns {Object} A tree structure representing the file hierarchy.
 */
function createFileTree(files) {
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
 * The whole file hierarchy of a dataset, as a nested tree.
 *
 * `dataset_resource_id` is the dataset's resource UUID, matching every other v2 entry point, and is
 * resolved to the integer `dataset_file.dataset_id` here rather than by the caller.
 *
 * @async
 * @function getFileTree
 * @param {Object} params
 * @param {string} params.dataset_resource_id - The dataset's resource UUID.
 * @returns {Promise<Object>} the root node; `children` is empty when the dataset holds no files.
 * @throws {createError.NotFound} when no dataset carries that resource id.
 */
async function getFileTree({ dataset_resource_id }) {
  const dataset_row = await findDatasetRow(dataset_resource_id);
  assertPossible('list_files', dataset_row);
  const dataset_row_id = dataset_row.id;

  const files = await prisma.dataset_file.findMany({
    where: {
      dataset_id: dataset_row_id,
    },
  });
  const root = createFileTree(files);
  return root;
}

/**
 * Searches for files in a dataset based on various criteria.
 *
 * @async
 * @function searchFiles
 * @param {Object} params - The parameters object.
 * @param {number} params.dataset_row_id - The dataset's integer primary key.
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
async function searchFiles({
  dataset_row_id, name = '', base = '',
  skip, take,
  extension = null, filetype = null, min_file_size = null, max_file_size = null,
  sort_order = null, sort_by = null,
}) {
  const base_path = normalizeBasePath(base);

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
      dataset_id: dataset_row_id,
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
 * A download URL and token for one file.
 *
 * `dataset_resource_id` is the dataset's resource UUID, the way every other v2 entry point addresses a
 * dataset. `dataset.id` and `dataset_file.dataset_id` are integers, so it is resolved here
 * rather than by each caller.
 */
async function getFileDownloadInfo({ dataset_resource_id, file_id, actor_id }) {
  const dataset_row = await findDatasetRow(dataset_resource_id);
  assertPossible('download', dataset_row);
  const dataset_row_id = dataset_row.id;

  const val = await prisma.$transaction(async (tx) => {
    const file = await tx.dataset_file.findFirstOrThrow({
      where: {
        id: file_id,
        dataset_id: dataset_row_id,
      },
    });

    const dataset = await tx.dataset.findFirstOrThrow({
      where: {
        id: dataset_row_id,
      },
    });

    if (!dataset.metadata?.stage_alias) {
      throw createError.NotFound('Dataset is not prepared for download');
    }
    const download_file_path = path.join(dataset.metadata.stage_alias, file.path);
    const url = new URL(download_file_path, `${config.get('download_server.base_url')}`);

    // use url.pathname instead of download_file_path to deal with spaces in
    // the file path oauth scope cannot contain spaces
    const download_token = await authService.get_download_token(url.pathname);
    const downloadUrl = new URL(
      `download/${encodeURIComponent(download_file_path)}`,
      config.get('download_server.base_url'),
    );
    return {
      url: downloadUrl.href,
      bearer_token: download_token.accessToken,
    };
  });

  // A download that is not recorded is still a download, so a logging failure does not
  // withhold the token. It is loud, because "downloads are logged" is a claim the audit
  // trail makes and a silent catch quietly stops it being true.
  // @see .todo/issues/06-dataset-actions-workflows.md — Decisions taken
  try {
    await prisma.data_access_log.create({
      data: {
        access_type: 'BROWSER',
        file_id,
        dataset_id: dataset_row_id,
        user_id: actor_id,
      },
    });
  } catch (e) {
    logger.error(`Unable to record a file download for dataset ${dataset_resource_id}: ${e.message}`);
  }

  return val;
}

/**
 * Path the download server serves a dataset's bundle from, relative to the download root.
 *
 * `bundles/<stage_alias>/<name>.tar`. The alias directory supplies uniqueness, because two
 * groups may hold a dataset of the same name; the last segment stays readable, because the
 * browser names the saved file from it. Kept here rather than shared with the legacy
 * service, which v2 code does not call.
 *
 * @see docs/design/groups/dataset-storage.md — Download
 */
function getBundleDownloadPath(dataset) {
  return `bundles/${dataset.metadata.stage_alias}/${dataset.name}.tar`;
}

/**
 * A download URL and token for the dataset's bundle. Takes the resource UUID, as above.
 */
async function getBundleDownloadInfo({ dataset_resource_id, actor_id }) {
  const dataset_row = await findDatasetRow(dataset_resource_id);
  assertPossible('download', dataset_row);
  const dataset_row_id = dataset_row.id;

  const val = await prisma.$transaction(async (tx) => {
    const dataset = await tx.dataset.findFirstOrThrow({
      where: {
        id: dataset_row_id,
      },
    });

    if (!dataset.metadata?.stage_alias) {
      throw createError.NotFound('Dataset is not prepared for download');
    }
    const download_file_path = getBundleDownloadPath(dataset);
    const url = new URL(download_file_path, `${config.get('download_server.base_url')}`);

    // use url.pathname instead of download_file_path to deal with spaces in
    // the file path oauth scope cannot contain spaces
    const download_token = await authService.get_download_token(url.pathname);
    const downloadUrl = new URL(
      `download/${encodeURIComponent(download_file_path)}`,
      config.get('download_server.base_url'),
    );
    return {
      url: downloadUrl.href,
      bearer_token: download_token.accessToken,
    };
  });

  // Loud but non-blocking, as above.
  try {
    await prisma.data_access_log.create({
      data: {
        access_type: 'BROWSER',
        dataset_id: dataset_row_id,
        user_id: actor_id,
      },
    });
  } catch (e) {
    logger.error(`Unable to record a bundle download for dataset ${dataset_resource_id}: ${e.message}`);
  }

  return val;
}

module.exports = {
  addFilesToDataset,
  listFiles,
  getFileTree,
  searchFiles,
  getFileDownloadInfo,
  getBundleDownloadInfo,
};
