const fsPromises = require('fs/promises');
const express = require('express');
const { PrismaClient, Prisma } = require('@prisma/client');
const createError = require('http-errors');
const {
  query, param, body, checkSchema,
} = require('express-validator');
const multer = require('multer');
const _ = require('lodash/fp');
const config = require('config');
const pm = require('picomatch');
const he = require('he');

const path = require('path');
const utils = require('../../utils');
const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');
const { validate } = require('../../middleware/validators');
const datasetService = require('../../services/dataset');
const authService = require('../../services/auth');
const CONSTANTS = require('../../constants');
const logger = require('../../services/logger');

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

router.get(
  '/:username/all',
  isPermittedTo('read', { checkOwnership: true }),
  query('deleted').toBoolean().default(false),
  query('type').isIn(config.dataset_types).optional(),
  query('name').notEmpty().optional(),
  query('limit').isInt({ min: 1 }).toInt().optional(), // optional because watch script needs all datasets at once
  query('offset').isInt({ min: 0 }).toInt().optional(),
  query('sort_by').default('updated_at'),
  query('sort_order').default('desc').isIn(['asc', 'desc']),
  query('match_name_exact').default(false).toBoolean(),

  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']

    const query_obj = datasetService.buildDatasetsFetchQuery({ ...req.query, username: req.params.username });

    const filterQuery = {
      where: query_obj,
    };
    const orderBy = {
      [req.query.sort_by]: req.query.sort_order,
    };
    const datasetRetrievalQuery = {
      skip: req.query.offset,
      take: req.query.limit,
      ...filterQuery,
      orderBy,
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
// filtered and sorted by the criteria specified. Used by workers + UI.
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('deleted').toBoolean().default(false),
    query('has_workflows').toBoolean().optional(),
    query('has_derived_data').toBoolean().optional(),
    query('has_source_data').toBoolean().optional(),
    query('archived').toBoolean().optional(),
    query('staged').toBoolean().optional(),
    query('type').isIn(config.dataset_types).optional(),
    query('name').notEmpty().optional(),
    query('days_since_last_staged').isInt().toInt().optional(),
    query('bundle').optional().toBoolean(),
    query('created_at_start').isISO8601().optional(),
    query('created_at_end').isISO8601().optional(),
    query('updated_at_start').isISO8601().optional(),
    query('updated_at_end').isISO8601().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(), // optional because watch script needs all datasets at once
    query('offset').isInt({ min: 0 }).toInt().optional(),
    query('sort_by').default('updated_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('match_name_exact').default(false).toBoolean(),
    query('include_states').toBoolean().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']

    const query_obj = datasetService.buildDatasetsFetchQuery(req.query);

    const filterQuery = { where: query_obj };
    const orderBy = {
      [req.query.sort_by]: req.query.sort_order,
    };
    const datasetRetrievalQuery = {
      skip: req.query.offset,
      take: req.query.limit,
      ...filterQuery,
      orderBy,
      include: {
        ...CONSTANTS.INCLUDE_WORKFLOWS,
        source_datasets: true,
        derived_datasets: true,
        bundle: req.query.bundle || false,
        states: req.query.include_states || false,
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
    query('include_projects').optional().toBoolean(),
    query('initiator').optional().toBoolean(),
    query('include_source_instrument').toBoolean().optional(),
  ]),
  datasetService.dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // only select path and md5 columns from the dataset_file table if files is
    // true

    const dataset = await datasetService.get_dataset({
      id: req.params.id,
      files: req.query.files,
      workflows: req.query.workflows,
      last_task_run: req.query.last_task_run,
      prev_task_runs: req.query.prev_task_runs,
      only_active: req.query.only_active,
      bundle: req.query.bundle || false,
      includeProjects: req.query.include_projects || false,
      initiator: req.query.initiator || false,
      include_source_instrument: req.query.include_source_instrument || false,
    });

    res.json(dataset);
  }),
);

