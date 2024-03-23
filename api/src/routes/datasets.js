const fsPromises = require('fs/promises');

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const {
  query, param, body, checkSchema,
} = require('express-validator');
const multer = require('multer');
const _ = require('lodash/fp');
const config = require('config');

// const logger = require('../services/logger');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl, getPermission } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const datasetService = require('../services/dataset');
const authService = require('../services/auth');

const isPermittedTo = accessControl('datasets');

const router = express.Router();
const prisma = new PrismaClient(
  // { log: ['query', 'info', 'warn', 'error'] },

  {
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
      {
        emit: 'event',
        level: 'error',
      },
    ],
  },
);

// ['query', 'info', 'warn', 'error'].forEach((level) => {
//   prisma.$on(level, async (e) => {
//     console.log(`QUERY: ${e.query}`);
//     console.log(`PARAMS: ${e.params}`);
//   });
// });

router.post(
  '/:id/action-item',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('action_item').isObject(),
    body('notification').isObject(),
    body('next_state').escape().notEmpty().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // next_state - optional param provided if dataset's state needs to be
    // updated as part of the action item's creation
    const { action_item, notification, next_state } = req.body;

    console.dir(req.body, { depth: null });

    const createQueries = [
      prisma.dataset_action_item.create({
        data: {
          type: action_item.type,
          title: action_item.title,
          text: action_item.text,
          to: action_item.to,
          metadata: action_item.metadata,
          dataset: {
            connect: {
              id: req.params.id,
            },
          },
          ingestion_checks: {
            createMany: { data: action_item.ingestion_checks },
          },
          notification: {
            create: notification,
          },
        },
      }),
    ];

    if (next_state) {
      // update dataset's state if dataset is supposed to reach another state
      // // after this action item is created
      createQueries.push(prisma.dataset_state.create({
        data: {
          state: next_state,
          dataset: {
            connect: {
              id: action_item.dataset_id,
            },
          },
        },
      }));
    }

    const [created_action_item] = await prisma.$transaction(createQueries);

    res.json(created_action_item);
  }),
);

router.patch(
  '/:id/action-item/:action_item_id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    param('action_item_id').isInt().toInt(),
    body('ingestion_checks').optional().isArray(),
    body('next_state').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // next_state - optional param provided if dataset's state needs to be
    // updated as part of the action item's creation
    const { ingestion_checks = [] } = req.body;

    const updatedDataset = await prisma.dataset.update({
      where: {
        id: req.params.id,
      },
      data: {
        action_items: {
          update: {
            where: {
              id: req.params.action_item_id,
            },
            data: {
              ingestion_checks: {
                createMany: { data: ingestion_checks },
              },
            },
          },
        },
        states: req.body.next_state ? {
          createMany: {
            data: [
              {
                state: req.body.next_state,
              },
            ],
          },
        } : undefined,
      },
    });

    res.json(updatedDataset);
  }),
);

router.get(
  '/action-items',
  isPermittedTo('update'),
  validate([
    query('type').escape().notEmpty().isIn([config.DATASET_ACTION_ITEM_TYPES.DUPLICATE_DATASET_INGESTION]),
    query('active').optional().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    const filterQuery = _.omitBy(_.isUndefined)({
      type: req.query.type,
      active: req.query.active || true,
    });

    const actionItems = await prisma.dataset_action_item.findMany({
      where: filterQuery,
      include: {
        dataset: {
          include: {
            states: {
              orderBy: {
                timestamp: 'desc',
              },
            },
          },
        },
      },
    });

    res.json(actionItems);
  }),
);

