const express = require('express');
const {
  body, param, query, checkSchema,
} = require('express-validator');
const createError = require('http-errors');
const { PrismaClient, Prisma } = require('@prisma/client');
const _ = require('lodash/fp');

// const logger = require('../services/logger');
const config = require('config');
const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');

const { validateArgument, resolveDynamicArgumentValue } = require('../../utils/arguments');
const datasetService = require('../../services/dataset');
const wfService = require('../../services/workflow');
const conversionService = require('../../services/conversion');

const prisma = new PrismaClient();
const isPermittedTo = accessControl('conversion');
const router = express.Router();

router.use('/definitions', require('./definitions'));
router.use('/dynamic-arguments', require('./dynamicArguments'));

router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('dataset_name').optional().trim().isLength({ min: 1 }),
    query('definition_name').optional().trim().isLength({ min: 1 }),
    query('program_name').optional().trim().isLength({ min: 1 }),
    query('initiator').optional().trim().isLength({ min: 1 }),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    query('sort_by').default('initiated_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
  ]),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Conversions']
    const {
      dataset_name,
      definition_name,
      program_name,
      initiator,
      limit,
      offset,
      sort_by,
      sort_order,
    } = req.query;

    // Build where clause
    const where = {};

    if (dataset_name) {
      where.dataset = {
        name: {
          contains: dataset_name,
          mode: 'insensitive',
        },
      };
    }

    if (definition_name) {
      where.definition = {
        name: {
          contains: definition_name,
          mode: 'insensitive',
        },
      };
    }

    if (program_name) {
      where.definition = {
        ...where.definition,
        program: {
          name: {
            contains: program_name,
            mode: 'insensitive',
          },
        },
      };
    }

    if (initiator) {
      where.initiator = {
        username: {
          contains: initiator,
          mode: 'insensitive',
        },
      };
    }

    const filterQuery = { where };
    const orderBy = {
      [sort_by]: sort_order,
    };

    const conversionRetrievalQuery = {
      skip: offset ?? Prisma.skip,
      take: limit ?? Prisma.skip,
      ...filterQuery,
      orderBy,
      include: {
        ...conversionService.INCLUDE,
        dataset: {
          select: {
            id: true,
            name: true,
          },
        },
        definition: {
          select: {
            id: true,
            name: true,
            output_directory: true,
            logs_directory: true,
            program: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    };

    const [conversions, count] = await prisma.$transaction([
      prisma.conversion.findMany({ ...conversionRetrievalQuery }),
      prisma.conversion.count({ ...filterQuery }),
    ]);

    const conversionsWithArgs = conversions.map((conversion) => ({
      ...conversion,
      args_list: conversionService.getArgsList(conversion),
    }));

    return res.json({
      metadata: { count },
      conversions: conversionsWithArgs,
    });
  }),
);

router.get(
  '/:id',
  isPermittedTo('read'),
  validate([
    param('id').isInt({ min: 1 }).toInt(),
    query('include_dataset').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Conversions']
    const conversion = await prisma.conversion.findUniqueOrThrow({
      where: {
        id: req.params.id,
      },
      include: conversionService.getAssociations(req.query),
    });

    conversion.argsList = conversionService.getArgsList(conversion);

    return res.json(conversion);
  }),
);