// Create a new dataset
// Used by - workers + UI
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('name').notEmpty(),
    body('type').isIn(config.get('dataset_types')),
    body('origin_path').notEmpty(),
    body('du_size').optional().notEmpty().customSanitizer(BigInt), // convert to BigInt
    body('size').optional().notEmpty().customSanitizer(BigInt),
    body('bundle_size').optional().notEmpty().customSanitizer(BigInt),
    body('origin_path').notEmpty().escape(),
    body('project_id').optional(),
    body('src_instrument_id').optional(),
    body('src_dataset_id').optional(),
    body('create_method').optional(),
    body('workflow_id').optional(),
    body('state').optional(),
    body('metadata').optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Create a new dataset.'
    /* eslint-disable */
      /*
        * #swagger.description = 'workflow_id is optional. If the request body has
        * workflow_id, a new relation is created between dataset and given
        * workflow_id'
        */
      /* eslint-enable */

    const {
      ingestion_space, create_method, project_id, src_instrument_id, src_dataset_id,
      name, type, origin_path, du_size, size, bundle_size, workflow_id, state, metadata,
    } = req.body;

    // remove any HTML entities inserted by browser because of URL encoding
    const decoded_origin_path = he.decode(origin_path);

    if (ingestion_space) {
      // if dataset's origin_path is a restricted for dataset creation, throw error
      const restricted_ingestion_dirs = config.restricted_ingestion_dirs[ingestion_space].split(',');
      const is_origin_path_restricted = restricted_ingestion_dirs.some((glob) => {
        const isMatch = pm(glob);
        const matches = isMatch(decoded_origin_path, glob);
        return matches.isMatch;
      });
      if (is_origin_path_restricted) {
        return next(createError.Forbidden({
          message: `Ingestion space ${ingestion_space} is restricted for dataset creation`,
        }));
      }
    }

    const createQuery = datasetService.buildDatasetCreateQuery({
      name,
      type,
      du_size,
      origin_path: decoded_origin_path,
      size,
      bundle_size,
      workflow_id,
      project_id,
      user_id: req.user.id,
      src_instrument_id,
      src_dataset_id,
      state,
      create_method,
      metadata,
    });

    // idempotence: creates dataset or returns error 409 on repeated requests
    // If many concurrent transactions are trying to create the same dataset, only one will succeed
    // will return dataset if successful, otherwise will return 409 so that client can handle next steps accordingly
    const dataset = await datasetService.createDataset(createQuery);

    if (dataset) res.json(dataset);
    else next(createError.Conflict('Unique constraint failed'));
  }),
);

