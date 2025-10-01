const express = require('express');
const _ = require('lodash/fp');
const { query, body, param } = require('express-validator');
const createError = require('http-errors');
const { Prisma } = require('@prisma/client');

const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');
const projectService = require('@/services/project');
const wfService = require('@/services/workflow');
const { setDifference, log_axios_error } = require('@/utils');
const CONSTANTS = require('@/constants');
const prisma = require('@/db');

const isPermittedTo = accessControl('projects');
const router = express.Router();

// router.get(
//   '/:username/:id/slug',
//   asyncHandler(async (req, res, next) => {
//     // #swagger.tags = ['Projects']
//     // #swagger.summary = calculate an unique slug for a name.
//     const slug = await projectService.generate_slug(req.params.name);
//     res.json({
//       slug,
//     });
//   }),
// );

router.get(
  '/all',
  isPermittedTo('read'),
  validate([
    query('take').default(25).isInt().toInt(),
    query('skip').default(0).isInt({ min: 0 }).toInt(),
    query('search').default(''), // Adding search query validation
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('sort_by').default('updated_at').isIn(['name', 'created_at', 'updated_at']),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all projects.
    // #swagger.description = admin and operator roles are allowed and user
    // role is forbidden
    const { search, sort_order, sort_by } = req.query;

    const filters = search
      ? {
        OR: [
          {
            name: {
              contains: search,
              mode: 'insensitive', // Case-insensitive search
            },
          },
          {
            users: {
              some: {
                user: {
                  username: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
          {
            datasets: {
              some: {
                dataset: {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
        ],

      }
      : {};

    const sort_obj = {
      [sort_by]: sort_order,
    };

    const [projects, totalCount] = await prisma.$transaction([
      prisma.project.findMany({
        skip: req.query.skip,
        take: req.query.take,
        orderBy: sort_obj,
        where: filters,
        include: projectService.build_include_object(),
      }),
      prisma.project.count({
        where: filters,
      }), // Count all projects to get total number
    ]);

    res.json({
      metadata: { count: totalCount },
      projects,
    });
  }),
);

router.get(
  '/:id',
  isPermittedTo('read'),
  validate([
    query('include_datasets').default(true).toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get a specific project irrespective of user
    // association. #swagger.description = admin and operator roles are allowed
    // and user role is forbidden
    const { include_datasets } = req.query;

    const project = await prisma.project.findFirstOrThrow({
      where: {
        OR: [
          {
            id: req.params.id,
          },
          {
            slug: req.params.id,
          },
        ],
      },
      include: projectService.build_include_object({ include_datasets }),
    });

    // include workflow objects with dataset
    const wfPromises = (project.datasets || []).map(async (ds) => {
      const { dataset, assigned_at } = ds;
      if (dataset.workflows.length > 0) {
        return wfService.getAll({
          only_active: true,
          last_task_run: false,
          prev_task_runs: false,
          workflow_ids: dataset.workflows.map((x) => x.id),
        }).then((wf_res) => ({
          assigned_at,
          dataset: Object.assign(dataset, { workflows: wf_res.data.results }),
        })).catch((error) => {
          log_axios_error(error);
          return {
            assigned_at,
            dataset: Object.assign(dataset, { workflows: [] }),
          };
        });
      }
      return ds;
    });
    project.datasets = await Promise.all(wfPromises);

    res.json(project);
  }),
);

router.get(
  '/:username/:id/datasets',
  isPermittedTo('read', { checkOwnership: true }),
  validate([
    param('username').trim().notEmpty(),
    query('staged').toBoolean().optional(),
    query('take').isInt().toInt().optional(),
    query('skip').isInt({ min: 0 }).toInt().optional(),
    query('sortBy').isObject().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all datasets associated with a project, with
    // optional params for filtering;
    /* eslint-disable */
      // #swagger.description = user role:
      // can only see datasets if they have access to the
      // project. operator, admin:
      // can see any project's datasets
      /* eslint-enable                                                                */

    const hasProjectAssociation = await projectService.has_project_assoc({
      project_id: req.params.id,
      user_id: req.user.id,
    });

    // has assoc, has only user role              -> allowed
    // has assoc, has operator / admin role       -> allowed
    // no assoc,  has only user role              -> not allowed
    // no assoc,  has operator / admin role       -> allowed
    if (
      !(req.user.roles.includes('operator') || req.user.roles.includes('admin')) && !hasProjectAssociation
    ) {
      return next(createError(403)); // Forbidden
    }

    const sortBy = req.query.sortBy || {};

    const query_obj = _.omitBy(_.isUndefined)({
      projects: {
        some: {
          project: {
            OR: [
              {
                id: req.params.id,
              },
              {
                slug: req.params.id,
              },
            ],
          },
        },
      },
      name: req.query.name ? {
        contains: req.query.name,
        mode: 'insensitive', // case-insensitive search
      } : undefined,
      is_staged: req.query.staged ?? Prisma.skip,
    });

    const filterQuery = { where: query_obj };
    const datasetRetrievalQuery = {
      skip: req.query.skip ?? Prisma.skip,
      take: req.query.take ?? Prisma.skip,
      ...filterQuery,
      orderBy: projectService.build_order_by_object(Object.keys(sortBy)[0], Object.values(sortBy)[0]),
      include: {
        ...CONSTANTS.INCLUDE_WORKFLOWS,
        bundle: true,
        projects: {
          include: {
            assignor: {
              select: {
                id: true,
                username: true,
                name: true,
              },
            },
          },
        },
      },
    };

    const [datasets, count] = await prisma.$transaction([
      prisma.dataset.findMany({ ...datasetRetrievalQuery }),
      prisma.dataset.count({ ...filterQuery }),
    ]);

    // include workflow objects with dataset
    const wfPromises = (datasets || []).map(async (ds) => {
      if (ds.workflows.length > 0) {
        return wfService.getAll({
          only_active: true,
          last_task_run: false,
          prev_task_runs: false,
          workflow_ids: ds.workflows.map((x) => x.id),
        }).then((wf_res) => (Object.assign(ds, { workflows: wf_res.data.results })))
          .catch((error) => {
            log_axios_error(error);
            return Object.assign(ds, { workflows: [] });
          });
      }
      return ds;
    });
    const datasets_with_wfs = await Promise.all(wfPromises);

    res.json({
      metadata: { count },
      datasets: datasets_with_wfs,
    });
  }),
);

router.get(
  '/:username/all',
  isPermittedTo('read', { checkOwnership: true }),
  validate([
    query('take').default(25).isInt({ min: 1 }).toInt(),
    query('skip').default(0).isInt({ min: 0 }).toInt(),
    query('search').default(''), // Adding search query validation
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('sort_by').default('updated_at').isIn(['name', 'created_at', 'updated_at']),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all projects associated with a username with
    // pagination.
    /* eslint-disable */
      // #swagger.description = user role:
      // can only see their projects. operator, admin:
      // can see anyone's projects
      /* eslint-enable */
    const { search, sort_order, sort_by } = req.query;
    const { username } = req.params;

    const filters = search
      ? {
        AND: [
          {
            users: {
              some: {
                user: {
                  username,
                },
              },
            },
          },
          {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                datasets: {
                  some: {
                    dataset: {
                      name: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
              {
                users: {
                  some: {
                    user: {
                      username: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      }
      : {
        users: {
          some: {
            user: {
              username,
            },
          },
        },
      };

    const sort_obj = {
      [sort_by]: sort_order, // Sort by 'Name' column in the specified order
    };

    // Query to get paginated projects associated with the username
    const [projects, totalCount] = await prisma.$transaction([
      prisma.project.findMany({
        where: filters,
        skip: req.query.skip,
        take: req.query.take,
        orderBy: sort_obj,
        include: projectService.build_include_object(),
      }),
      prisma.project.count({
        where: filters, // Apply the search filters to the count as well
      }),
    ]);

    res.json({
      metadata: { count: totalCount },
      projects: projects.map((p) => req.permission.filter(p)),
    });
  }),
);

router.get(
  '/:username/:id',
  validate([
    query('include_datasets').default(true).toBoolean(),
  ]),
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get a specific project associated with a username
    /* eslint-disable */
      // #swagger.description = user role:
      // can only see their project. operator, admin:
      // can see anyone's project
      /* eslint-enable */
    const { include_datasets } = req.query;

    const project = await prisma.project.findFirstOrThrow({
      where: {
        OR: [
          {
            id: req.params.id,
          },
          {
            slug: req.params.id,
          },
        ],
        users: {
          some: {
            user: {
              username: req.params.username,
            },
          },
        },
      },
      include: projectService.build_include_object({ include_datasets }),
    });

    // include workflow objects with dataset
    const wfPromises = (project.datasets || []).map(async (ds) => {
      const { dataset, assigned_at } = ds;
      if (dataset.workflows.length > 0) {
        return wfService.getAll({
          only_active: true,
          last_task_run: false,
          prev_task_runs: false,
          workflow_ids: dataset.workflows.map((x) => x.id),
        }).then((wf_res) => ({
          assigned_at,
          dataset: Object.assign(dataset, { workflows: wf_res.data.results }),
        })).catch((error) => {
          log_axios_error(error);
          return {
            assigned_at,
            dataset: Object.assign(dataset, { workflows: [] }),
          };
        });
      }
      return ds;
    });
    project.datasets = await Promise.all(wfPromises);

    res.json(req.permission.filter(project));
  }),
);

/**
 * Create a new project.
 *
 * @route POST /projects
 * @param {Object} req.body - The project data.
 * @param {boolean} [req.body.browser_enabled] - Whether the project is browser enabled.
 * @param {string} [req.body.name] - The name of the project.
 * @param {string} [req.body.description] - The description of the project.
 * @param {string} [req.body.funding] - The funding information for the project.
 * @param {Object} [req.body.metadata] - Additional metadata for the project.
 * @param {number[]} [req.body.user_ids] - Array of user IDs to associate with the project.
 * @param {number[]} [req.body.dataset_ids] - Array of dataset IDs to associate with the project.
 * @param {Object} req.user - The authenticated user making the request.
 * @param {string} req.user.id - The ID of the authenticated user.
 * @returns {Promise<Object>} The created project object.
 * @throws {Error} If project creation fails.
 */
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('browser_enabled').optional().toBoolean(),
    body('name').optional().isString(),
    body('description').optional().isString(),
    body('funding').optional().isString(),
    body('metadata').optional().isObject(),
    body('user_ids').optional().isArray().withMessage('user_ids must be an array')
      .custom((value) => value.every((id) => typeof id === 'number' && Number.isInteger(id)))
      .withMessage('user_ids must be an array of integers'),
    body('dataset_ids').optional().isArray().withMessage('dataset_ids must be an array')
      .custom((value) => value.every((id) => typeof id === 'number' && Number.isInteger(id)))
      .withMessage('dataset_ids must be an array of integers'),
  ]),
  asyncHandler(async (req, res, next) => {
    /* eslint-disable */
      // #swagger.tags = ['Projects']
      // #swagger.summary = create a project
      // #swagger.description = admin, operator and user roles are allowed to create
      // projects
      /* eslint-enable */

    const project = await projectService.create_project({
      data: {
        ...req.body,
        assignor_id: req.user.id,
      },
      include: projectService.build_include_object(),
    });
    res.json(project);
  }),
);

router.post(
  '/merge/:src',
  isPermittedTo('update'),
  validate([
    body('target_project_ids').exists(),
    body('delete_merged').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = merge multiple projects into a source project
    /*
    * #swagger.description = admin and operator roles are allowed and user role
    * is forbidden
    */

    // get source project
    const source_project = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.src,
      },
      include: projectService.build_include_object(),
    });

    // get target projects
    const target_projects = await prisma.project.findMany({
      where: {
        id: {
          in: req.body.target_project_ids,
        },
      },
      include: projectService.build_include_object(),
    });

    // assemble all unique dataset_ids associated with the target projects
    const target_dataset_ids = new Set(_.flatten(
      target_projects.map((p) => p.datasets.map((obj) => obj.dataset.id)),
    ));

    // find dataset ids which are not already associated with the source project
    const source_dataset_ids = source_project.datasets.map((obj) => obj.dataset.id);

    const dataset_ids_to_add = [
      ...setDifference(target_dataset_ids, new Set(source_dataset_ids)),
    ];

    // associate these with source project
    const data = dataset_ids_to_add.map((dataset_id) => ({
      project_id: req.params.src,
      dataset_id,
      assignor_id: req.user.id,
    }));
    const add_assocs = prisma.project_dataset.createMany({
      data,
    });

    // if delete merged is true, delete target projects as well as its user and
    // dataset associations
    if (req.body.delete_merged) {
      const deletes = prisma.project.deleteMany({
        where: {
          id: {
            in: req.body.target_project_ids,
          },
        },
      });
      await prisma.$transaction([add_assocs, deletes]);
    } else {
      await add_assocs;
    }

    res.send();
  }),
);

router.put(
  '/:id/users',
  isPermittedTo('update'),
  validate([
    body('user_ids').exists(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = associate users to a project
    /* eslint-disable */
      // #swagger.description = admin and operator roles are allowed
      // and user role is forbidden
      /* eslint-enable */

    // get project or send 404 if not found
    const project = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
      include: projectService.build_include_object(),
    });

    const cur_user_ids = project.users.map((obj) => obj.user.id);
    const req_user_ids = req.body.user_ids || [];

    const user_ids_to_add = [...setDifference(new Set(req_user_ids), new Set(cur_user_ids))];
    const user_ids_to_remove = [...setDifference(new Set(cur_user_ids), new Set(req_user_ids))];

    // delete associations
    const delete_assocs = prisma.project_user.deleteMany({
      where: {
        project_id: req.params.id,
        user_id: {
          in: user_ids_to_remove,
        },
      },
    });

    const data = user_ids_to_add.map((user_id) => ({
      project_id: req.params.id,
      user_id,
      assignor_id: req.user.id,
    }));
    const add_assocs = prisma.project_user.createMany({
      data,
    });

    await prisma.$transaction([
      delete_assocs,
      add_assocs,
    ]);

    res.send();
  }),
);

router.patch(
  '/:id/users',
  isPermittedTo('update'),
  validate([
    body('add_user_ids').isArray().optional(),
    body('remove_user_ids').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = associate users to, or remove users from a project
    /* eslint-disable */
      // #swagger.description = admin and operator roles are
      // allowed and user role is forbidden
      /* eslint-enable                                                             */

    // get project or send 404 if not found
    await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
    });

    const add_user_ids = req.body.add_user_ids || [];
    const remove_user_ids = req.body.remove_user_ids || [];

    const create_data = add_user_ids.map((user_id) => ({
      project_id: req.params.id,
      user_id,
      assignor_id: req.user.id,
    }));
    const delete_data = remove_user_ids.map((user_id) => ({
      project_id: req.params.id,
      user_id,
    }));

    // create new associations
    const add_assocs = prisma.project_user.createMany({
      data: create_data,
    });
      // delete existing associations
    const delete_assocs = prisma.project_user.deleteMany({
      where: {
        OR: delete_data,
      },
    });

    await prisma.$transaction([delete_assocs, add_assocs]);

    res.send();
  }),
);

router.put(
  '/:id/contacts',
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = associate contacts / external users to a project
    /* eslint-disable */
      // #swagger.description = admin and operator roles are allowed
      // and user role is forbidden
      /* eslint-enable                                                          */

    // get project or send 404 if not found
    await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
    });

    // TODO: handle multiple contacts

    const data = _.flow([
      _.pick(['type', 'value', 'description']),
      _.omitBy(_.isNil),
    ]);

    // upsert contact
    const upserted_contact = await prisma.contact.upsert({
      where: {
        type_value: {
          type: data.type,
          value: data.value,
        },
      },
      update: {},
      create: data,
    });

    // create associations
    await prisma.project_contact.create({
      data: {
        project_id: req.params.id,
        contact_id: upserted_contact.id,
        assignor_id: req.user.id,
      },
    });

    res.send();
  }),
);

router.patch(
  '/:id/datasets',
  isPermittedTo('update'),
  validate([
    body('add_dataset_ids').isArray().optional(),
    body('remove_dataset_ids').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = associate datasets users to a project
    /* eslint-disable */
      // #swagger.description = admin and operator roles are
      // allowed and user role is forbidden
      /* eslint-enable                                                             */

    // get project or send 404 if not found
    await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
    });

    const add_dataset_ids = req.body.add_dataset_ids || [];
    const remove_dataset_ids = req.body.remove_dataset_ids || [];

    const create_data = add_dataset_ids.map((dataset_id) => ({
      project_id: req.params.id,
      dataset_id,
      assignor_id: req.user.id,
    }));
    const delete_data = remove_dataset_ids.map((dataset_id) => ({
      project_id: req.params.id,
      dataset_id,
    }));

    // create new associations
    const add_assocs = prisma.project_dataset.createMany({
      data: create_data,
    });
      // delete existing associations
    const delete_assocs = prisma.project_dataset.deleteMany({
      where: {
        OR: delete_data,
      },
    });

    await prisma.$transaction([delete_assocs, add_assocs]);

    res.send();
  }),
);

