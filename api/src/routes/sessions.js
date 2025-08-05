const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, query, param } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');

const prisma = new PrismaClient();

const router = express.Router();

// GET /sessions - Get all sessions accessible to the current user
router.get(
  '/',
  [
    query('title').trim().optional(),
    query('genome').trim().optional(),
    query('genome_type').trim().optional(),
    query('limit').isInt({ min: 1, max: 100 }).optional().toInt(),
    query('offset').isInt({ min: 0 }).optional().toInt(),
    query('sort_by').isIn(['title', 'genome', 'created_at', 'updated_at']).optional(),
    query('sort_order').isIn(['asc', 'desc']).optional(),
  ],
  asyncHandler(async (req, res) => {
    const {
      title,
      genome,
      genome_type,
      limit = 25,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = req.query;

    // Build filter query
    const filter_query = {
      OR: [
        { user_id: req.user.id }, // User's own sessions
        { is_public: true }, // Public sessions
      ],
    };

    if (title) {
      filter_query.title = { contains: title, mode: 'insensitive' };
    }
    if (genome) {
      filter_query.genome = { contains: genome, mode: 'insensitive' };
    }
    if (genome_type) {
      filter_query.genome_type = { contains: genome_type, mode: 'insensitive' };
    }

    // Get sessions with related data
    const [sessions, total] = await Promise.all([
      prisma.genome_browser_session.findMany({
        where: filter_query,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
          session_tracks: {
            include: {
              track: {
                include: {
                  dataset_file: {
                    include: {
                      dataset: true,
                    },
                  },
                },
              },
            },
            orderBy: { order: 'asc' },
          },
          _count: {
            select: {
              session_tracks: true,
            },
          },
        },
        orderBy: { [sort_by]: sort_order },
        take: limit,
        skip: offset,
      }),
      prisma.genome_browser_session.count({ where: filter_query }),
    ]);

    res.json({
      sessions,
      metadata: {
        count: total,
        limit,
        offset,
        sort_by,
        sort_order,
      },
    });
  }),
);