// create many - worker
router.post(
  '/bulk',
  isPermittedTo('create'),
  validate([
    body('datasets').isArray({ min: 1, max: 100 }),
    body('datasets.*.name').notEmpty(),
    body('datasets.*.type').isIn(config.get('dataset_types')),
    body('datasets.*.origin_path').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    /* eslint-disable */

      // #swagger.tags = ['datasets']
      // #swagger.summary = 'Create multiple datasets.'
      /* #swagger.description =
            This endpoint is used to create multiple datasets in a single request.
            It is useful for bulk uploading datasets.
        */

      /* #swagger.requestBody = {
            "description": "Array of datasets to be created",
            "required": true,
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "datasets": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": "string",
                                        "type": "string",
                                        "origin_path": "string",
                                        "metadata": "object",
                                    },
                                    "required": ["name", "type", "origin_path"]
                                },
                                "minItems": 1,
                                "maxItems": 100
                            }
                        },
                        "required": ["datasets"]
                    }
                }
            }
        } */

      /* #swagger.responses[200] = {
            "description": "Array of datasets created",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "created": {
                                "type": "array",
                                "items": {
                                    "$ref": "#/components/schemas/Dataset"
                                }
                            },
                            "conflicted": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": "string",
                                        "type": "string"
                                    },
                                    "required": ["name", "type"]
                                }
                            },
                            "errored": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": "string",
                                        "type": "string"
                                    },
                                    "required": ["name", "type"]
                                }
                            }
                        }
                    }
                }
            }
        } */
      /* eslint-enable */

    const data = req.body.datasets
      .map((d) => datasetService.buildDatasetCreateQuery(d));

    // create in separate transactions to avoid deadlocks
    const results = await Promise.allSettled(data.map((d) => datasetService.createDataset(d)));

    // separate results into created and failed
    const created = [];
    const conflicted = [];
    const errored = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value) created.push(result.value);
        else conflicted.push(_.pick(['name', 'type'])(data[index]));
      } else if (result.reason instanceof Prisma.PrismaClientKnownRequestError && result.reason?.code === 'P2002') {
        // P2002 - Unique constraint failed
        conflicted.push(_.pick(['name', 'type'])(data[index]));
      } else {
        logger.warn('Error creating dataset', JSON.stringify({ dataset: data[index], error: result.reason }));
        errored.push(_.pick(['name', 'type'])(data[index]));
      }
    });
    res.json({
      created,
      conflicted,
      errored,
    });
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
    /* eslint-disable */
      // #swagger.tags = ['datasets']
      // #swagger.summary = 'Modify dataset.'
      /* #swagger.description =
              To add files use POST "/datasets/:id/files"
              To add workflow use POST "/datasets/:id/workflows"
              To add state use POST "/datasets/:id/state"
          */
      /* eslint-enable */

    const datasetToUpdate = await prisma.dataset.findFirst({
      where: {
        id: req.params.id,
      },
    });
    if (!datasetToUpdate) {
      return next(createError(404));
    }

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
        ...CONSTANTS.INCLUDE_WORKFLOWS,
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
    datasetService.add_files({ dataset_id: req.params.id, data });

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
        initiator_id: req.user.id,
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
  // Verify if this user is allowed to initiate the requested workflow on
  // the requested dataset.
  datasetService.workflow_access_check,
  validate([
    param('id').isInt().toInt(),
    param('wf').isIn([
      CONSTANTS.WORKFLOWS.INTEGRATED,
      CONSTANTS.WORKFLOWS.STAGE,
    ]),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and start a workflow and associate it.
    // Allowed workflows are `Stage` and `Integrated`.

    const wf_name = req.params.wf;

    const dataset = await datasetService.get_dataset({
      id: req.params.id,
      workflows: true,
    });

    if (!dataset) {
      return next(createError(404, 'Dataset not found'));
    }

    // if (wf_name === CONSTANTS.WORKFLOWS.INTEGRATED
    //       || wf_name === CONSTANTS.WORKFLOWS.STAGE) {
    // If staging a dataset Log the staging attempt first.
    if (wf_name === CONSTANTS.WORKFLOWS.STAGE) {
      try {
        await prisma.stage_request_log.create({
          data: {
            dataset_id: req.params.id,
            user_id: req.user.id,
          },
        });
      } catch (e) {
        logger.error('Error creating stage request log', e);
        return next(createError(500, 'Error creating stage request log'));
        // console.log()
      }
    }
    logger.info(`Starting workflow ${wf_name} on dataset ${dataset.id}`);
    const wf = await datasetService.create_workflow(dataset, wf_name, req.user.id);
    return res.json(wf);
    // }
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
  datasetService.dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get a list of files and directories under basepath

    const files = await datasetService.files_ls({
      dataset_id: req.params.id,
      base: req.query.basepath,
    });
      // cache indefinitely - 1 year
      // use ui/src/config.js file_browser.cache_busting_id to invalidate cache
      // if a need arises
    res.set('Cache-control', 'private, max-age=31536000');
    res.json(files);
  }),
);

router.get(
  '/:id/filetree',
  validate([
    param('id').isInt().toInt(),
  ]),
  datasetService.dataset_access_check,
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
  datasetService.dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get file download URL and token

    if (!config.enabled_features.downloads) {
      return next(createError.Forbidden('The Download feature is currently disabled'));
    }

    const isFileDownload = !!req.query.file_id;

    // Log the data access attempt first.
    // Catch errors to ensure that logging does not get in the way of a token
    // being returned.
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
        : `${datasetService.get_staged_bundle_name(dataset)}`;
      const url = new URL(download_file_path, `${config.get('download_server.base_url')}`);
      // use url.pathname instead of download_file_path to deal with spaces in
      // the file path oauth scope cannot contain spaces
      const download_token = await authService.get_download_token(url.pathname);

      const downloadUrl = new URL(
        `download/${encodeURIComponent(download_file_path)}`,
        config.get('download_server.base_url'),
      );
      res.json({
        url: downloadUrl.href,
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
  datasetService.dataset_access_check,
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

// Used by UI
router.get(
  '/:datasetType/:name/exists',
  validate([
    param('datasetType').escape().notEmpty(),
    param('name').escape().notEmpty(),
    query('deleted').toBoolean().default(false),
  ]),
  accessControl('dataset_name')('read'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Determine if a dataset with a given name exists'

    // Upon registration, the name of a dataset is normalized. Hence, we need to normalize
    // the requested name before checking for the existence of a dataset with this name.
    const normalizedName = datasetService.normalize_name(req.params.name);

    const matchingDataset = await prisma.dataset.findUnique({
      where: {
        name_type_is_deleted: {
          name: normalizedName,
          type: req.params.datasetType,
          is_deleted: req.query.deleted,
        },
      },
    });
    res.json({ exists: !!matchingDataset });
  }),
);

module.exports = router;
