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

// const logger = require('../services/logger');
const path = require('path');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const datasetService = require('../services/dataset');
const authService = require('../services/auth');
const CONSTANTS = require('../constants');
const logger = require('../services/logger');

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

const buildUserRoleQueryObject = ({
  deleted, type, name, match_name_exact, username,
}) => {
  const query_obj = _.omitBy(_.isUndefined)({
    is_deleted: deleted,
    type,
    name: name ? {
      ...(match_name_exact ? { equals: name } : { contains: name }),
      mode: 'insensitive', // case-insensitive search
    } : undefined,
    // Filter by projects assigned to this user
    projects: {
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
    },
  });

  return query_obj;
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

    const query_obj = buildUserRoleQueryObject({ ...req.query, username: req.params.username });

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
    // res.json('/ user role');
  }),
);

const buildQueryObject = ({
  deleted, archived, staged, type, name, days_since_last_staged,
  has_workflows, has_derived_data, has_source_data,
  created_at_start, created_at_end, updated_at_start, updated_at_end,
  match_name_exact,
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

  return query_obj;
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

    // console.log('req.user.roles', req.user.roles);

    const query_obj = buildQueryObject(req.query);

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

// todo - register routes specific to dataset uploads optionally based on verifyUploadEnabledForRole middleware
function verifyUploadEnabledForRole(req, res, next) {
  // Check if enabled_features is defined
  if (!config.enabled_features) {
    logger.info('enabled_features is not defined in the config. Feature will be enabled by default');
    return next();
  }

  const upload_enabled = config.enabled_features.upload;

  // Check if upload feature is defined
  if (upload_enabled == null) {
    logger.info('Upload feature is not defined in the config. Feature will be enabled by default');
    return next();
  }

  // Check if upload feature is a boolean `true`
  if (upload_enabled === true) {
    logger.info('Upload feature is enabled');
    return next(); // Allow all roles if upload is set to `true`
  }

  // Check if upload feature is boolean `false`
  if (upload_enabled === false) {
    logger.warn('Upload feature is disabled');
    return next(createError.Forbidden());
  }

  // Check if upload feature is an object
  if (typeof upload_enabled !== 'object') {
    logger.error('Invalid config for enabling dataset uploads');
    return next(createError.Forbidden());
  }

  const upload_enabled_for_roles = upload_enabled.enabled_for_roles;

  // Check if enabled_for_roles is an array
  if (!Array.isArray(upload_enabled_for_roles)) {
    logger.error('Invalid config for enabling dataset uploads: enabled_for_roles is not an array');
    return next(createError.Forbidden());
  }

  // Check if enabled_for_roles is empty
  if (upload_enabled_for_roles.length === 0) {
    logger.error('No roles specified for enabling dataset uploads');
    return next(createError.Forbidden());
  }

  // Check if user has one of the allowed roles
  const isUploadEnabledForUser = upload_enabled_for_roles.some(
    (role) => req.user.roles.includes(role),
  );

  if (!isUploadEnabledForUser) {
    logger.error('Upload feature is not enabled for this user');
    return next(createError.Forbidden());
  }

  next();
}

// Used by:
//  - UI
//  - Workers
router.get(
  '/uploads',
  verifyUploadEnabledForRole,
  validate([
    query('status').isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)).optional(),
    query('dataset_name').notEmpty().escape().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    query('include_create_log').toBoolean().default(false),

  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Retrieve past uploads'

    const {
      status, dataset_name, offset, limit,
    } = req.query;

    const query_obj = {
      where: _.omitBy(_.isUndefined)({
        status,
        dataset_create_log: {
          dataset: {
            name: { contains: dataset_name },
          },
        },
      }),
    };
    const filter_query = {
      skip: offset,
      take: limit,
      ...query_obj,
    };

    const [dataset_upload_logs, count] = await prisma.$transaction([
      prisma.upload_log.findMany({
        ...filter_query,
        include: CONSTANTS.INCLUDE_DATASET_UPLOADS,
        orderBy: {
          dataset_create_log: {
            created_at: 'desc',
          },
        },
      }),
      prisma.upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
  }),
);

// Used by UI
router.get(
  '/:username/uploads',
  verifyUploadEnabledForRole,
  validate([
    query('status').isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)).optional(),
    query('dataset_name').notEmpty().escape().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    param('username').escape().notEmpty(),
    query('include_create_log').toBoolean().default(false),
  ]),
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Retrieve past uploads for a specific user'

    const {
      status, dataset_name, offset, limit,
    } = req.query;

    const query_obj = {
      where: _.omitBy(_.isUndefined)({
        status,
        dataset_create_log: {
          dataset: {
            name: { contains: dataset_name },
          },
          creator: {
            username: req.params.username,
          },
        },
      }),
    };
    const filter_query = {
      skip: offset,
      take: limit,
      ...query_obj,
    };

    const [dataset_upload_logs, count] = await prisma.$transaction([
      prisma.upload_log.findMany({
        ...filter_query,
        include: CONSTANTS.INCLUDE_DATASET_UPLOADS,
        orderBy: {
          dataset_create_log: {
            created_at: 'desc',
          },
        },
      }),
      prisma.upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
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
    query('include_create_log').toBoolean().optional(),
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
      include_create_log: req.query.include_create_log || false,
    });

    res.json(dataset);
  }),
);