router.get(
  '/:id/derived_datasets',
  isPermittedTo('read'),
  validate([
    param('id').isInt({ min: 1 }).toInt(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    query('sort_by').default('created_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('type').optional(),
    query('name').optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Conversions']
    // #swagger.summary = Get datasets derived from a conversion
    const {
      id: conversionId,
    } = req.params;
    const {
      limit, offset, sort_by, sort_order, type, name,
    } = req.query;

    const filters = {
      conversion_id: conversionId,
    };

    // Add dataset filters through the relationship
    const datasetFilters = {};
    if (type) {
      datasetFilters.type = type;
    }
    if (name) {
      datasetFilters.name = {
        contains: name,
        mode: 'insensitive',
      };
    }

    if (Object.keys(datasetFilters).length > 0) {
      filters.dataset = datasetFilters;
    }

    // Build orderBy object
    const orderBy = {};
    if (sort_by === 'created_at' || sort_by === 'updated_at') {
      orderBy[sort_by] = sort_order;
    } else if (['name', 'type', 'du_size', 'num_files', 'num_directories'].includes(sort_by)) {
      // Sort by dataset fields
      orderBy.dataset = { [sort_by]: sort_order };
    } else {
      // Default fallback
      orderBy.created_at = sort_order;
    }

    // Handle sorting by size fields with null handling
    if (['du_size', 'size', 'bundle_size'].includes(sort_by)) {
      orderBy.dataset = {
        [sort_by]: {
          nulls: 'last',
          sort: sort_order,
        },
      };
    }

    // Build include object
    const includeObject = {
      dataset: {
        select: {
          id: true,
          name: true,
          type: true,
          du_size: true,
          num_files: true,
          num_directories: true,
          created_at: true,
          updated_at: true,
        },
      },
    };

    const [derived_datasets, total] = await Promise.all([
      prisma.conversion_derived_dataset.findMany({
        where: filters,
        include: includeObject,
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.conversion_derived_dataset.count({
        where: filters,
      }),
    ]);

    return res.json({
      metadata: { count: total },
      derived_datasets,
    });
  }),
);

const derived_dataset_body_schema = {
  '*.conversion_id': {
    in: ['body'],
    isInt: {
      errorMessage: 'Conversion ID must be an integer',
    },
    toInt: true,
  },
  '*.dataset_id': {
    in: ['body'],
    isInt: {
      errorMessage: 'Dataset ID must be an integer',
    },
    toInt: true,
  },
};

router.post(
  '/derived_datasets',
  isPermittedTo('create'),
  validate([
    checkSchema(derived_dataset_body_schema),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Conversions']
    await prisma.conversion_derivation.createMany({
      data: req.body,
    });
    res.sendStatus(200);
  }),
);

// {
//   definition_id: 1,
//   dataset_id: 1,
//   argument_values: [
//     {
//       argument_id: 1,
//       value: 'test',
//     },
//     {
//       argument_id: 2,
//       values: ['test'],
//     },
//     {
//       argument_id: 3,
//       values: 'true',
//     },
//   ],
//   user_argument_values: [
//     {
//       argument_name: '--no-lane-splitting',
//       value: 'true',
//     },
//     {
//       argument_name: '--barcode-mismatches',
//       value: '1',
//     },
//   ],
// };
router.post(
  '/',
  isPermittedTo('create'), // TODO: users should be able to create conversions if they have access to the dataset
  validate([
    body('definition_id').isInt().toInt(),
    body('dataset_id').isInt().toInt(),
    body('argument_values').default([]).isArray(),
    body('user_argument_values').default([]).isArray().custom((value) => value.every((item) => typeof item === 'object'
          && item !== null
          && 'argument_name' in item
          && 'value' in item
          && typeof item.argument_name === 'string'
          && typeof item.value === 'string'))
      .withMessage(
        'user_argument_values must be an array of objects with argument_name and value fields',
      ),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Conversions']

    // validate if definition_id, dataset_id exists
    const conversionDefinition = await prisma.conversion_definition.findUnique({
      where: {
        id: req.body.definition_id,
      },
      include: {
        program: {
          include: {
            arguments: true,
          },
        },
      },
    });
    if (!conversionDefinition) {
      return next(createError(400, `Conversion definition with id ${req.body.definition_id} not found`));
    }
    const dataset = await datasetService.get_dataset({
      id: req.body.dataset_id,
    });

    // validate if dataset type is supported
    if (!conversionDefinition.dataset_types.includes(dataset.type)) {
      return next(createError(400, `Conversion definition does not support dataset type ${dataset.type}`));
    }

    const conversion_program_arguments = conversionDefinition.program.arguments;

    // validate if argument_values are correct
    // associate argument_values with the argument definition
    const argVals = {};
    req.body.argument_values.forEach((argumentValue) => {
      const argument = conversion_program_arguments.find((arg) => arg.id === argumentValue.argument_id);
      if (!argument) {
        return next(createError(400, `Argument with id ${argumentValue.argument_id} not found in the definition`));
      }
      const validationResult = validateArgument(argument, argumentValue.value);
      if (validationResult !== true) {
        return next(createError(400, validationResult));
      }
      argVals[argumentValue.argument_id.toString()] = {
        value: argumentValue.value,
        definition: argument,
      };
    });

    // add arguments that are required and not provided by the user that have default values or are dynamic
    const providedArgumentIds = Object.keys(argVals);
    conversion_program_arguments.forEach((arg) => {
      // if arg is not provided by the user
      // and arg is required or positional
      // and arg has a default value or is dynamic
      if (!providedArgumentIds.includes(arg.id.toString())
          && (arg.is_required || arg.position)
          && (arg.default_value || arg.dynamic_variable_name)) {
        argVals[arg.id.toString()] = {
          value: arg.default_value,
          definition: arg,
        };
      }
    });

    // Resolve Dynamic Arguments
    // resolving means creating a value for the argument based on the dataset properties
    // optional and required arguments can be dynamic
    // dynamic arguments cannot have default values
    const promises = Object.values(argVals)
      .filter((obj) => obj.definition.dynamic_variable_name != null)
      .map(async (obj) => {
        const v = await resolveDynamicArgumentValue(obj.definition, dataset.id);
        argVals[obj.definition.id.toString()].value = v;
      });
    await Promise.all(promises);

    // check if all required arguments are provided
    // if not, add values for missing arguments with default values
    const requiredArguments = conversion_program_arguments.filter((arg) => arg.is_required || arg.position);
    const missingArguments = requiredArguments.filter((arg) => {
      const { value } = argVals[arg.id.toString()];
      return value == null || value === '';
    });
    if (missingArguments.length > 0) {
      return next(
        createError(400, {
          message: 'Missing required arguments',
          missing_arguments: missingArguments,
        }),
      );
    }

    // TODO: additional arguments

    // In a database transaction,
    // 1. Create a conversion
    // 2. Create a workflow
    // 3. Associate the workflow with the dataset
    // 4. Associate the workflow with the conversion
    const conversion = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-shadow
      let conversion = await tx.conversion.create({
        data: {
          definition_id: req.body.definition_id,
          dataset_id: req.body.dataset_id,
          initiator_id: req.user.id,
          argument_values: {
            create: Object.entries(argVals).map(([argument_id, { value, definition }]) => ({
              argument_id: Number(argument_id),
              value: conversionService.convertValueForStorage(value, definition),
            })),
          },
          additional_args: req.body.user_argument_values.length > 0 ? req.body.user_argument_values : null,
        },
      });

      const wf_body = datasetService.get_wf_body('conversion');
      // create the workflow
      const wf = (await wfService.create({
        ...wf_body,
        args: [conversion.id],
      })).data;

      // add workflow association to the dataset
      await tx.workflow.create({
        data: {
          id: wf.workflow_id,
          dataset_id: dataset.id,
        },
      });

      // update the conversion with the workflow id
      conversion = await tx.conversion.update({
        where: {
          id: conversion.id,
        },
        data: {
          workflow_id: wf.workflow_id,
        },
      });

      return conversion;
    });

    return res.status(201).json(conversion);
  }),
);

/**
 * Validates and creates a conversion with proper argument handling and workflow creation.
 *
 * @param {Object} params - The parameters object
 * @param {Object} params.conversionDefinition - The conversion definition object containing program and dataset type info
 * @param {number} params.dataset_id - The ID of the dataset to convert
 * @param {Object} params.argument_values - Object mapping argument IDs to their values and definitions
 * @param {number} params.initiator_id - The ID of the user initiating the conversion
 * @param {Array<Object>} [params.user_argument_values=[]] - Array of user-provided additional arguments
 * @param {string} params.user_argument_values[].argument_name - The argument name (e.g., '--verbose')
 * @param {string} params.user_argument_values[].value - The argument value (e.g., 'true')
 *
 * @returns {Promise<Object>} The created conversion object with workflow association
 *
 * @throws {Error} When dataset type is not supported by the conversion definition
 * @throws {Error} When required arguments are missing
 * @throws {Error} When dynamic argument resolution fails
 *
 * @example
 * const conversion = await validateAndCreateConversion({
 *   conversionDefinition: { program: { arguments: [] }, dataset_types: ['FASTQ'] },
 *   dataset_id: 123,
 *   argument_values: { '1': { value: 'input.fastq', definition: { id: 1 } } },
 *   initiator_id: 456,
 *   user_argument_values: [
 *     { argument_name: '--verbose', value: 'true' },
 *     { argument_name: '--threads', value: '4' }
 *   ]
 * });
 */
async function validateAndCreateConversion(
  {
    conversionDefinition,
    dataset_id,
    argument_values,
    initiator_id,
    user_argument_values = [],
  } = {},
) {
  const argVals = _.cloneDeep(argument_values);
  // handle error or use prisma.findUnique and check for null
  const dataset = await datasetService.get_dataset({
    id: dataset_id,
  });

  // validate if dataset type is supported
  if (!conversionDefinition.dataset_types.includes(dataset.type)) {
    throw createError(400, `Conversion definition does not support dataset type ${dataset.type}`);
  }

  // Resolve Dynamic Arguments
  // resolving means creating a value for the argument based on the dataset properties
  // optional and required arguments can be dynamic
  // dynamic arguments cannot have default values
  const promises = Object.values(argVals)
    .filter((obj) => obj.definition.dynamic_variable_name != null)
    .map(async (obj) => {
      const v = await resolveDynamicArgumentValue(obj.definition, dataset.id);
      argVals[obj.definition.id.toString()].value = v;
    });
  await Promise.all(promises);

  // check if all required arguments are provided
  // if not, add values for missing arguments with default values
  const requiredArguments = conversionDefinition.program.arguments.filter((arg) => arg.is_required || arg.position);
  const missingArguments = requiredArguments.filter((arg) => {
    const { value } = argVals[arg.id.toString()];
    return value == null || value === '';
  });
  if (missingArguments.length > 0) {
    throw createError(400, `Missing required arguments: ${missingArguments.map((arg) => arg.name).join(', ')}`);
  }

  return prisma.$transaction(async (tx) => {
    // eslint-disable-next-line no-console
    console.log('initiator_id', initiator_id);

    // eslint-disable-next-line no-shadow
    let conversion = await tx.conversion.create({
      data: {
        definition_id: conversionDefinition.id,
        dataset_id,
        initiator_id,
        argument_values: {
          create: Object.entries(argVals).map(([argument_id, { value, definition }]) => ({
            argument_id: Number(argument_id),
            value: conversionService.convertValueForStorage(value, definition),
          })),
        },
        additional_args: user_argument_values.length > 0 ? user_argument_values : null,
      },
    });

    const workflow_type = config.genomic_conversion_programs.includes(conversionDefinition.program.name)
      ? 'genomic_conversion'
      : 'conversion';
    const wf_body = datasetService.get_wf_body(workflow_type);
    // create the workflow
    const wf = (await wfService.create({
      ...wf_body,
      args: [conversion.id],
    })).data;

    // add workflow association to the dataset
    await tx.workflow.create({
      data: {
        id: wf.workflow_id,
        dataset_id: dataset.id,
      },
    });

    // update the conversion with the workflow id
    conversion = await tx.conversion.update({
      where: {
        id: conversion.id,
      },
      data: {
        workflow_id: wf.workflow_id,
      },
    });

    return conversion;
  });
}

router.post(
  '/bulk',
  isPermittedTo('create'),
  validate([
    body('definition_id').isInt(),
    body('dataset_ids').isArray().custom((array) => array.every(Number.isInteger)),
    body('argument_values').default([]).isArray(),
    body('user_argument_values').default([]).isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Conversions']

    // validate if definition_id, dataset_id exists
    const conversionDefinition = await prisma.conversion_definition.findUnique({
      where: {
        id: req.body.definition_id,
      },
      include: {
        program: {
          include: {
            arguments: true,
          },
        },
      },
    });
    if (!conversionDefinition) {
      return next(createError(400, `Conversion definition with id ${req.body.definition_id} not found`));
    }

    // validate if argument_values are correct
    // associate argument_values with the argument definition
    const argVals = {};
    req.body.argument_values.forEach((argumentValue) => {
      const argument = conversionDefinition.program.arguments.find((arg) => arg.id === argumentValue.argument_id);
      if (!argument) {
        return next(createError(400, `Argument with id ${argumentValue.argument_id} not found in the definition`));
      }
      const validationResult = validateArgument(argument, argumentValue.value);
      if (validationResult !== true) {
        return next(createError(400, validationResult));
      }
      argVals[argumentValue.argument_id.toString()] = {
        value: argumentValue.value,
        definition: argument,
      };
    });

    // add arguments that are required and not provided by the user that have default values or are dynamic
    const providedArgumentIds = Object.keys(argVals);
    conversionDefinition.program.arguments.forEach((arg) => {
      // if arg is not provided by the user
      // and arg is required or positional
      // and arg has a default value or is dynamic
      if (!providedArgumentIds.includes(arg.id.toString())
          && (arg.is_required || arg.position)
          && (arg.default_value || arg.dynamic_variable_name)) {
        argVals[arg.id.toString()] = {
          value: arg.default_value,
          definition: arg,
        };
      }
    });

    const MAX_ASYNC_CONVERSIONS = 10;
    const batches = _.chunk(MAX_ASYNC_CONVERSIONS, req.body.dataset_ids);
    const dataset_conversions = {};

    // eslint-disable-next-line no-restricted-syntax
    for (const batch of batches) {
      // allSettled will always resolve
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.allSettled(
        batch.map((dataset_id) => validateAndCreateConversion(
          {
            conversionDefinition,
            dataset_id,
            initiator_id: req.user.id,
            argument_values: argVals,
            user_argument_values: req.body.user_argument_values,
          },
        )),
      );

      // aggregate the results of the promises
      _.zip(batch, results).forEach(([dataset_id, result]) => {
        if (result.status === 'fulfilled') {
          const conversion = result.value;
          dataset_conversions[dataset_id] = [true, conversion];
        } else {
          const e = result.reason;
          if (createError.isHttpError(e)) {
            dataset_conversions[dataset_id] = [false, { name: e?.name, message: e?.message }];
          } else {
            console.error(`Error while creating conversion for dataset_id ${dataset_id}:`, e);
            dataset_conversions[dataset_id] = [false, { name: 'Internal Server Error', message: 'details omitted' }];
          }
        }
      });
    }

    return res.json(dataset_conversions);
  }),
);

module.exports = router;
