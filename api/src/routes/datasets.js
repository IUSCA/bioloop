const fs = require('fs');
const fsPromises = require('fs/promises');
const multer = require('multer');

const { createHash } = require('node:crypto');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const {
  query, param, body, checkSchema,
} = require('express-validator');
const _ = require('lodash/fp');
const config = require('config');

// const logger = require('../services/logger');
const path = require('path');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl, getPermission } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const datasetService = require('../services/dataset');
const authService = require('../services/auth');

const isPermittedTo = accessControl('datasets');

const router = express.Router();
const prisma = new PrismaClient();


// stats - UI
router.get(
  '/stats',
  isPermittedTo('read'),
  validate([
    query('type').isIn(config.dataset_types).optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get summary statistics of datasets.'
    let result;
    let n_wf_result;
    if (req.query.type) {
      result = await prisma.$queryRaw`
        select count(*)     as "count",
        sum(du_size) as total_size,
        SUM(
                CASE
                    WHEN metadata -> 'num_genome_files' IS NOT NULL
                        THEN (metadata ->> 'num_genome_files')::int
                    ELSE 0
                    END
            )        AS total_num_genome_files
        from dataset
        where is_deleted = false and type = ${req.query.type};
      `;

      n_wf_result = await prisma.workflow.aggregate({
        where: {
          dataset: {
            type: req.query.type,
          },
        },
        _count: {
          id: true,
        },
      });
    } else {
      result = await prisma.$queryRaw`
        select 
          count(*) as "count", 
          sum(du_size) as total_size, 
          SUM(
                CASE
                    WHEN metadata -> 'num_genome_files' IS NOT NULL
                        THEN (metadata ->> 'num_genome_files')::int
                    ELSE 0
                    END
            )        AS total_num_genome_files
        from dataset 
        where is_deleted = false;
      `;

      n_wf_result = await prisma.workflow.aggregate({
        _count: {
          id: true,
        },
      });
    }
    const stats = result[0];
    res.json({
      ..._.mapValues(Number)(stats),
      workflows: n_wf_result?._count.id || 0,
    });
  }),
);

// add hierarchy association
const assoc_body_schema = {
  '0.source_id': {
    in: ['body'],
    isInt: {
      errorMessage: 'Source ID must be an integer',
    },
    toInt: true,
  },
  '0.derived_id': {
    in: ['body'],
    isInt: {
      errorMessage: 'Derived ID must be an integer',
    },
    toInt: true,
  },
};

const buildQueryObject = ({
  deleted, processed, archived, staged, type, name, match_name_exact, days_since_last_staged,
}) => {
  const query_obj = _.omitBy(_.isUndefined)({
    is_deleted: deleted,
    archive_path: archived ? { not: null } : undefined,
    is_staged: staged,
    type,
    name: name ? {
      ...(match_name_exact ? { equals: name } : { contains: name }),
      mode: 'insensitive', // case-insensitive search
    } : undefined,
  });

  // processed=true: datasets with one or more workflows associated
  // processed=false: datasets with no workflows associated
  // processed=undefined/null: no query based on workflow association
  if (!_.isNil(processed)) {
    query_obj.workflows = { [processed ? 'some' : 'none']: {} };
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

  return query_obj;
};

const buildOrderByObject = (field, sortOrder, nullsLast = true) => {
  const nullable_order_by_fields = ['num_directories', 'num_files', 'du_size', 'size'];

  if (!field || !sortOrder) {
    return {};
  }
  if (nullable_order_by_fields.includes(field)) {
    return {
      [field]: { sort: sortOrder, nulls: nullsLast ? 'last' : 'first' },
    };
  }
  return {
    [field]: sortOrder,
  };
};

router.post(
  '/associations',
  isPermittedTo('update'),
  validate([
    checkSchema(assoc_body_schema),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Add new associations between datasets
    await prisma.dataset_hierarchy.createMany({
      data: req.body,
    });
    res.sendStatus(200);
  }),
);

// Get all datasets, and the count of datasets. Results can optionally be
// filtered and sorted by the criteria specified.
// Used by workers + UI.
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('deleted').toBoolean().default(false),
    query('processed').toBoolean().optional(),
    query('archived').toBoolean().optional(),
    query('staged').toBoolean().optional(),
    query('type').isIn(config.dataset_types).optional(),
    query('name').notEmpty().escape().optional(),
    query('match_name_exact').toBoolean().optional(),
    query('days_since_last_staged').isInt().toInt().optional(),
    query('limit').isInt().toInt().optional(),
    query('offset').isInt().toInt().optional(),
    query('sortBy').isObject().optional(),
    query('bundle').optional().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']

    const sortBy = req.query.sortBy || {};

    const query_obj = buildQueryObject({
      deleted: req.query.deleted,
      processed: req.query.processed,
      archived: req.query.archived,
      staged: req.query.staged,
      type: req.query.type,
      name: req.query.name,
      match_name_exact: req.query.match_name_exact,
      days_since_last_staged: req.query.days_since_last_staged,
    });

    const filterQuery = { where: query_obj };
    const datasetRetrievalQuery = {
      skip: req.query.offset,
      take: req.query.limit,
      ...filterQuery,
      orderBy: buildOrderByObject(Object.keys(sortBy)[0], Object.values(sortBy)[0]),
      include: {
        ...datasetService.INCLUDE_WORKFLOWS,
        ...datasetService.INCLUDE_STATES,
        file_type: true,
        source_datasets: true,
        derived_datasets: true,
        bundle: req.query.bundle || false,
      },
    };

    const [datasets, count] = await prisma.$transaction([
      prisma.dataset.findMany({ ...datasetRetrievalQuery }),
      prisma.dataset.count({ ...filterQuery }),
    ]);

    res.json({
      metadata: { count },
      datasets,
    });
  }),
);

