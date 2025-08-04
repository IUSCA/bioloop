const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { query, param, body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { has_project_assoc } = require('../services/project');

const prisma = new PrismaClient();
const router = express.Router();

// Middleware to check permissions
const isPermittedTo = accessControl('tracks');

router.get(
  '/',
  isPermittedTo('read'),
  [
    query('project_id').trim().optional(),
    query('name').trim().optional(),
    query('file_type').trim().optional(),
    query('genome_type').trim().optional(),
    query('genome_value').trim().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    query('sort_by').default('created_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const {
      project_id, name, file_type, genome_type, genome_value, limit, offset, sort_by, sort_order,
    } = req.query;

    try {
      // Build filter query based on user's project access
      const filter_query = {

      };

      // If user has admin/operator role, they can see all tracks.
      // Otherwise, filter by user's project membership through datasets
      if (!req.permission.granted) {
        // Get user's project memberships
        const userProjects = await prisma.project_user.findMany({
          where: { user_id: req.user.id },
          select: { project_id: true },
        });

        const projectIds = userProjects.map((p) => p.project_id);

        // Filter tracks by datasets that belong to user's projects
        filter_query.dataset_file = {
          dataset: {
            projects: {
              some: {
                project_id: { in: projectIds },
              },
            },
          },
        };
      }

      // If asking for a specific project, verify that user has access to it
      if (project_id) {
        // Verify user has access to this project
        if (!req.permission.granted) {
          const hasAccess = await has_project_assoc({
            projectId: project_id,
            userId: req.user.id,
          });

          if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied to specified project' });
          }
        }

        // Filter tracks by datasets that belong to the specified project
        filter_query.dataset_file = {
          dataset: {
            projects: {
              some: {
                project_id,
              },
            },
          },
        };
      }

      // optional filters
      if (name) {
        filter_query.name = {
          contains: name,
          mode: 'insensitive',
        };
      }

      if (file_type) {
        filter_query.file_type = file_type;
      }

      if (genome_type) {
        filter_query.genomeType = genome_type;
      }

      if (genome_value) {
        filter_query.genomeValue = genome_value;
      }

      const [tracks, count] = await prisma.$transaction([
        prisma.track.findMany({
          where: filter_query,
          include: {
            dataset_file: {
              select: {
                id: true,
                name: true,
                path: true,
                size: true,
                filetype: true,
                dataset: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    projects: {
                      select: {
                        project: {
                          select: {
                            id: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
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
        metadata: { count },
        tracks,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch tracks' });
    } finally {
      await prisma.$disconnect();
    }
  }),
);

// Create a new track
router.post(
  '/',
  isPermittedTo('create'),
  [
    body('name').isString().notEmpty().trim(),
    body('file_type').isString().notEmpty().trim(),
    body('genome_type').isString().notEmpty().trim(),
    body('genome_value').isString().notEmpty().trim(),
    body('dataset_file_id').isInt().toInt(),
  ],
  asyncHandler(async (req, res) => {
    const {
      name, file_type, genome_type, genome_value, dataset_file_id,
    } = req.body;

    try {
      // Verify the dataset file exists and user has access to it
      const datasetFile = await prisma.dataset_file.findUnique({
        where: { id: dataset_file_id },
        include: {
          dataset: {
            include: {
              projects: true,
            },
          },
        },
      });

      if (!datasetFile) {
        return res.status(404).json({ error: 'Dataset file not found' });
      }

      // Check if User has access to the Dataset whose File the Track being
      // created is associated with.
      if (!req.permission.granted) {
        const hasAccess = await has_project_assoc({
          projectId: datasetFile.dataset.projects[0]?.project_id,
          userId: req.user.id,
        });

        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to dataset' });
        }
      }

      // Create the track
      const track = await prisma.track.create({
        data: {
          name,
          file_type,
          genomeType: genome_type,
          genomeValue: genome_value,
          dataset_file_id,
        },
        include: {
          dataset_file: {
            select: {
              id: true,
              name: true,
              path: true,
              size: true,
              filetype: true,
              dataset: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  projects: {
                    select: {
                      project: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      res.status(201).json(track);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create track' });
    } finally {
      await prisma.$disconnect();
    }
  }),
);

// Get a specific track by ID
router.get(
  '/:id',
  isPermittedTo('read'),
  [
    param('id').isInt().toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const track = await prisma.track.findUnique({
        where: { id },
        include: {
          dataset_file: {
            select: {
              id: true,
              name: true,
              path: true,
              size: true,
              filetype: true,
              dataset: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  projects: {
                    select: {
                      project: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      // Check access control
      if (!req.permission.granted) {
        const hasAccess = track.dataset_file.dataset.projects.some((pt) => has_project_assoc({
          projectId: pt.project.id,
          userId: req.user.id,
        }));

        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to track' });
        }
      }

      res.status(200).json(track);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch track' });
    } finally {
      await prisma.$disconnect();
    }
  }),
);

// Update a track
router.patch(
  '/:id',
  isPermittedTo('update'),
  [
    param('id').isInt().toInt(),
    body('name').isString().optional().trim(),
    body('file_type').isString().optional().trim(),
    body('genome_type').isString().optional().trim(),
    body('genome_value').isString().optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      name, file_type, genome_type, genome_value,
    } = req.body;

    try {
      // Check if track exists and user has access
      const existingTrack = await prisma.track.findUnique({
        where: { id },
        include: {
          dataset_file: {
            select: {
              dataset: {
                select: {
                  projects: {
                    select: {
                      project: {
                        select: {
                          id: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existingTrack) {
        return res.status(404).json({ error: 'Track not found' });
      }

      // Check access control
      if (!req.permission.granted) {
        const hasAccess = existingTrack.dataset_file.dataset.projects.some((pt) => has_project_assoc({
          projectId: pt.project_id,
          userId: req.user.id,
        }));

        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to track' });
        }
      }

      // Update the track
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (file_type !== undefined) updateData.file_type = file_type;
      if (genome_type !== undefined) updateData.genomeType = genome_type;
      if (genome_value !== undefined) updateData.genomeValue = genome_value;

      const track = await prisma.track.update({
        where: { id },
        data: updateData,
        include: {
          dataset_file: {
            select: {
              id: true,
              name: true,
              path: true,
              size: true,
              filetype: true,
              dataset: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  projects: {
                    select: {
                      project: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      res.status(200).json(track);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update track' });
    } finally {
      await prisma.$disconnect();
    }
  }),
);

// Delete a track (admin/operator only - bypasses project access control)
router.delete(
  '/:id',
  isPermittedTo('delete'),
  [
    param('id').isInt().toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      // Only admin/operator users can use this endpoint
      if (!req.permission.granted) {
        return res.status(403).json({ error: 'Admin/operator access required' });
      }

      // Check if track exists
      const existingTrack = await prisma.track.findUnique({
        where: { id },
        include: {
          dataset_file: {
            select: {
              id: true,
              name: true,
              path: true,
              size: true,
              filetype: true,
              dataset: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  projects: {
                    select: {
                      project: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existingTrack) {
        return res.status(404).json({ error: 'Track not found' });
      }

      // Log the deletion for audit purposes
      console.log(`User ${req.user.username} deleted track ${id} (${existingTrack.name})`);

      // Delete the track
      await prisma.track.delete({
        where: { id },
      });

      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete track' });
    } finally {
      await prisma.$disconnect();
    }
  }),
);

// Get tracks for a specific user (ownership-based access control)
router.get(
  '/:username',
  isPermittedTo('read', { checkOwnership: true }),
  [
    param('username').isString().notEmpty(),
    query('project_id').isString().optional(),
    query('name').trim().optional(),
    query('file_type').trim().optional(),
    query('genome_type').trim().optional(),
    query('genome_value').trim().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    query('sort_by').default('created_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const { username } = req.params;
    const {
      project_id, name, file_type, genome_type, genome_value, limit, offset, sort_by, sort_order,
    } = req.query;

    try {
      const user = await prisma.user.findUnique({
        where: { username },
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const filter_query = {};

      if (project_id) {
        // Check if the User is part of the specified Project
        const isAssociatedToProject = await has_project_assoc({
          projectId: project_id,
          userId: user.id,
        });

        if (!isAssociatedToProject) {
          return res.status(403).json({ error: 'User is not part of the project' });
        }

        // filter tracks by datasets that belong to the specified project_id
        filter_query.dataset_file = {
          dataset: {
            projects: {
              some: {
                project_id,
              },
            },
          },
        };
      } else {
        // Collect tracks across all Projects that the User belongs to through
        // datasets
        const userProjects = await prisma.project_user.findMany({
          where: { user_id: user.id },
          select: { project_id: true },
        });

        const projectIds = userProjects.map((p) => p.project_id);

        filter_query.dataset_file = {
          dataset: {
            projects: {
              some: {
                project_id: { in: projectIds },
              },
            },
          },
        };
      }

      // Apply optional filters
      if (name) {
        filter_query.name = {
          contains: name,
          mode: 'insensitive',
        };
      }

      if (file_type) {
        filter_query.file_type = file_type;
      }

      if (genome_type) {
        filter_query.genomeType = genome_type;
      }

      if (genome_value) {
        filter_query.genomeValue = genome_value;
      }

      const [tracks, count] = await prisma.$transaction([
        prisma.track.findMany({
          where: filter_query,
          include: {
            dataset_file: {
              select: {
                id: true,
                name: true,
                path: true,
                size: true,
                filetype: true,
                dataset: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    projects: {
                      select: {
                        project: {
                          select: {
                            id: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
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
        metadata: { count },
        tracks,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch tracks' });
    } finally {
      await prisma.$disconnect();
    }
  }),
);

module.exports = router;
