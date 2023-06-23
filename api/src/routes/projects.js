const express = require('express');
const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
const { body } = require('express-validator');

const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const projectService = require('../services/project');

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
      dataset: true,
      assigned_at: true,
    },
  },
  contacts: {
    select: {
      contact: true,
      assigned_at: true,
    },
  },
};

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
  isPermittedTo('read', false),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get all projects.
    // #swagger.description = admin and operator roles are allowed and user role is forbidden
    const projects = await prisma.project.findMany({
      where: {},
      include: INCLUDE_USERS_DATASETS_CONTACTS,
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
    const projects = await prisma.project.findFirstOrThrow({
      where: {
        OR: [
          {
            id: req.params.id,
          },
          {
            slug: req.params.id,
          },
        ],
      }, // filter by username
      include: INCLUDE_USERS_DATASETS_CONTACTS,
    });
    res.json(projects);
  }),
);

router.get(
  '/:username/all',
  isPermittedTo('read'),
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
    });
    res.json(projects);
  }),
);

router.get(
  '/:username/:id',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = get a specific project associated with a username
    /* #swagger.description = user role: can only see their project.
      operator, admin: can see anyone's project
    */
    const projects = await prisma.project.findFirstOrThrow({
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
      include: INCLUDE_USERS_DATASETS_CONTACTS,
    });
    res.json(projects);
  }),
);

router.post(
  '/',
  isPermittedTo('create', false),
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
      include: INCLUDE_USERS_DATASETS_CONTACTS,
    });
    res.json(project);
  }),
);

router.put(
  '/:id/users',
  isPermittedTo('update', false),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Projects']
    // #swagger.summary = associate users to a project
    /* #swagger.description = admin and operator roles are allowed and user role is forbidden
    */

    // get project or send 404 if not found
    await prisma.project.findFirstOrThrow({
      where: {
        id: req.params.id,
      },
    });

    // delete existing associations
    const delete_assocs = prisma.project_user.deleteMany({
      where: {
        project_id: req.params.id,
      },
    });

    const user_ids = req.body.user_ids || [];
    const data = user_ids.map((user_id) => ({
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
  isPermittedTo('update', false),
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
  isPermittedTo('update', false),
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

    const dataset_ids = req.body.user_ids || [];
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
  isPermittedTo('update', false),
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
      include: INCLUDE_USERS_DATASETS_CONTACTS,
    });
    res.json(updatedProject);
  }),
);

router.delete(
  '/:id',
  isPermittedTo('delete', false),
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