// Data Products - UI
router.get(
  '/file-types',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const dataset_file_types = await prisma.dataset_file_type.findMany();
    res.json(dataset_file_types);
  }),
);

const dataset_access_check = asyncHandler(async (req, res, next) => {
  // assumes req.params.id is the dataset id user is requesting
  // access check
  const permission = getPermission({
    resource: 'datasets',
    action: 'read',
    requester_roles: req?.user?.roles,
  });
  if (!permission.granted) {
    const user_dataset_assoc = await datasetService.has_dataset_assoc({
      username: req.user.username,
      dataset_id: req.params.id,
    });
    if (!user_dataset_assoc) {
      return next(createError.Forbidden());
    }
  }
  next();
});

router.get(
  '/upload-logs',
  validate([
    query('status').isIn(Object.values(config.upload_status)).optional(),
    query('dataset_name').notEmpty().escape().optional(),
  ]),
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    const { status, dataset_name } = req.query;

    const query_obj = _.omitBy(_.isUndefined)({
      status,
      dataset: {
        name: { contains: dataset_name },
      },
    });

    const upload_logs = await prisma.upload_log.findMany({
      where: query_obj,
      include: UPLOAD_LOG_INCLUDE_RELATIONS,
    });

    res.json(upload_logs);
  }),
);

// get by id - worker + UI
router.get(
  '/:id',
  validate([
    param('id').isInt().toInt(),
    query('files').toBoolean().default(false),
    query('workflows').toBoolean().default(false),
    query('last_task_run').toBoolean().default(false),
    query('prev_task_runs').toBoolean().default(false),
    query('only_active').toBoolean().default(false),
    query('bundle').optional().toBoolean(),
    query('fetch_uploading_data_products').toBoolean().default(false),
    query('upload_log').toBoolean().default(false),
  ]),
  dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // only select path and md5 columns from the dataset_file table if files is true

    const dataset = await datasetService.get_dataset({
      id: req.params.id,
      files: req.query.files,
      workflows: req.query.workflows,
      last_task_run: req.query.last_task_run,
      prev_task_runs: req.query.prev_task_runs,
      only_active: req.query.only_active,
      bundle: req.query.bundle || false,
      fetch_uploading_data_products: req.query.fetch_uploading_data_products,
      upload_log: req.query.upload_log,
    });
    res.json(dataset);
  }),
);

// create - worker
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('du_size').optional().notEmpty().customSanitizer(BigInt), // convert to BigInt
    body('size').optional().notEmpty().customSanitizer(BigInt),
    body('bundle_size').optional().notEmpty().customSanitizer(BigInt),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Create a new dataset.'
    /* #swagger.description = 'workflow_id is optional. If the request body has workflow_id,
        a new relation is created between dataset and given workflow_id'
    */
    const { workflow_id, state, ...data } = req.body;

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

    // create dataset along with associations
    const dataset = await prisma.dataset.create({
      data,
      include: {
        ...datasetService.INCLUDE_WORKFLOWS,
        ...datasetService.INCLUDE_STATES,
      },
    });
    res.json(dataset);
  }),
);