router.get(
  '/action-items/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const actionItem = await prisma.dataset_action_item.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        ingestion_checks: true,
        dataset: {
          include: {
            states: {
              orderBy: {
                timestamp: 'desc',
              },
            },
          },
        },
      },
    });

    res.json(actionItem);
  }),
);

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
  deleted, processed, archived, staged, is_duplicate, type, name, days_since_last_staged,
}) => {
  const query_obj = _.omitBy(_.isUndefined)({
    is_deleted: deleted,
    archive_path: archived ? { not: null } : undefined,
    is_staged: staged,
    is_duplicate,
    type,
    name: name ? {
      contains: name,
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
// filtered and sorted by the criteria specified. Used by workers + UI.
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('deleted').toBoolean().default(false),
    query('processed').toBoolean().optional(),
    query('archived').toBoolean().optional(),
    query('staged').toBoolean().optional(),
    query('is_duplicate').toBoolean().optional(),
    query('type')
      .isIn(config.dataset_types)
      .optional(),
    query('name').notEmpty().escape().optional(),
    query('days_since_last_staged').isInt().toInt().optional(),
    query('limit').isInt().toInt().optional(),
    query('offset').isInt().toInt().optional(),
    query('sortBy').isObject().optional(),
    query('bundle').optional().toBoolean(),
    query('include_action_items').optional().toBoolean(),
    query('include_duplications').optional().toBoolean(),
    query('include_states').toBoolean().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']

    const sortBy = req.query.sortBy || {};

    const query_obj = buildQueryObject({
      deleted: req.query.deleted,
      processed: req.query.processed,
      archived: req.query.archived,
      staged: req.query.staged,
      is_duplicate: req.query.is_duplicate || false,
      type: req.query.type,
      name: req.query.name,
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
        source_datasets: true,
        derived_datasets: true,
        bundle: req.query.bundle || false,
        action_items: req.query.include_action_items || false,
        states: req.query.include_states || false,
        ...(req.query.include_duplications && { ...datasetService.INCLUDE_DUPLICATIONS }),
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

// Currently, operators and admins are allowed to delete any datasets.
const dataset_delete_check = asyncHandler(async (req, res, next) => {
  // assumes req.params.id is the dataset id user is requesting
  // access check
  const permission = getPermission({
    resource: 'datasets',
    action: 'delete',
    requester_roles: req?.user?.roles,
  });
  if (!permission.granted) {
    return next(createError.Forbidden());
  }
  next();
});

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
    query('include_duplications').toBoolean().optional(),
    query('include_action_items').toBoolean().optional(),
  ]),
  dataset_access_check,
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
      include_duplications: req.query.include_duplications || false,
      include_action_items: req.query.include_action_items || false,
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
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Create a new dataset.'
    /*
    * #swagger.description = 'workflow_id is optional. If the request body has
    * workflow_id,
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
      },
    });
    res.json(dataset);
  }),
);

router.post(
  '/:id/duplicate',
  isPermittedTo('create'),
  validate([
    param('id').isInt().toInt(),
    body('action_item').optional().isObject(),
    body('notification').optional().isObject(),
    body('next_state').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Create a duplicate dataset.'

    const { next_state } = req.body;

    let {
      action_item, notification,
    } = req.body;

    console.dir(req.body, { depth: null });

    const originalDataset = await prisma.dataset.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!action_item) {
      action_item = {
        type: 'DUPLICATE_DATASET_INGESTION',
        metadata: {
          original_dataset_id: req.params.id,
        },
      };
    }

    if (!notification) {
      notification = {
        type: 'INCOMING_DUPLICATE_DATASET',
        label: 'Duplicate Dataset Created',
        text: `Dataset ${originalDataset.name} has been duplicated. Click here to review.`,
      };
    }

    // const createQuery = {}

    // check if other duplicates for this dataset exist in the system already
    const existingDuplicates = await prisma.dataset.findMany({
      where: {
        name: originalDataset.name,
        type: originalDataset.type,
        is_deleted: false,
        is_duplicate: true,
      },
      orderBy: {
        version: 'desc',
      },
    });
    // if so, find the most recent duplicate (the one with the highest
    // version), to determine the version to be assigned to the current
    // duplicate dataset
    const latestDuplicateVersion = existingDuplicates[0]?.version;

    // const matchingDatasets = await prisma.dataset.findMany({
    //   where: {
    //     name: dataset.name,
    //     type: dataset.type,
    //     is_deleted: false,
    //     is_duplicate: false,
    //   },
    // });

    // if (matchingDatasets.length !== 1) {
    // return next(createError.NotFound(`Expected to find one active (not
    // deleted) original ${dataset.type} named ${dataset.name}, but found
    // ${matchingDatasets.length}.`)); }

    // const originalDataset = matchingDatasets[0];

    // Defaulting version to `undefined` allows Prisma to default it to 1

    const createQueries = [];

    createQueries.push(prisma.dataset.create({
      data: {
        name: originalDataset.name,
        type: originalDataset.type,
        description: originalDataset.description,
        origin_path: originalDataset.origin_path,
        is_duplicate: true,
        version: existingDuplicates.length > 0 ? latestDuplicateVersion + 1 : undefined,
        duplicated_from: {
          create: {
            original_dataset_id: req.params.id,
          },
        },
        states: {
          create: [
            {
              state: next_state || 'DUPLICATE_REGISTERED',
            },
          ],
        },
        action_items: {
          create: [
            {
              type: action_item.type,
              title: action_item.title,
              text: action_item.text,
              to: action_item.to,
              metadata: action_item.metadata,
              notification: {
                create: notification,
              },
            },
          ],
        },
      },
      include: {
        ...datasetService.INCLUDE_WORKFLOWS,
      },
    }));

    // createQueries.push(prisma.dataset_action_item.create({
    //   data: {
    //     type: action_item.type,
    //     title: action_item.title,
    //     text: action_item.text,
    //     to: action_item.to,
    //     metadata: action_item.metadata,
    //     // dataset: {
    //     //   connect: {
    //     //     id: req.params.id,
    //     //   },
    //     // },
    //     ingestion_checks: {
    //       createMany: { data: action_item.ingestion_checks },
    //     },
    //     notification: {
    //       create: notification,
    //     },
    //   },
    // }));

    const [createdDuplicate] = await prisma.$transaction(createQueries);

    res.json(createdDuplicate);
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

const workflow_access_check = (req, res, next) => {
  // The workflows that a user is allowed to run depends on their role
  // allowed_wfs is an object with keys as workflow names and values as true
  // filter only works on objects not arrays, so we use an object with true
  // value

  // user role can only run wf on the datasets they can access through project
  // associations
  const allowed_wfs = req.permission.filter({ [req.params.wf]: true });
  if (allowed_wfs[req.params.wf]) {
    return next();
  }
  next(createError.Forbidden());
};

// Launch a workflow on the dataset - UI
router.post(
  '/:id/workflow/:wf',
  accessControl('workflow')('create'),
  validate([
    param('id').isInt().toInt(),
    param('wf').isIn(['stage', 'integrated']),
  ]),
  workflow_access_check,
  dataset_access_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and start a workflow and associate it.
    // Allowed names are stage, integrated

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
        : `${dataset.metadata.bundle_alias}`;

      const download_token = await authService.get_download_token(download_file_path);

      const url = new URL(download_file_path, config.get('download_server.base_url'));
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

router.post(
  '/duplicates/:duplicate_dataset_id/workflow/:wf',
  accessControl('workflow')('create'),
  validate([
    param('duplicate_dataset_id').isInt().toInt(),
    param('wf').isIn(['accept_duplicate_dataset', 'reject_duplicate_dataset']),
  ]),
  workflow_access_check,
  dataset_delete_check,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Replace an existing dataset with its duplicate
    // dataset, and create and start a workflow to accept or reject a duplicate
    // dataset.

    // let updatedDataset;
    //
    // if (req.params.wf === 'accept_duplicate_dataset') {
    //   // get accepted dataset
    //   try {
    //     updatedDataset = await datasetService.accept_duplicate({
    //       duplicate_dataset_id: req.params.duplicate_dataset_id,
    //       accepted_by_id: req.user.id,
    //     });
    //   } catch (e) {
    //     return next(createError.BadRequest(e.message));
    //   }
    // } else if (req.params.wf === 'reject_duplicate_dataset') {
    //   // get rejected dataset
    //   try {
    //     updatedDataset = await datasetService.reject_duplicate({
    //       duplicate_dataset_id: req.params.duplicate_dataset_id,
    //       rejected_by_id: req.user.id,
    //     });
    //   } catch (e) {
    //     return next(createError.BadRequest(e.message));
    //   }
    // }

    // console.log('updatedDataset');
    // console.dir(updatedDataset, { depth: null });

    const duplicate_dataset = await datasetService.get_dataset({
      id: req.params.duplicate_dataset_id,
      workflows: true,
      include_action_items: true,
    });

    const duplication_action_item = duplicate_dataset.action_items.find((item) => item.type === 'DUPLICATE_DATASET_INGESTION');
    await prisma.dataset_action_item.update({
      where: {
        id: duplication_action_item.id,
      },
      data: {
        status: 'ACKNOWLEDGED',
        notification: {
          update: {
            status: 'ACKNOWLEDGED',
          },
        },
      },
    });

    // This kicks off a workflow, which then makes another call to the API to
    // accept/reject the duplicate dataset. This second call to the API is where
    // the states of the original and the duplicates datasets are validated,
    // after which the duplicate is either accepted or rejected. The workflow
    // is launched first to allow a failed acceptance/rejection to be resumed
    // from the UI.
    const wf_name = req.params.wf;
    const wf = await datasetService.create_workflow(duplicate_dataset, wf_name);
    return res.json(wf);
  }),
);

router.patch(
  '/duplicates/:duplicate_dataset_id/accept/initiate',
  validate([
    param('duplicate_dataset_id').isInt().toInt(),
  ]),
  dataset_delete_check,
  asyncHandler(async (req, res, next) => {
    // todo - put locks
    let duplicateBeingAccepted;
    // try {
    duplicateBeingAccepted = await datasetService.initiate_duplicate_acceptance({
      duplicate_dataset_id: req.params.duplicate_dataset_id,
      accepted_by_id: req.user.id,
    });
    // } catch (e) {
    //   return next(createError.BadRequest(e.message));
    // }

    res.json(duplicateBeingAccepted);
  }),
);

router.patch(
  '/duplicates/:duplicate_dataset_id/accept/complete',
  validate([
    param('duplicate_dataset_id').isInt().toInt(),
  ]),
  dataset_delete_check,
  asyncHandler(async (req, res, next) => {
    let updatedDataset;
    try {
      updatedDataset = await datasetService.complete_duplicate_acceptance({
        duplicate_dataset_id: req.params.duplicate_dataset_id,
        accepted_by_id: req.user.id,
      });
    } catch (e) {
      return next(createError.BadRequest(e.message));
    }

    res.json(updatedDataset);
  }),
);

router.patch(
  '/duplicates/:duplicate_dataset_id/reject/initiate',
  validate([
    param('duplicate_dataset_id').isInt().toInt(),
  ]),
  dataset_access_check,
  dataset_delete_check,
  asyncHandler(async (req, res, next) => {
    let updatedDataset;
    try {
      updatedDataset = await datasetService.reject_duplicate({
        duplicate_dataset_id: req.params.duplicate_dataset_id,
        accepted_by_id: req.user.id,
      });
    } catch (e) {
      return next(createError.BadRequest(e.message));
    }

    res.json(updatedDataset);
  }),
);

module.exports = router;
