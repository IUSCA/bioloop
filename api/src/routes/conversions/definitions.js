const express = require('express');
const { param } = require('express-validator');
const createError = require('http-errors');
const { Prisma, PrismaClient } = require('@prisma/client');

// const logger = require('../services/logger');
const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');

const prisma = new PrismaClient();
const isPermittedTo = accessControl('conversion');
const router = express.Router();

const INCLUDE = {
  program: {
    include: {
      arguments: true,
    },
  },
  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
};

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Conversion Definitions']
    const conversions = await prisma.conversion_definition.findMany({
      where: {
        name: {
          contains: req.query.name ?? Prisma.skip,
          mode: 'insensitive',
        },
      },
      include: INCLUDE,
    });
    return res.json(conversions);
  }),
);

router.get(
  '/:id',
  isPermittedTo('read'),
  validate([
    param('id').isInt({ min: 1 }).toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Conversion Definitions']
    const conversion = await prisma.conversion_definition.findUniqueOrThrow({
      where: {
        id: req.params.id,
      },
      include: INCLUDE,
    });
    if (!conversion) {
      return next(createError(404, 'Conversion definition not found'));
    }
    return res.json(conversion);
  }),
);

// const exampleConversion = {
//   name: 'Conversion Definition',
//   description: 'A conversion definition is a template for a conversion instance.',
//   enabled: true,
//   dataset_types: ['RAW_DATA'],
//   tags: ['abc', 'def'],
//   program: {
//     name: 'Conversion Program',
//     executable_path: '/path/to/executable',
//     arguments: [
//       {
//         name: '--input',
//         description: 'Input file',
//         is_required: true,
//         value_type: 'STRING',
//       },
//       {
//         name: '--output',
//         description: 'Output file',
//         is_required: true,
//         value_type: 'STRING',
//       },
//     ],
//     allow_additional_args: false,
//   },
// };
// TODO: validate one of name or position is provided
router.post(
  '/',
  isPermittedTo('create'), // TODO: Add validation
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Conversion Definitions']
    const {
      name, description, enabled, dataset_types, tags,
    } = req.body;
    const conversion = await prisma.conversion_definition.create({
      data: {
        name,
        description,
        enabled,
        dataset_types,
        tags,
        program: {
          create: {
            ...req.body.program,
            arguments: {
              create: req.body.program.arguments,
            },
          },
        },
        author: {
          connect: {
            id: req.user.id,
          },
        },
      },
    });
    return res.status(201).json(conversion);
  }),
);

// router.put(
//   '/:id',
//   isPermittedTo('update'),
//   validate([
//     param('id').isInt({ min: 1 }).toInt(), // TODO: add validations
//   ]),
//   asyncHandler(async (req, res, next) => {
//   // #swagger.tags = ['Conversion Definitions']
//   // TODO: cannot edit if there are existing conversion instances
//     const conversion = await prisma.conversion_definition.update({
//       where: {
//         id: req.params.id,
//       },
//       data: req.body,
//     });
//     return res.json(conversion);
//   }),
// );

module.exports = router;