// modify - worker
router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('du_size').optional().notEmpty().bail()
      .customSanitizer(BigInt), // convert to BigInt
    body('size').optional().notEmpty().bail()
      .customSanitizer(BigInt),
    body('bundle_size').optional().notEmpty().bail()
      .customSanitizer(BigInt),
    body('bundle').optional().isObject(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Modify dataset.'
    /* #swagger.description =
        To add files use POST "/datasets/:id/files"
        To add workflow use POST "/datasets/:id/workflows"
        To add state use POST "/datasets/:id/state"
    */
    const datasetToUpdate = await prisma.dataset.findFirst({
      where: {
        id: req.params.id,
      },
    });
    if (!datasetToUpdate) { return next(createError(404)); }

    const { metadata, ...data } = req.body;
    data.metadata = _.merge(datasetToUpdate?.metadata)(metadata); // deep merge

    if (req.body.bundle) {
      data.bundle = {
        upsert: {
          create: req.body.bundle,
          update: req.body.bundle,
        },
      };
    }

    const dataset = await prisma.dataset.update({
      where: {
        id: req.params.id,
      },
      data,
      include: {
        ...datasetService.INCLUDE_WORKFLOWS,
        source_datasets: true,
        derived_datasets: true,
      },
    });
    res.json(dataset);
  }),
);

// add files to dataset - worker
router.post(
  '/:id/files',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Associate files to a dataset
    const data = req.body.map((f) => ({
      path: f.path,
      md5: f.md5,
      size: BigInt(f.size),
      filetype: f.type,
    }));
    await datasetService.add_files({ dataset_id: req.params.id, data });

    res.sendStatus(200);
  }),
);

// add workflow ids to dataset
router.post(
  '/:id/workflows',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('workflow_id').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Associate workflow_id to a dataset
    await prisma.workflow.create({
      data: {
        id: req.body.workflow_id,
        dataset_id: req.params.id,
      },
    });
    res.sendStatus(200);
  }),
);

// add state to dataset
router.post(
  '/:id/states',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('state').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Add new state to a dataset
    await prisma.dataset_state.create({
      data: _.omitBy(_.isNil)({
        state: req.body.state,
        dataset_id: req.params.id,
        metadata: req.body.metadata,
      }),
    });
    res.sendStatus(200);
  }),
);

// delete - UI
router.delete(
  '/:id',
  isPermittedTo('delete'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = starts a delete archive workflow which will
    // mark the dataset as deleted on success.
    const _dataset = await datasetService.get_dataset({
      id: req.params.id,
      workflows: true,
    });

    if (_dataset) {
      await datasetService.soft_delete(_dataset, req.user?.id);
      res.send();
    } else {
      next(createError(404));
    }
  }),
);

// Launch a workflow on the dataset - UI
router.post(
  '/:id/workflow/:wf',
  accessControl('workflow')('create'),
  validate([
    param('id').isInt().toInt(),
    param('wf').isIn(['stage', 'integrated']),
  ]),
  (req, res, next) => {
    // admin and operator roles can run stage and integrated workflows
    // user role can only run stage workflows

    // allowed_wfs is an object with keys as workflow names and values as true
    // filter only works on objects not arrays, so we use an object with true value
    const allowed_wfs = req.permission.filter({ [req.params.wf]: true });
    if (allowed_wfs[req.params.wf]) {
      return next();
    }
    next(createError.Forbidden());
  },
  // user role can only run wf on the datasets they can access through project associations
  dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and start a workflow and associate it.
    // Allowed names are stage, integrated.

    // Log the staging attempt first.
    if (req.params.wf === 'stage') {
      try {
        await prisma.stage_request_log.create({
          data: {
            dataset_id: req.params.id,
            user_id: req.user.id,
          },
        });
      } catch (e) {
      // console.log()
      }
    }

    const dataset = await datasetService.get_dataset({
      id: req.params.id,
      workflows: true,
    });

    const wf_name = req.params.wf;
    const wf = await datasetService.create_workflow(dataset, wf_name);
    return res.json(wf);
  }),
);