// GET /sessions/:username - Get sessions for a specific user (if accessible)
router.get(
  '/:username',
  [
    param('username').isString().trim(),
    query('title').trim().optional(),
    query('genome').trim().optional(),
    query('genome_type').trim().optional(),
    query('limit').isInt({ min: 1, max: 100 }).optional().toInt(),
    query('offset').isInt({ min: 0 }).optional().toInt(),
    query('sort_by').isIn(['title', 'genome', 'created_at', 'updated_at']).optional(),
    query('sort_order').isIn(['asc', 'desc']).optional(),
  ],
  asyncHandler(async (req, res) => {
    const { username } = req.params;
    const {
      title,
      genome,
      genome_type,
      limit = 25,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = req.query;

    // Find the user
    const targetUser = await prisma.user.findUnique({
      where: { username },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build filter query
    const filter_query = {
      user_id: targetUser.id,
      OR: [
        { user_id: req.user.id }, // User's own sessions
        { is_public: true }, // Public sessions
      ],
    };

    if (title) {
      filter_query.title = { contains: title, mode: 'insensitive' };
    }
    if (genome) {
      filter_query.genome = { contains: genome, mode: 'insensitive' };
    }
    if (genome_type) {
      filter_query.genome_type = { contains: genome_type, mode: 'insensitive' };
    }

    // Get sessions with related data
    const [sessions, total] = await Promise.all([
      prisma.genome_browser_session.findMany({
        where: filter_query,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
          session_tracks: {
            include: {
              track: {
                include: {
                  dataset_file: {
                    include: {
                      dataset: true,
                    },
                  },
                },
              },
            },
            orderBy: { order: 'asc' },
          },
          _count: {
            select: {
              session_tracks: true,
            },
          },
        },
        orderBy: { [sort_by]: sort_order },
        take: limit,
        skip: offset,
      }),
      prisma.genome_browser_session.count({ where: filter_query }),
    ]);

    res.json({
      sessions,
      metadata: {
        count: total,
        limit,
        offset,
        sort_by,
        sort_order,
      },
    });
  }),
);

// POST /sessions - Create a new session
router.post(
  '/',
  [
    body('title').isString().notEmpty().trim(),
    body('genome').isString().notEmpty().trim(),
    body('genome_type').isString().notEmpty().trim(),
    body('track_ids').isArray().optional(),
    body('track_ids.*').isInt().toInt(),
    body('is_public').isBoolean().optional(),
  ],
  asyncHandler(async (req, res) => {
    const {
      title, genome, genome_type, track_ids = [], is_public = false,
    } = req.body;

    // Validate that all tracks exist and are accessible to the user
    if (track_ids.length > 0) {
      const tracks = await prisma.track.findMany({
        where: {
          id: { in: track_ids },
          dataset_file: {
            dataset: {
              projects: {
                some: {
                  project: {
                    users: {
                      some: { user_id: req.user.id },
                    },
                  },
                },
              },
            },
          },
        },
        include: {
          dataset_file: {
            include: {
              dataset: true,
            },
          },
        },
      });

      if (tracks.length !== track_ids.length) {
        return res.status(400).json({ error: 'Some tracks are not accessible' });
      }
    }

    // Create session with tracks
    const session = await prisma.genome_browser_session.create({
      data: {
        title,
        genome,
        genome_type,
        user_id: req.user.id,
        is_public,
        session_tracks: {
          create: track_ids.map((track_id, index) => ({
            track_id,
            order: index,
          })),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        session_tracks: {
          include: {
            track: {
              include: {
                dataset_file: {
                  include: {
                    dataset: true,
                  },
                },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            session_tracks: true,
          },
        },
      },
    });

    res.status(201).json(session);
  }),
);

// GET /sessions/:id - Get a specific session
router.get(
  '/:id',
  [param('id').isInt().toInt()],
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const session = await prisma.genome_browser_session.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        session_tracks: {
          include: {
            track: {
              include: {
                dataset_file: {
                  include: {
                    dataset: true,
                  },
                },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            session_tracks: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check access permissions
    const hasAccess = session.user_id === req.user.id
      || session.is_public;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Increment access count
    await prisma.genome_browser_session.update({
      where: { id },
      data: { access_count: { increment: 1 } },
    });

    res.json(session);
  }),
);

// PATCH /sessions/:id - Update a session
router.patch(
  '/:id',
  [
    param('id').isInt().toInt(),
    body('title').isString().optional().trim(),
    body('genome').isString().optional().trim(),
    body('genome_type').isString().optional().trim(),
    body('is_public').isBoolean().optional(),
    body('track_ids').isArray().optional(),
    body('track_ids.*').isInt().toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      title, genome, genome_type, is_public, track_ids,
    } = req.body;

    // Check if session exists and user has access
    const existingSession = await prisma.genome_browser_session.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!existingSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (existingSession.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate tracks if provided
    if (track_ids && track_ids.length > 0) {
      const tracks = await prisma.track.findMany({
        where: {
          id: { in: track_ids },
          dataset_file: {
            dataset: {
              projects: {
                some: {
                  project: {
                    users: {
                      some: { user_id: req.user.id },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (tracks.length !== track_ids.length) {
        return res.status(400).json({ error: 'Some tracks are not accessible' });
      }
    }

    // Update session
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (genome !== undefined) updateData.genome = genome;
    if (genome_type !== undefined) updateData.genome_type = genome_type;
    if (is_public !== undefined) updateData.is_public = is_public;

    const session = await prisma.genome_browser_session.update({
      where: { id },
      data: {
        ...updateData,
        ...(track_ids && {
          session_tracks: {
            deleteMany: {},
            create: track_ids.map((track_id, index) => ({
              track_id,
              order: index,
            })),
          },
        }),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        session_tracks: {
          include: {
            track: {
              include: {
                dataset_file: {
                  include: {
                    dataset: true,
                  },
                },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            session_tracks: true,
          },
        },
      },
    });

    res.json(session);
  }),
);

// DELETE /sessions/:id - Delete a session
router.delete(
  '/:id',
  [param('id').isInt().toInt()],
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if session exists and user has access
    const existingSession = await prisma.genome_browser_session.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!existingSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (existingSession.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete session (cascade will handle related records)
    await prisma.genome_browser_session.delete({
      where: { id },
    });

    res.status(204).send();
  }),
);

// POST /sessions/:id/stage - Request staging for session tracks
router.post(
  '/:id/stage',
  [
    param('id').isInt().toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if session exists and user has access
    const session = await prisma.genome_browser_session.findFirst({
      where: {
        id,
        OR: [
          { user_id: req.user.id },
          { is_public: true },
        ],
      },
      include: {
        session_tracks: {
          include: {
            track: {
              include: {
                dataset_file: {
                  include: {
                    dataset: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check which tracks need staging
    const tracksToStage = session.session_tracks.filter(
      (st) => !st.track.dataset_file.dataset.is_staged,
    );

    if (tracksToStage.length === 0) {
      return res.status(400).json({ error: 'No tracks need staging' });
    }

    // Get unique dataset IDs that need staging
    const datasetIds = [...new Set(tracksToStage.map((st) => st.track.dataset_file.dataset_id))];

    // Create staging request
    const stagingRequest = {
      track_ids: tracksToStage.map((st) => st.track_id),
      dataset_ids: datasetIds,
      requested_at: new Date(),
      status: 'pending',
    };

    // Update session with staging request
    const updatedSession = await prisma.genome_browser_session.update({
      where: { id },
      data: {
        staging_requested: stagingRequest,
        staging_requested_by: req.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        session_tracks: {
          include: {
            track: {
              include: {
                dataset_file: {
                  include: {
                    dataset: true,
                  },
                },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    // Request staging for each dataset using the datasets endpoint
    const stagingPromises = datasetIds.map(async (datasetId) => {
      try {
        const response = await fetch(`${req.protocol}://${req.get('host')}/api/datasets/${datasetId}/workflow/stage`, {
          method: 'POST',
          headers: {
            Authorization: req.get('Authorization'),
            'Content-Type': 'application/json',
          },
        });
        return { datasetId, success: response.ok };
      } catch (error) {
        return { datasetId, success: false, error: error.message };
      }
    });

    const stagingResults = await Promise.all(stagingPromises);

    res.json({
      message: 'Staging request submitted',
      tracks_to_stage: tracksToStage.length,
      datasets_requested: datasetIds.length,
      staging_results: stagingResults,
      session: updatedSession,
    });
  }),
);

module.exports = router;
