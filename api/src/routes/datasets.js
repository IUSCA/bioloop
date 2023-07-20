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
const prisma = new PrismaClient();

// stats - UI
router.get(
  '/stats',
  isPermittedTo('read'),
  validate([
    query('type').isIn(['RAW_DATA', 'DATA_PRODUCT']).optional(),
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

// get all - worker + UI
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('deleted').toBoolean().optional(),
    query('processed').toBoolean().optional(),
    query('type').isIn(['RAW_DATA', 'DATA_PRODUCT']).optional(),
    query('name').optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    const datasets = await prisma.dataset.findMany({
      where: {
        ...(_.isUndefined(req.query.deleted) ? {} : { is_deleted: req.query.deleted }),
        ...(_.isUndefined(req.query.processed) ? {} : { workflows: ({ [req.query.processed ? 'some' : 'none']: {} }) }),
        ...(req.query.type ? { type: req.query.type } : {}),
        ...(req.query.name ? { name: req.query.name } : {}),
      },
      include: {
        ...datasetService.INCLUDE_WORKFLOWS,
        ...datasetService.INCLUDE_STATES,
        source_datasets: true,
        derived_datasets: true,
      },
    });

    res.json(datasets);
  }),
);

// get by id - worker + UI
router.get(
  '/:id',
  isPermittedTo('read'),
  validate([
    param('id').isInt().toInt(),
    query('files').toBoolean().default(false),
    query('workflows').toBoolean().default(false),
    query('last_task_run').toBoolean().default(false),
    query('prev_task_runs').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // only select path and md5 columns from the dataset_file table if files is true
    const dataset = await datasetService.get_dataset({
      id: req.params.id,
      files: req.query.files,
      workflows: req.query.workflows,
      last_task_run: req.query.last_task_run,
      prev_task_runs: req.query.prev_task_runs,
    });
    if (dataset) {
      res.json(dataset);
    } else {
      next(createError(404));
    }
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

    const dataset = await prisma.dataset.update({
      where: {
        id: req.params.id,
      },
      data,
      include: {
        ...datasetService.INCLUDE_WORKFLOWS,
        ...datasetService.INCLUDE_STATES,
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
    // #swagger.autoBody=true
    // #swagger.autoQuery=true
    // #swagger.autoHeaders=true
    const files = req.body.map((f) => ({
      dataset_id: req.params.id,
      path: f.path,
      md5: f.md5,
      size: BigInt(f.size),
      filetype: f.type,
    }));

    await prisma.dataset_file.createMany({
      data: files,
    });

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
    query('soft_delete').toBoolean().default(true),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = For soft delete, starts a delete archive workflow and
    // marks the dataset as deleted on success. Dataset is hard deleted only when there are no
    // workflow association
    const _dataset = await datasetService.get_dataset({
      id: req.params.id,
      workflows: true,
    });

    if (_dataset) {
      if (req.query.soft_delete) {
        await datasetService.soft_delete(_dataset, req.user?.id);
        res.send();
      } else if ((_dataset.workflows?.length || 0) === 0) {
        // no workflows - safe to delete
        await datasetService.hard_delete(_dataset.id);
        res.send();
      } else {
        next(createError.Conflict('Unable to delete as one or more workflows are associated with this bacth'));
      }
    } else {
      next(createError(404));
    }
  }),
);

// Launch a workflow on the dataset - UI
router.post(
  '/:id/workflow/:wf',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    param('wf').isIn(['stage', 'integrated']),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and start a workflow and associate it.
    // Allowed names are stage, integrated

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
  isPermittedTo('read'),
  validate([
    param('id').isInt().toInt(),
    query('basepath').default(''),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get a list of files and directories under basepath
    const files = await datasetService.files_ls({
      dataset_id: req.params.id,
      base: req.query.basepath,
    });
    // 1 week
    res.set('Cache-control', 'private, max-age=604800');
    res.json(files);
  }),
);

router.get(
  '/:id/filetree',
  isPermittedTo('read'),
  validate([
    param('id').isInt().toInt(),
  ]),
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
  '/:id/files/:file_id/download',
  validate([
    param('id').isInt().toInt(),
    param('file_id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get file download URL and token

    // access check
    const permission = getPermission({
      resource: 'datasets',
      action: 'read',
      requester_roles: req?.user?.roles,
    });
    if (!permission.granted) {
      const projects = await prisma.project.findMany({
        where: {
          users: {
            some: {
              user: {
                username: req.params.username,
              },
            },
          },
          datasets: {
            some: {
              dataset: {
                id: req.params.id,
              },
            },
          },
        },
      });

      if (projects.length === 0) {
        return next(createError.Forbidden());
      }
    }

    const file = await prisma.dataset_file.findUnique({
      where: {
        id: req.params.file_id,
      },
    });

    const download_token = await authService.get_download_token(file.path);

    res.json({
      url: (new URL(file.path, config.get('download_server.base_url'))).href,
      bearer_token: download_token.accessToken,
    });
  }),
);

module.exports = router;