const report_storage = multer.diskStorage({
  async destination(req, file, cb) {
    try {
      const dataset = await prisma.dataset.findFirst({
        where: {
          id: req.params.id,
        },
      });

      if (dataset?.metadata?.report_id) {
        const parent_dir = `reports/${dataset?.metadata?.report_id}`;
        await fsPromises.mkdir(parent_dir, {
          recursive: true,
        });

        cb(null, parent_dir);
      } else {
        cb('report_id is not set');
      }
    } catch (e) {
      cb(e);
    }
  },

  filename(req, file, cb) {
    cb(null, 'multiqc_report.html');
  },
});

// upload a report - worker
router.put(
  '/:id/report',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  multer({ storage: report_storage }).single('report'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Upload a QC report (html file) of this dataset
    res.json({
      path: req.file.path,
    });
  }),
);

router.get(
  '/:id/files',
  validate([
    param('id').isInt().toInt(),
    query('basepath').default(''),
  ]),
  dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get a list of files and directories under basepath

    const files = await datasetService.files_ls({
      dataset_id: req.params.id,
      base: req.query.basepath,
    });
    // cache indefinitely - 1 year
    // use ui/src/config.js file_browser.cache_busting_id to invalidate cache if a need arises
    res.set('Cache-control', 'private, max-age=31536000');
    res.json(files);
  }),
);

router.get(
  '/:id/filetree',
  validate([
    param('id').isInt().toInt(),
  ]),
  dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get the file tree

    const files = await prisma.dataset_file.findMany({
      where: {
        dataset_id: req.params.id,
      },
    });
    const root = datasetService.create_filetree(files);
    res.json(root);
  }),
);

router.get(
  '/download/:id',
  validate([
    param('id').isInt().toInt(),
    query('file_id').isInt().toInt().optional(),
  ]),
  dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get file download URL and token

    const isFileDownload = !!req.query.file_id;

    // Log the data access attempt first.
    // Catch errors to ensure that logging does not get in the way of a token being returned.
    try {
      await prisma.data_access_log.create({
        data: {
          access_type: 'BROWSER',
          file_id: isFileDownload ? req.query.file_id : undefined,
          dataset_id: !isFileDownload ? req.params.id : undefined,
          user_id: req.user.id,
        },
      });
    } catch (e) {
      // console.log();
    }

    let file;
    if (isFileDownload) {
      file = await prisma.dataset_file.findFirstOrThrow({
        where: {
          id: req.query.file_id,
          dataset_id: req.params.id,
        },
      });
    }

    const dataset = await prisma.dataset.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
      include: {
        bundle: true,
      },
    });

    if (dataset.metadata.stage_alias) {
      const download_file_path = isFileDownload
        ? `${dataset.metadata.stage_alias}/${file.path}`
        : `${dataset.metadata.bundle_alias}`;

      const url = new URL(download_file_path, config.get('download_server.base_url'));

      // use url.pathname instead of download_file_path to deal with spaces in the file path
      // oauth scope cannot contain spaces
      const download_token = await authService.get_download_token(url.pathname);
      res.json({
        url: url.href,
        bearer_token: download_token.accessToken,
      });
    } else {
      next(createError.NotFound('Dataset is not prepared for download'));
    }
  }),
);

router.get(
  '/:id/files/search',
  validate([
    param('id').isInt().toInt(),
    query('name').default(''),
    query('basepath').optional().default(''),
    query('filetype').isIn(['file', 'directory', 'symbolic link']).optional(),
    query('extension').optional(),
    query('min_file_size').isInt().toInt().optional(),
    query('max_file_size').isInt().toInt().optional(),
    query('skip').isInt().toInt().optional()
      .default(0),
    query('take').isInt().toInt().optional()
      .default(1000),
  ]),
  dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get a list of files and directories under basepath
    const files = await datasetService.search_files({
      dataset_id: req.params.id,
      base: req.query.basepath,
      ...req.query,
    });
    res.json(files);
  }),
);

// Post a file chunks
// router.post(
//   '/upload',
//   isPermittedTo('update'),
//   asyncHandler(async (req, res, next) => {
//     authService.fetchWrapper.fetch(`${config.get('download_server.base_url')}/upload`, {
//       method: 'POST',
//       body: req.body,
//     }).then((response) => {
//       res.send(response.status);
//     }).catch((e) => {
//       // eslint-disable-next-line no-console
//       console.log(e);
//       res.sendStatus(500);
//     });
//   }),
// );

const UPLOAD_PATH = path.join(config.upload_path, 'datasets');

const getUploadPath = (datasetName) => path.join(
  UPLOAD_PATH,
  datasetName,
);

