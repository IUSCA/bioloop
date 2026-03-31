/**
 * Routes related to dataset duplicate detection.
 *
 * This router is mounted from `api/src/routes/index.js` only when
 * `duplicate_detection` is enabled, so callers never hit these paths when the
 * feature is off.
 *
 * Route summary (all under /datasets/duplication):
 *   GET  /datasets/duplication/config        - Feature flags + threshold for UI
 *   GET  /datasets/duplication/:id/candidate - Best duplicate candidate (workers)
 *   POST  /datasets/duplication/:id                    - Register a detected duplicate (workers)
 *   PUT   /datasets/duplication/:id/comparison         - Save comparison results (workers)
 *   PATCH /datasets/duplication/:id/comparison/progress- Update comparison progress fraction (workers)
 *   POST  /datasets/duplication/:id/accept             - Operator accepts a duplicate
 *   POST  /datasets/duplication/:id/reject             - Operator rejects a duplicate
 */

const express = require('express');
const { param, body } = require('express-validator');
const createError = require('http-errors');
const config = require('config');

const prisma = require('@/db');
const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');
const CONSTANTS = require('@/constants');
const duplicationService = require('@/services/datasetDuplication');
const logger = require('@/services/logger');

const router = express.Router();
const isPermittedTo = accessControl('datasets_duplication');

