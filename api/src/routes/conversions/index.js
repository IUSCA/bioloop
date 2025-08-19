const express = require('express');
const { body, param } = require('express-validator');
const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');

// const logger = require('../services/logger');
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
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Conversions']
    const conversions = await prisma.conversion.findMany({
      where: {
        name: {
          contains: req.query.name,
          mode: 'insensitive',
        },
      },
      include: conversionService.INCLUDE,
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
  // #swagger.tags = ['Conversions']
    const conversion = await prisma.conversion.findUniqueOrThrow({
      where: {
        id: req.params.id,
      },
      include: conversionService.INCLUDE,
    });

    conversion.argsList = conversionService.getArgsList(conversion);

    return res.json(conversion);
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
// };
router.post(
  '/',
  isPermittedTo('create'), // TODO: users should be able to create conversions if they have access to the dataset
  validate([
    body('definition_id').isInt().toInt(),
    body('dataset_id').isInt().toInt(),
    body('argument_values').default([]).isArray(),
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
            create: Object.entries(argVals).map(([argument_id, { value }]) => ({
              argument_id: Number(argument_id),
              value,
            })),
          },
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

async function validateAndCreateConversion(conversionDefinition, dataset_id, _argVals, initiator_id) {
  const argVals = _.cloneDeep(_argVals);
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
    // eslint-disable-next-line no-shadow
    let conversion = await tx.conversion.create({
      data: {
        definition_id: conversionDefinition.id,
        dataset_id,
        initiator_id,
        argument_values: {
          create: Object.entries(argVals).map(([argument_id, { value }]) => ({
            argument_id: Number(argument_id),
            value,
          })),
        },
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
}

router.post(
  '/bulk',
  isPermittedTo('create'),
  validate([
    body('definition_id').isInt(),
    body('dataset_ids').isArray().custom((array) => array.every(Number.isInteger)),
    body('argument_values').default([]).isArray(),
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
        batch.map((dataset_id) => validateAndCreateConversion(conversionDefinition, dataset_id, argVals, req.user.id)),
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
