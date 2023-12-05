const express = require('express');
const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
const { body } = require('express-validator');

const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const projectService = require('../services/project');
const wfService = require('../services/workflow');
const { setDifference, log_axios_error } = require('../utils');

const isPermittedTo = accessControl('projects');
const router = express.Router();
const prisma = new PrismaClient();

const INCLUDE_USERS_DATASETS_CONTACTS = {
  users: {
    select: {
      user: true,
      assigned_at: true,
    },
  },
  datasets: {
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
      dataset_id: true,
    },
  },
  contacts: {
    select: {
      contact: true,
      assigned_at: true,
    },
  },
};

// const projects_relations_query = () => {
//   const dataset_query_object = datasetService.build_query_object();
//
//   return {
//     users: {
//       select: {
//         user: true,
//         assigned_at: true,
//       },
//     },
//     datasets: {
//       where: {
//         dataset: dataset_query_object,
//       },
//       include: {
//         dataset: true,
//       },
//     },
//     contacts: {
//       select: {
//         contact: true,
//         assigned_at: true,
//       },
//     },
//   };
// };
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
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all projects.
    // #swagger.description = admin and operator roles are allowed and user role is forbidden
    const projects = await prisma.project.findMany({
      where: {},
      include: INCLUDE_USERS_DATASETS_CONTACTS,
      // include: projects_relations_query(),
    });

    res.json(projects);
  }),
);

router.get(
  '/:id',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get a specific project irrespective of user association.
    // #swagger.description = admin and operator roles are allowed and user role is forbidden

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
      include: INCLUDE_USERS_DATASETS_CONTACTS,
      // include: projects_relations_query(),
    });

    // await datasetService.get_datasets({ project_id: req.params.id });

    // include workflow objects with dataset
    // const wfPromises = project.datasets.map(async (ds) => {
    //   const { dataset, assigned_at } = ds;
    //   if (dataset.workflows.length > 0) {
    //     return wfService.getAll({
    //       only_active: true,
    //       last_task_run: false,
    //       prev_task_runs: false,
    //       workflow_ids: dataset.workflows.map((x) => x.id),
    //     }).then((wf_res) => ({
    //       assigned_at,
    //       dataset: Object.assign(dataset, { workflows: wf_res.data.results }),
    //     })).catch((error) => {
    //       log_axios_error(error);
    //       return {
    //         assigned_at,
    //         dataset: Object.assign(dataset, { workflows: [] }),
    //       };
    //     });
    //   }
    //   return ds;
    // });
    // project.datasets = await Promise.all(wfPromises);

    res.json(project);
  }),
);

router.get(
  '/:username/all',
  isPermittedTo('read', { checkOwnerShip: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all projects associated with a username
    /* #swagger.description = user role: can only see their projects.
      operator, admin: can see anyone's projects
    */
    const projects = await prisma.project.findMany({
      where: {
        users: {
          some: {
            user: {
              username: req.params.username,
            },
          },
        },
      },
      include: INCLUDE_USERS_DATASETS_CONTACTS,
      // include: projects_relations_query(),
    });
    // don't know why projects.map(req.permission.filter) wouldn't work
    res.json(projects.map((p) => req.permission.filter(p)));
  }),
);

router.get(
  '/:username/:id',
  isPermittedTo('read', { checkOwnerShip: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get a specific project associated with a username
    /* #swagger.description = user role: can only see their project.
      operator, admin: can see anyone's project
    */
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
      // include: projects_relations_query(),
      include: INCLUDE_USERS_DATASETS_CONTACTS,
    });

    // include workflow objects with dataset
    const wfPromises = project.datasets.map(async (ds) => {
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
    body('name').isLength({ min: 5 }),
    body('browser_enabled').optional().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = create a project
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
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
        })),
      };
    }

    if ((dataset_ids || []).length > 0) {
      data.datasets = {
        create: dataset_ids.map((id) => ({
          dataset_id: id,
        })),
      };
    }

    const project = await prisma.project.create({
      data,
      // include: projects_relations_query(),
      include: INCLUDE_USERS_DATASETS_CONTACTS,
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
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
    */

    // get source project
    const source_porject = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.src,
      },
      // include: projects_relations_query(),
      include: INCLUDE_USERS_DATASETS_CONTACTS,
    });

    // get target projects
    const target_projects = await prisma.project.findMany({
      where: {
        id: {
          in: req.body.target_project_ids,
        },
      },
      // include: projects_relations_query(),
      include: INCLUDE_USERS_DATASETS_CONTACTS,
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
    }));
    const add_assocs = prisma.project_dataset.createMany({
      data,
    });

    // if delete merged is true, delete target projects as well as its user and dataset associations
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
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
    */

    // get project or send 404 if not found
    const project = await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
      include: INCLUDE_USERS_DATASETS_CONTACTS,

      // include: projects_relations_query(),
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
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
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
      },
    });

    res.send();
  }),
);

router.put(
  '/:id/datasets',
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = associate datasets users to a project
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
    */

    // get project or send 404 if not found
    await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
    });

    // delete existing associations
    const delete_assocs = prisma.project_dataset.deleteMany({
      where: {
        project_id: req.params.id,
      },
    });

    const dataset_ids = req.body.dataset_ids || [];
    const data = dataset_ids.map((dataset_id) => ({
      project_id: req.params.id,
      dataset_id,
    }));
    const add_assocs = prisma.project_dataset.createMany({
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
  '/:id',
  isPermittedTo('update'),
  validate([
    body('name').optional().isLength({ min: 5 }),
    body('browser_enabled').optional().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = update a project
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
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
      // include: projects_relations_query(),
      include: INCLUDE_USERS_DATASETS_CONTACTS,
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
      // include: projects_relations_query(),
      include: INCLUDE_USERS_DATASETS_CONTACTS,
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
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
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