const getFileChunksStorageDir = (datasetName, fileChecksum) => path.join(
  getUploadPath(datasetName),
  'chunked_files',
  fileChecksum,
);

// const getFileChunkName = (fileChecksum, index) => `${fileChecksum}-${index}`;
//
// const uploadFileStorage = multer.diskStorage({
//   destination: async (req, file, cb) => {
//     const chunkStorage = getFileChunksStorageDir(req.body.data_product_name, req.body.checksum);
//     await fsPromises.mkdir(chunkStorage, {
//       recursive: true,
//     });
//     cb(null, chunkStorage);
//   },
//   filename: (req, file, cb) => {
//     cb(null, getFileChunkName(req.body.checksum, req.body.index));
//   },
// });
//
// router.post(
//   '/upload',
//   multer({ storage: uploadFileStorage }).single('file'),
//   asyncHandler(async (req, res, next) => {
//     const {
//       name, data_product_name, total, index, size, checksum, chunk_checksum,
//     } = req.body;
//
//     // eslint-disable-next-line no-console
// eslint-disable-next-line max-len
//     console.log('Processing file piece...', data_product_name, name, total, index, size, checksum, chunk_checksum);
//
//     const receivedFilePath = req.file.path;
//
//     fs.readFile(receivedFilePath, (err, data) => {
//       if (err) {
//         throw err;
//       }
//
//       const evaluated_checksum = createHash('md5').update(data).digest('hex');
//
//       console.log(`expected: ${chunk_checksum}`);
//       console.log(`evaluated: ${evaluated_checksum}`);
//
//       if (evaluated_checksum !== chunk_checksum) {
//         res.sendStatus(409).json('Expected checksum for chunk did not equal evaluated checksum');
//       }
//
//       res.json('success');
//     });
//   }),
// );

const UPLOAD_LOG_INCLUDE_RELATIONS = {
  files: true,
  user: true,
  dataset: {
    include: {
      source_datasets: {
        include: {
          source_dataset: true,
        },
      },
      file_type: true,
    },
  },
};

// Post a Dataset's upload log, files' info and the Dataset to the database - UI
router.post(
  '/upload-log',
  isPermittedTo('update'),
  validate([
    body('data_product_name').notEmpty().escape().isLength({ min: 3 }),
    body('file_type').isObject(),
    body('source_dataset_id').isInt().toInt(),
    body('files_metadata').isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    const {
      data_product_name, source_dataset_id, file_type, files_metadata,
    } = req.body;

    const upload_log = await prisma.upload_log.create({
      data: {
        status: config.upload_status.UPLOADING,
        user: {
          connect: {
            id: req.user.id,
          },
        },
        files: {
          create: files_metadata.map((file) => ({
            name: file.name,
            md5: file.checksum,
            num_chunks: file.num_chunks,
            chunks_path: getFileChunksStorageDir(data_product_name, file.checksum),
            destination_path: path.join(
              getUploadPath(data_product_name),
              file.name,
            ),
            status: config.upload_status.UPLOADING,
          })),
        },
        dataset: {
          create: {
            source_datasets: {
              create: [{
                source_id: source_dataset_id,
              }],
            },
            name: data_product_name,
            origin_path: getUploadPath(data_product_name),
            type: config.dataset_types[1],
            file_type: file_type.id === undefined ? {
              create: {
                name: file_type.name,
                extension: file_type.extension,
              },
            } : { connect: { id: file_type.id } },
          },
        },
      },
      include: UPLOAD_LOG_INCLUDE_RELATIONS,
    });

    res.json(upload_log);
  }),
);

// Get an upload log - UI, worker
router.get(
  '/upload-log/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
      include: UPLOAD_LOG_INCLUDE_RELATIONS,
    });
    res.json(upload_log);
  }),
);

// Update an upload log and it's files - UI, workers
router.patch(
  '/upload-log/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('status').notEmpty().escape().optional(),
    body('increment_processing_count').isBoolean().toBoolean().optional()
      .default(false),
    body('files').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    const { status, files, increment_processing_count } = req.body;
    const existing_upload = await prisma.upload_log.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
      include: UPLOAD_LOG_INCLUDE_RELATIONS,
    });
    if (existing_upload.status === config.upload_status.FAILED) {
      res.json(existing_upload);
      return;
    }

    const update_query = _.omitBy(_.isUndefined)({
      status,
      last_updated: new Date(),
      ...(increment_processing_count && {
        processing_attempt_count:
          {
            increment: 1,
          },
      }),
      ...(status === config.upload_status.FAILED && {
        dataset: {
          delete: true,
        },
      }),
    });

    const updates = [];
    updates.push(prisma.upload_log.update({
      where: { id: req.params.id },
      data: update_query,
    }));
    (files || []).forEach((f) => {
      updates.push(prisma.file_upload_log.update({
        where: { id: f.id },
        data: f.data,
      }));
    });

    await prisma.$transaction(updates);

    const upload = await prisma.upload_log.findUniqueOrThrow({
      where: {
        id: req.params.id,
      },
      include: UPLOAD_LOG_INCLUDE_RELATIONS,
    });
    res.json(upload);
  }),
);

