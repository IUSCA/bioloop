const express = require('express');
const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
const {
  query, body, param,
} = require('express-validator');
const createError = require('http-errors');

const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const projectService = require('../services/project');
const wfService = require('../services/workflow');
const { setDifference, log_axios_error } = require('../utils');
const CONSTANTS = require('../constants');

const isPermittedTo = accessControl('projects');
const router = express.Router();
const prisma = new PrismaClient();

const build_include_object = ({
  include_users = true,
  include_datasets = true,
  include_contacts = true,
} = {}) => _.omitBy(_.isUndefined)({
  users: include_users ? {
    select: {
      user: true,
      assigned_at: true,
      assignor: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  } : undefined,
  datasets: include_datasets ? {
    select: {
      dataset: {
        include: {
          workflows: {
            select: {
              id: true,
            },
          },
        },
      },
      assigned_at: true,
      assignor: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  } : undefined,
  contacts: include_contacts ? {
    select: {
      contact: true,
      assigned_at: true,
      assignor: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  } : undefined,
});

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
    query('skip').default(0).isInt().toInt(),
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
        include: build_include_object(),
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
    query('include_datasets').toBoolean().optional().default(true),
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
      include: build_include_object({ include_datasets }),
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
  isPermittedTo('read', { checkOwnerShip: true }),
  validate([
    param('username').notEmpty().escape(),
    query('staged').toBoolean().optional(),
    query('take').isInt().toInt().optional(),
    query('skip').isInt().toInt().optional(),
    query('name').notEmpty().escape().optional(),
    query('sortBy').isObject().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all datasets associated with a project, with
    // optional params for filtering;
    /*
    * #swagger.description = user role:
    * can only see datasets if they have access to the project.
      operator, admin: can see any project's datasets
    */

    const hasProjectAssociation = await projectService.has_project_assoc({
      projectId: req.params.id,
      userId: req.user.id,
    });

    if (
      req.user.roles.includes('user')
        && !hasProjectAssociation
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
      is_staged: req.query.staged,
    });

    const filterQuery = { where: query_obj };
    const datasetRetrievalQuery = {
      skip: req.query.skip,
      take: req.query.take,
      ...filterQuery,
      orderBy: buildOrderByObject(Object.keys(sortBy)[0], Object.values(sortBy)[0]),
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

const buildOrderByObject = (field, sortOrder, nullsLast = true) => {
  const nullable_order_by_fields = ['du_size', 'size'];

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

router.get(
  '/:username/all',
  isPermittedTo('read', { checkOwnerShip: true }),
  validate([
    query('take').default(25).isInt().toInt(),
    query('skip').default(0).isInt().toInt(),
    query('search').default(''), // Adding search query validation
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('sort_by').default('updated_at').isIn(['name', 'created_at', 'updated_at']),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all projects associated with a username with
    // pagination.
    /* #swagger.description = user role: can only see their projects.
      operator, admin: can see anyone's projects
    */
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
        include: build_include_object(),
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
    query('include_datasets').toBoolean().optional().default(true),
  ]),
  isPermittedTo('read', { checkOwnerShip: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get a specific project associated with a username
    /* #swagger.description = user role: can only see their project.
      operator, admin: can see anyone's project
    */
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
      include: build_include_object({ include_datasets }),
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

router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('browser_enabled').optional().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = create a project
    /*
    * #swagger.description = admin and operator roles are allowed and user role
    * is forbidden
    */
    const { user_ids, dataset_ids, ...projectData } = req.body;
    const data = _.flow([
      _.pick(['name', 'description', 'browser_enabled', 'funding', 'metadata']),
      _.omitBy(_.isNil),
    ])(projectData);
    data.slug = await projectService.generate_slug({ name: data.name });

    if ((user_ids || []).length > 0) {
      data.users = {
        create: user_ids.map((id) => ({
          user_id: id,
          assignor_id: req.user.id,
        })),
      };
    }

    if ((dataset_ids || []).length > 0) {
      data.datasets = {
        create: dataset_ids.map((id) => ({
          dataset_id: id,
          assignor_id: req.user.id,
        })),
      };
    }

    const project = await prisma.project.create({
      data,
      include: build_include_object(),
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
    const source_porject = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.src,
      },
      include: build_include_object(),
    });

    // get target projects
    const target_projects = await prisma.project.findMany({
      where: {
        id: {
          in: req.body.target_project_ids,
        },
      },
      include: build_include_object(),
    });

    // assemble all unique dataset_ids associated with the target projects
    const target_dataset_ids = new Set(_.flatten(
      target_projects.map((p) => p.datasets.map((obj) => obj.dataset.id)),
    ));

    // find dataset ids which are not already associated with the source project
    const source_dataset_ids = source_porject.datasets.map((obj) => obj.dataset.id);

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
    /*
    * #swagger.description = admin and operator roles are allowed and user role
    * is forbidden
    */

    // get project or send 404 if not found
    const project = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
      include: build_include_object(),
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

router.put(
  '/:id/contacts',
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = associate contacts / external users to a project
    /*
    * #swagger.description = admin and operator roles are allowed and user role
    * is forbidden
    */

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
    /*
     * #swagger.description = admin and operator roles are allowed and user
     * role is forbidden
     */

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
  isPermittedTo('update'),
  validate([
    body('name').optional().isLength({ min: 5 }),
    body('browser_enabled').optional().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = update a project
    /*
     * #swagger.description = admin and operator roles are allowed and user
     * role is forbidden
     */

    const data = _.flow([
      _.pick(['name', 'description', 'browser_enabled', 'funding', 'metadata']),
      _.omitBy(_.isNil),
    ])(req.body);

    // get project or send 404 if not found
    const projectToUpdate = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
      include: build_include_object(),
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
      include: build_include_object(),
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
    /*
    * #swagger.description = admin and operator roles are allowed and user role
    * is forbidden
    */

    const deleted_project = await prisma.project.delete({
      where: {
        id: req.params.id,
      },
    });
    res.json(deleted_project);
  }),
);

module.exports = router;