router.patch(
  '/:id',
  validate([
    body('name').optional().isLength({ min: 5 }),
    body('browser_enabled').optional().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = update a project
    /* eslint-disable */
      // #swagger.description = admin and operator roles are
      // allowed and user role is forbidden
      /* eslint-enable                                                               */

    const data = _.flow([
      _.pick(['name', 'description', 'browser_enabled', 'funding', 'metadata']),
      _.omitBy(_.isNil),
    ])(req.body);

    // get project or send 404 if not found
    const projectToUpdate = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
      include: projectService.build_include_object(),
    });

    data.metadata = _.merge(projectToUpdate?.metadata)(data.metadata); // deep merge

    // generate new slug if the name has changed
    if (data.name && projectToUpdate.name !== data.name) {
      data.slug = await projectService.generate_slug({
        name: data.name,
        project_id: projectToUpdate.id,
      });
    }

    const updatedProject = await prisma.project.update({
      where: {
        id: req.params.id,
      },
      data,
      include: projectService.build_include_object(),
    });
    res.json(updatedProject);
  }),
);

router.delete(
  '/:id',
  isPermittedTo('delete'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = delete a project and all its associations
    /* eslint-disable */
      // #swagger.description = admin and operator roles are
      // allowed and user role is forbidden
      /* eslint-enable */

    const deleted_project = await prisma.project.delete({
      where: {
        id: req.params.id,
      },
    });
    res.json(deleted_project);
  }),
);

module.exports = router;