// Initiate the processing of uploaded files - worker
router.post(
  '/:id/upload/process',
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    const WORKFLOW_NAME = 'process_upload';

    const { dataset_id } = req.params;

    const dataset = await prisma.dataset.findFirst({
      where: {
        id: dataset_id,
        include: {
          workflows: true,
        },
      },
    });

    await datasetService.create_workflow(dataset, WORKFLOW_NAME);
    res.send('OK');
  }),
);

// Update the attributes of an uploaded file - worker
router.patch(
  '/file-upload-log/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('status').notEmpty().escape(),
  ]),
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    const { status } = req.body;

    const file_upload_log = await prisma.file_upload_log.update({
      where: {
        id: req.params.id,
      },
      data: {
        status,
      },
    });

    res.json(file_upload_log);
  }),
);

const UPLOAD_PATH = config.upload_path;

const getUploadPath = (datasetName) => path.join(
  UPLOAD_PATH,
  datasetName,
);

const getFileChunksStorageDir = (datasetName, fileChecksum) => path.join(
  getUploadPath(datasetName),
  'chunked_files',
  fileChecksum,
);

const getFileChunkName = (fileChecksum, index) => `${fileChecksum}-${index}`;

const uploadFileStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const chunkStorage = getFileChunksStorageDir(req.body.data_product_name, req.body.checksum);
    await fsPromises.mkdir(chunkStorage, {
      recursive: true,
    });
    cb(null, chunkStorage);
  },
  filename: (req, file, cb) => {
    cb(null, getFileChunkName(req.body.checksum, req.body.index));
  },
});

/**
 * Accepts a multipart/form-data request, validates the checksum of the bytes
 * received, and upon successful validation, writes the received bytes to the
 * filesystem. Path of the file is constructed from metadata fields present in
 * the request body.
 */
router.post(
  '/upload',
  multer({ storage: uploadFileStorage }).single('file'),
  asyncHandler(async (req, res, next) => {
    const {
      name, data_product_name, total, index, size, checksum, chunk_checksum,
    } = req.body;

    // const UPLOAD_SCOPE = config.get('upload_scope');

    // const scopes = (req.token?.scope || '').split(' ');
    // console.log(`scopes: ${scopes}`);

    // const has_upload_scope = scopes.find((scope) => scope === UPLOAD_SCOPE);
    // console.log(`has_upload_scope: ${has_upload_scope}`);

    // if (!has_upload_scope) {
    //   return next(createError.Forbidden('Invalid scope'));
    // }
    // console.log('passed scope check');

    if (!(data_product_name && checksum && chunk_checksum) || Number.isNaN(index)) {
      res.sendStatus(400);
    }

    // eslint-disable-next-line no-console
    console.log('Processing file piece ...', data_product_name, name, total, index, size, checksum, chunk_checksum);

    // const filePath = `${getFileChunksStorageDir(req.body.data_product_name,
    // req.body.checksum)}/${getFileChunkName(req.body.checksum,
    // req.body.index)}`; const stats = await fsPromises.open(filePath, 'w');
    // console.log('writing to file');
    // while (stats.size < 2048000) {
    // await fsPromises.appendFile(filePath, 'test ');
    // }
    // console.log('wrote to file');

    // const receivedFilePath = req.file.path;
    // fs.readFile(receivedFilePath, (err, data) => {
    //   if (err) {
    //     throw err;
    //   }

    // const evaluated_checksum =
    // createHash('md5').update(data).digest('hex'); if (evaluated_checksum
    // !== chunk_checksum) { res.sendStatus(409).json('Expected checksum for
    // chunk did not equal evaluated checksum'); return; }

    //   res.sendStatus(200);
    // });

  res.sendStatus(200)
  }),
);

module.exports = router;