// ---------------------------------------------------------------------------
// GET /datasets/duplication/config
// ---------------------------------------------------------------------------
router.get(
  '/config',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Return duplicate-detection feature flags and configuration.'
    const dup_feature = config.enabled_features?.duplicate_detection;
    const dup_enabled = typeof dup_feature === 'boolean'
      ? dup_feature
      : !!dup_feature?.enabled;
    const dup_tuning = config.has('dataset_duplication')
      ? config.get('dataset_duplication')
      : {};
    res.json({
      enabled: dup_enabled,
      jaccard_threshold: dup_tuning.jaccard_threshold ?? 0.85,
      concurrent_inspection_wait_timeout_seconds:
        dup_tuning.concurrent_inspection_wait_timeout_seconds ?? 7200,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /datasets/:id/duplication/candidate
// Returns the best duplicate candidate using a file-count similarity score
// (Jaccard index on MD5 overlap).  Called by workers during inspect.
// Only compares against datasets that have reached INSPECTED state.
// ---------------------------------------------------------------------------
router.get(
  '/:id/candidate',
  isPermittedTo('read'),
  validate([param('id').isInt().toInt()]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Return best duplicate candidate using MD5 overlap (Jaccard index).'
    const incoming_id = req.params.id;

    const incoming = await prisma.dataset.findUniqueOrThrow({
      where: { id: incoming_id },
      select: { id: true, type: true, created_at: true },
    });

    // Raw SQL: Jaccard index on MD5 multiset intersection (see worker docs).
    // Only considers non-deleted, same-type datasets that have reached INSPECTED
    // state and were created before the incoming dataset.
    const candidates = await prisma.$queryRaw`
      WITH incoming_files AS (
        SELECT md5
        FROM dataset_file
        WHERE dataset_id = ${incoming_id}
          AND md5 IS NOT NULL
          AND filetype != 'directory'
      ),
      incoming_count AS (
        SELECT COUNT(*) AS total FROM incoming_files
      ),
      eligible_datasets AS (
        SELECT DISTINCT ds.id
        FROM dataset ds
        JOIN dataset_state dss ON dss.dataset_id = ds.id AND dss.state = 'INSPECTED'
        WHERE ds.id != ${incoming_id}
          AND ds.type = ${incoming.type}
          AND ds.is_deleted = FALSE
          AND ds.created_at < ${incoming.created_at}
      ),
      candidate_intersections AS (
        SELECT
          df.dataset_id AS candidate_id,
          COUNT(*) AS common_files
        FROM dataset_file df
        JOIN incoming_files inf ON df.md5 = inf.md5
        WHERE df.dataset_id IN (SELECT id FROM eligible_datasets)
          AND df.filetype != 'directory'
        GROUP BY df.dataset_id
        HAVING COUNT(*) > 0
      ),
      candidate_totals AS (
        SELECT dataset_id, COUNT(*) AS total_files
        FROM dataset_file
        WHERE dataset_id IN (SELECT candidate_id FROM candidate_intersections)
          AND md5 IS NOT NULL
          AND filetype != 'directory'
        GROUP BY dataset_id
      )
      SELECT
        ci.candidate_id,
        ci.common_files,
        ct.total_files AS original_total_files,
        ic.total AS incoming_total_files,
        CAST(ci.common_files AS FLOAT)
          / (ct.total_files + ic.total - ci.common_files) AS content_similarity_score
      FROM candidate_intersections ci
      JOIN candidate_totals ct ON ct.dataset_id = ci.candidate_id
      CROSS JOIN incoming_count ic
      ORDER BY content_similarity_score DESC
      LIMIT 1
    `;

    if (!candidates || candidates.length === 0) {
      return res.json({ candidate: null });
    }

    const best = candidates[0];
    const candidate_dataset = await prisma.dataset.findUnique({
      where: { id: Number(best.candidate_id) },
    });

    res.json({
      candidate: {
        dataset: candidate_dataset,
        content_similarity_score: Number(best.content_similarity_score),
        common_files: Number(best.common_files),
        incoming_total_files: Number(best.incoming_total_files),
        original_total_files: Number(best.original_total_files),
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /datasets/duplication/:id
// Called by workers after candidate similarity detection.  Creates the dataset_duplication
// record and transitions the dataset to DUPLICATE_REGISTERED in one transaction.
// ---------------------------------------------------------------------------
router.post(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('original_dataset_id').isInt().toInt(),
    body('comparison_process_id').optional().isString(),
    body('comparison_status').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Register a detected duplicate dataset.'
    const { original_dataset_id, comparison_process_id, comparison_status } = req.body;

    const duplication = await duplicationService.register_duplicate({
      duplicate_dataset_id: req.params.id,
      original_dataset_id,
      comparison_process_id: comparison_process_id || null,
      comparison_status: comparison_status || CONSTANTS.DATASET_DUPLICATION_ANALYSIS_STATUSES.PENDING,
    });

    res.status(201).json(duplication);
  }),
);

// ---------------------------------------------------------------------------
// PUT /datasets/duplication/:id/comparison
// Called by the compare_duplicate_datasets Celery task after it finishes.
// Saves ingestion checks, updates comparison_status, and advances the dataset
// to DUPLICATE_READY — all in a single transaction.
// ---------------------------------------------------------------------------
router.put(
  '/:id/comparison',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('content_similarity_score').isFloat({ min: 0, max: 1 }),
    body('total_incoming_files').isInt({ min: 0 }),
    body('total_original_files').isInt({ min: 0 }),
    body('total_common_files').isInt({ min: 0 }),
    body('exact_content_match_count').optional().isInt({ min: 0 }),
    body('same_path_same_content_count').optional().isInt({ min: 0 }),
    body('same_path_different_content_count').optional().isInt({ min: 0 }),
    body('same_content_different_path_count').optional().isInt({ min: 0 }),
    body('only_in_incoming_count').optional().isInt({ min: 0 }),
    body('only_in_original_count').optional().isInt({ min: 0 }),
    body('file_count_delta').optional().isInt(),
    body('path_union_file_count').optional().isInt({ min: 0 }),
    body('path_preserving_similarity').optional().isFloat({ min: 0, max: 1 }),
    body('ingestion_checks').isArray(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Save file-level comparison results for a duplicate dataset.'
    await duplicationService.save_comparison_result({
      duplicate_dataset_id: req.params.id,
      comparison_result: req.body,
    });
    res.sendStatus(200);
  }),
);

// ---------------------------------------------------------------------------
// PATCH /datasets/duplication/:id/comparison/progress
// Called by the compare_duplicate_datasets Celery task during execution to
// report incremental progress.  Stores a fraction_done value (0.0–1.0) so the
// UI can render a progress indicator while the comparison is running.
// ---------------------------------------------------------------------------
router.patch(
  '/:id/comparison/progress',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('fraction_done').isFloat({ min: 0, max: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Update comparison progress fraction for a duplicate dataset.'
    await prisma.dataset_duplication.update({
      where: { duplicate_dataset_id: req.params.id },
      data: { comparison_fraction_done: req.body.fraction_done },
    });
    res.sendStatus(204);
  }),
);

// ---------------------------------------------------------------------------
// POST /datasets/duplication/:id/accept
// Operator accepts the incoming duplicate.  The duplicate takes over the
// original's name; the original is soft-deleted.
// ---------------------------------------------------------------------------
router.post(
  '/:id/accept',
  isPermittedTo('update'),
  validate([param('id').isInt().toInt()]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Accept an incoming duplicate dataset.'
    try {
      const dataset = await duplicationService.accept_duplicate_dataset({
        duplicate_dataset_id: req.params.id,
        accepted_by_id: req.user.id,
      });
      res.json(dataset);
    } catch (err) {
      logger.error('Error accepting duplicate dataset', err);
      next(createError(400, err.message));
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /datasets/duplication/:id/reject
// Operator rejects the incoming duplicate.  The duplicate is soft-deleted.
// ---------------------------------------------------------------------------
router.post(
  '/:id/reject',
  isPermittedTo('update'),
  validate([param('id').isInt().toInt()]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Reject an incoming duplicate dataset.'
    try {
      const dataset = await duplicationService.reject_duplicate_dataset({
        duplicate_dataset_id: req.params.id,
        rejected_by_id: req.user.id,
      });
      res.json(dataset);
    } catch (err) {
      logger.error('Error rejecting duplicate dataset', err);
      next(createError(400, err.message));
    }
  }),
);

module.exports = router;