function normalize_name(name) {
  // replace all character other than a-z, 0-9, _ and - with -
  // replace consecutive hyphens with one -

  return (name || '')
    .replaceAll(/[\W]/g, '-')
    .replaceAll(/-+/g, '-');
}

/**
 * Generates a Prisma query object for creating a new dataset.
 *
 * @function getDatasetCreateQuery
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
const getDatasetCreateQuery = (data) => {
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
        assignor_id: user_id,
      }],
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

  // Log the Action taken. For dataset-creation, the action is CREATE.
  create_query.audit_logs = {
    create: [
      {
        action: CONSTANTS.DATASET_ACTIONS.CREATE,
        user_id,
      },
    ],
  };

  return create_query;
};

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
      // #swagger.description = 'workflow_id is optional.
      // If the request body has workflow_id,
      // a new relation is created between dataset and given
      // workflow_id'
      //
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

    const createQuery = getDatasetCreateQuery({
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
      .map((d) => getDatasetCreateQuery(d));

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
  uploadedDataset.workflows = await datasetService.get_dataset_active_workflows({ dataset });

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
    requestedWorkflowInitiated = await datasetService.create_workflow(
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
      CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD,
      CONSTANTS.WORKFLOWS.CANCEL_DATASET_UPLOAD,
    ]),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and start a workflow and associate it.
    // Allowed workflows are stage, integrated, process_dataset_upload, and cancel_dataset_upload.

    const wf_name = req.params.wf;

    const dataset = await datasetService.get_dataset({
      id: req.params.id,
      workflows: true,
    });

    if (!dataset) {
      return next(createError(404, 'Dataset not found'));
    }

    if (wf_name === CONSTANTS.WORKFLOWS.INTEGRATED
          || wf_name === CONSTANTS.WORKFLOWS.STAGE) {
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
    }

    if (wf_name === CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD
          || wf_name === CONSTANTS.WORKFLOWS.CANCEL_DATASET_UPLOAD) {
      verifyUploadEnabledForRole(req, res, (err) => {
        if (err) {
          return next(err);
        }
        // Continue with the workflow initiation
        initiateUploadWorkflow({
          dataset,
          requestedWorkflow: wf_name,
          user: req.user,
        }).then(({ workflowInitiated, workflowInitiationError }) => {
          if (workflowInitiated) {
            return res.json(workflowInitiated);
          }
          next(createError.InternalServerError(workflowInitiationError));
        }).catch(next);
      });
      // return workflowInitiated
      //   ? res.json(workflowInitiated)
      //   : next(createError.InternalServerError(workflowInitiationError));
    } else {
      return next(createError(400, 'Invalid workflow type'));
    }
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
        : `${datasetService.get_bundle_name(dataset)}`;
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
    const normalizedName = normalize_name(req.params.name);

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

const getUploadedDatasetPath = ({ datasetId = null, datasetType = null } = {}) => path.join(
  config.upload.path,
  datasetType.toLowerCase(),
  `${datasetId}`,
  'processed',
);

// - Register an uploaded dataset in the system
// - Used by UI
router.post(
  '/upload',
  verifyUploadEnabledForRole,
  isPermittedTo('create'),
  validate([
    body('type').escape().notEmpty().isIn(config.dataset_types),
    body('name').escape().notEmpty().isLength({ min: 3 }),
    body('src_dataset_id').optional().isInt().toInt(),
    body('files_metadata').isArray(),
    body('project_id').optional(),
    body('src_instrument_id').optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Register an uploaded dataset in the system'

    const {
      project_id, src_instrument_id, src_dataset_id, name, type, files_metadata,
    } = req.body;

    const datasetCreateQuery = getDatasetCreateQuery({
      name,
      type,
      create_method: CONSTANTS.DATASET_CREATE_METHODS.UPLOAD,
      project_id,
      user_id: req.user.id,
      src_instrument_id,
      src_dataset_id,
    });

    const upload_log = await prisma.$transaction(async (tx) => {
      const createdDataset = await datasetService.createDatasetInTransaction(tx, datasetCreateQuery);

      const dataset_upload_log = await tx.upload_log.create({
        data: {
          status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
          files: {
            create: files_metadata.map((file) => ({
              name: file.name,
              md5: file.checksum,
              num_chunks: file.num_chunks,
              path: file.path,
              status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
            })),
          },
        },
        select: { id: true },
      });

      const dataset_create_log = await tx.dataset_create_log.create({
        data: {
          create_method: CONSTANTS.DATASET_CREATE_METHODS.UPLOAD,
          creator: { connect: { id: req.user.id } },
          ...(src_instrument_id && { src_instrument: { connect: { id: src_instrument_id } } }),
          dataset: { connect: { id: createdDataset.id } },
          // Prisma does not connect the upload_log row to dataset_create_log row despite providing the upload_log_id
          // foreign key to the dataset_create_log row. As a result,
          // the upload_log_id on the dataset_create_log row needs to be manually set (se below).
          upload_log_id: dataset_upload_log.id,
        },
        select: { id: true },
      });

      // manually set the upload_log_id on the dataset_create_log row,
      // since Prisma does not natively connect the upload_log row to dataset_create_log row when a dataset_create_row
      // is created.
      await tx.upload_log.update({
        where: { id: dataset_upload_log.id },
        data: {
          dataset_create_log_id: dataset_create_log.id,
        },
      });

      await tx.dataset.update({
        where: { id: createdDataset.id },
        data: {
          origin_path: getUploadedDatasetPath({ datasetId: createdDataset.id, datasetType: type }),
        },
      });

      const updated_dataset_upload_log = await tx.upload_log.findUnique({
        where: { id: dataset_upload_log.id },
        include: {
          dataset_create_log: {
            include: {
              dataset: {
                select: {
                  id: true,
                  origin_path: true,
                },
              },
            },
          },
          files: {
            select: {
              name: true,
              path: true,
              md5: true,
            },
          },
        },
      });

      return updated_dataset_upload_log;
    });

    res.json(upload_log);
  }),
);

// - Update the metadata related to a dataset upload event
// - Used by UI, workers
router.patch(
  '/:id/upload',
  verifyUploadEnabledForRole,
  /**
     * A user can only update metadata related to a dataset upload if one of the
     * following two` conditions are met:
     *   - The user has either the `admin` or the `operator` role
     *   - The user has the `user` role, and they are the one who uploaded this dataset.
     * This is checked by the `isPermittedTo` middleware.
     */
  isPermittedTo(
    'update',
    { checkOwnership: true },
    async (req, res, next) => { // resourceOwnerFn
      try {
        console.log(`Patching dataset upload with id: ${req.params.id}`);
        console.log('dataset_id', req.params.id);
        console.log('parseInt(req.params.id, 10)', parseInt(req.params.id, 10));
        const dataset_creator = await datasetService.get_dataset_creator({ dataset_id: parseInt(req.params.id, 10) });
        return dataset_creator.username;
      } catch (error) {
        logger.error(error);
        return next(createError.InternalServerError());
      }
    },
  ),
  validate([
    param('id').isInt().toInt(),
    body('status').notEmpty().escape().optional(),
    body('files').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Update the metadata related to a dataset upload event'

    const { status, files = [] } = req.body;
    const upload_log_update_query = _.omitBy(_.isUndefined)({
      status,
    });

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      const uploaded_dataset = await tx.dataset.findUnique({
        where: {
          id: req.params.id,
        },
        include: {
          create_log: {
            select: {
              upload_log_id: true,
            },
          },
        },
      });

      const { create_log } = uploaded_dataset;

      if (Object.entries(upload_log_update_query).length > 0) {
        await tx.upload_log.update({
          where: { id: create_log.upload_log_id },
          data: upload_log_update_query,
        });
      }

      if (files.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const f of files) {
          // eslint-disable-next-line no-await-in-loop
          await tx.file_upload_log.update({
            where: { id: f.id },
            data: f.data,
          });
        }
      }

      const upload_log = await tx.upload_log.findUniqueOrThrow({
        where: { id: create_log.upload_log_id },
        // include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });

      return upload_log;
    });

    res.json(dataset_upload_log);
  }),
);

module.exports = router;
