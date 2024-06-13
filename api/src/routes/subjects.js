const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { param, body, query } = require('express-validator');
const assert = require('assert');

const { validate } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const subjectService = require('../services/subject');

const isPermittedTo = accessControl('subject');

const router = express.Router();
const prisma = new PrismaClient();

// TODO:
// find subjects with subject_id, clinical_core_id
// paginate?
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('limit').default(25).isInt({ min: 1 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('sort_by').default('updated_at').isIn(
      ['subject_id', 'clinical_core_id', 'cfn_id', 'given_name', 'sessions', 'created_at', 'updated_at'],
    ),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('num_sessions').isInt().toInt().optional(),
    query('created_at_start').isISO8601().optional(),
    query('created_at_end').isISO8601().optional(),
    query('updated_at_start').isISO8601().optional(),
    query('updated_at_end').isISO8601().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['subjects']
    let orderBy = {
      [req.query.sort_by]: req.query.sort_order,
    };
    if (req.query.sort_by === 'sessions') {
      orderBy = {
        sessions: {
          _count: req.query.sort_order,
        },
      };
    }

    const filters = {};

    // subject_id filter
    if (req.query.subject_id) {
      filters.subject_id = {
        contains: req.query.subject_id,
        mode: 'insensitive',
      };
    }

    // clinical_core_id filter
    if (req.query.clinical_core_id) {
      filters.clinical_core_id = {
        contains: req.query.clinical_core_id,
        mode: 'insensitive',
      };
    }

    // cfn_id filter
    if (req.query.cfn_id) {
      filters.cfn_id = {
        contains: req.query.cfn_id,
        mode: 'insensitive',
      };
    }

    // given_name filter
    if (req.query.given_name) {
      filters.given_name = {
        contains: req.query.given_name,
        mode: 'insensitive',
      };
    }

    // created_at filter
    if (req.query.created_at_start && req.query.created_at_end) {
      filters.created_at = {
        gte: new Date(req.query.created_at_start),
        lte: new Date(req.query.created_at_end),
      };
    }

    // updated_at filter
    if (req.query.updated_at_start && req.query.updated_at_end) {
      filters.updated_at = {
        gte: new Date(req.query.updated_at_start),
        lte: new Date(req.query.updated_at_end),
      };
    }

    const retrievalQuery = {
      where: filters,
      include: {
        sessions: {
          select: {
            id: true,
          },
        },
      },
      skip: req.query.offset,
      take: req.query.limit,
      orderBy,
    };
    const [subjects, count] = await prisma.$transaction([
      prisma.subject.findMany(retrievalQuery),
      prisma.subject.count({ where: { ...filters } }),
    ]);

    res.json({
      metadata: { count },
      subjects,
    });
  }),
);

function isEditable(subject, field) {
  // if a field is empty, it means it is editable
  // else, check if the subject has sessions and
  // those sessions have associated raw data which is named using this field
  // if so, the field is not editable

  if (!subject[field]) {
    return true;
  }
  return subject.sessions.every((session) => {
    const subject_id_key = session?.protocol?.subject_id_key;
    // subject_id_key is the field name used to name raw datasets
    if (!subject_id_key) {
      return true; // if subject_id_key is null, no conversion took place so this field is editable
    }
    if (subject_id_key !== field) {
      return true; // if the field name is different, this field is editable
    }
    // if the field name is the same, check if the session has raw data
    const hasAssocRawDataset = session.datasets.some(
      (dataset) => dataset.type === 'RAW_DATA',
    );
    return !hasAssocRawDataset;
  });
}

router.get(
  '/:id',
  isPermittedTo('read'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['subjects']
    const subject = await prisma.subject.findUniqueOrThrow({
      where: {
        id: req.params.id,
      },
      include: {
        sessions: {
          include: {
            protocol: true,
            datasets: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });
    subject.editable_fields = {
      subject_id: isEditable(subject, 'subject_id'),
      clinical_core_id: isEditable(subject, 'clinical_core_id'),
      cfn_id: isEditable(subject, 'cfn_id'),
    };
    res.json(subject);
  }),
);

router.post(
  '/',
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['subjects']

    const subject = await subjectService.findOrCreate(req.body);
    res.json(subject);
  }),
);

router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['subjects']
    const subjectToUpdate = await prisma.subject.findUniqueOrThrow({
      where: {
        id: req.params.id,
      },
      include: {
        sessions: {
          include: {
            protocol: true,
            datasets: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    // if the request containes a field that is not editable, return an error
    ['subject_id', 'clinical_core_id', 'cfn_id'].forEach((field) => {
      assert(req.body[field] ? isEditable(subjectToUpdate, field) : true, `Field ${field} is not editable`);
    });

    const subject = await prisma.subject.update({
      where: {
        id: req.params.id,
      },
      data: req.body,
    });
    res.json(subject);
  }),
);

router.post(
  '/merge/:src',
  isPermittedTo('update'),
  validate([
    param('src').isInt().toInt(),
    body('target_subject_ids').exists(),
    body('delete_merged').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['subjects']
    // #swagger.summary = merge multiple subjects into a source subject

    // get source subject
    const src_sub_promise = prisma.subject.findUniqueOrThrow({
      where: {
        id: req.params.src,
      },
      include: {
        session: true,
      },
    });

    // get target subjects
    const target_subs_promise = prisma.subject.findMany({
      where: {
        id: {
          in: req.body.target_subject_ids,
        },
      },
      include: {
        session: true,
      },
    });

    const [src_sub, target_subs] = await Promise.all(src_sub_promise, target_subs_promise);

    // merge ids of target subjects in source subject
    // if clinical_core_id already exists in source subject, it takes precedence

    const new_id = [src_sub].concat(target_subs).reduce((acc, curr) => {
      acc.clinical_core_id ??= curr.clinical_core_id;
      return acc;
    }, {});

    // update source subject with new ids
    const src_sub_update_promise = prisma.subject.update({
      data: new_id,
    });

    // link all sessions of target_subs with src_sub id
    const session_ids_to_update = [...new Set(
      target_subs
        .map((sub) => sub.sessions.map((session) => session.id))
        .flat(),
    )];
    const sessions_update_promise = prisma.session.updateMany({
      where: {
        id: {
          in: session_ids_to_update,
        },
      },
      data: {
        subject_id: src_sub.id,
      },
    });

    await prisma.$transaction([src_sub_update_promise, sessions_update_promise]);

    // if requested, delete target subjects
    if (req.body.delete_merged) {
      await prisma.subject.deleteMany({
        where: {
          ids: {
            in: req.body.target_subject_ids,
          },
        },
      });
    }

    res.send();
  }),
);

// TODO
// subject is associated with session
// what should happen to the session if a subject is deleted?
// router.delete(
//   '/:id',
//   isPermittedTo('delete'),
//   validate([
//     param('id').isInt().toInt(),
//   ]),
//   asyncHandler(async (req, res, next) => {
//     // #swagger.tags = ['subjects']
//     const deletedSubject = await prisma.subject.delete({
//       where: {
//         id: req.params.id,
//       },
//     });
//     res.json(deletedSubject);
//   }),
// );

module.exports = router;
