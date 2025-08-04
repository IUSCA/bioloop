const express = require('express');
const {PrismaClient} = require('@prisma/client');
const {query, param} = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const {accessControl} = require('../middleware/auth');
const {has_project_assoc} = require('../services/project');

const prisma = new PrismaClient();
const router = express.Router();

// Middleware to check permissions
const isPermittedTo = accessControl('tracks');

router.get(
  '/',
  isPermittedTo('read'), // Check if the user has permission to read tracks
  [
    // Express-validator middleware for query parameters
    query('project_id').trim().optional(), // Validate project_id as a string
    query('limit').isInt({min: 1}).toInt().optional(),
    query('offset').isInt({min: 0}).toInt().optional(),
    query('sort_by').default('created_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const {
      project_id, limit, offset, sort_by, sort_order,
    } = req.query;

    try {
      const filter_query = project_id
        ? {
          projects: {
            some: {
              project_id,
            },
          },
        }
        : {};

      const [tracks, count] = await prisma.$transaction([
        prisma.track.findMany({
          where: filter_query,
          skip: offset,
          take: limit,
          orderBy: {
            [sort_by]: sort_order,
          },
        }),
        prisma.track.count({
          where: filter_query,
        }),
      ]);

      res.status(200).json({
        metadata: {count},
        tracks,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({error: 'Failed to fetch tracks'});
    } finally {
      await prisma.$disconnect();
    }
  }),
);

router.get(
  '/:username',
  isPermittedTo('read', {checkOwnership: true}),
  [
    param('username').isString().notEmpty(),
    query('project_id').isString().optional(),
    query('limit').isInt({min: 1}).toInt().optional(),
    query('offset').isInt({min: 0}).toInt().optional(),
    query('sort_by').default('created_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const {username} = req.params;
    const {
      project_id, limit, offset, sort_by, sort_order,
    } = req.query;

    try {
      const user = await prisma.user.findUnique({
        where: {username},
      });
      if (!user) {
        return res.status(404).json({error: 'User not found'});
      }

      let filter_query;

      if (project_id) {
        // Check if the User is part of the specified Project
        const isAssociatedToProject = await has_project_assoc({
          projectId: project_id,
          userId: user.id,
        });

        if (!isAssociatedToProject) {
          return res.status(403).json({error: 'User is not part of the project'});
        }

        // filter tracks by the specified project_id
        filter_query = {
          projects: {
            some: {
              project_id,
            },
          },
        };
      } else {
        // Collect tracks across all Projects that the User belongs to
        const userProjects = await prisma.project_user.findMany({
          where: {user_id: user.id},
          select: {project_id: true},
        });

        const projectIds = userProjects.map((p) => p.project_id);

        filter_query = {
          projects: {
            some: {
              project_id: {in: projectIds},
            },
          },
        };
      }

      const [tracks, count] = await prisma.$transaction([
        prisma.track.findMany({
          where: filter_query,
          skip: offset,
          take: limit,
          orderBy: {
            [sort_by]: sort_order,
          },
        }),
        prisma.track.count({
          where: filter_query,
        }),
      ]);

      res.status(200).json({
        metadata: {count},
        tracks,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({error: 'Failed to fetch tracks'});
    } finally {
      await prisma.$disconnect();
    }
  }),
);

module.exports = router;
