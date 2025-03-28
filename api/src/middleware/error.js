const { AssertionError } = require('assert');
const createError = require('http-errors');
const { Prisma } = require('@prisma/client');
const axios = require('axios');
const _ = require('lodash/fp');
const { log_axios_error } = require('../utils');
const { logger } = require('../core/logger');

// catch 404 and forward to error handler
function notFound(req, res, next) {
  const error = createError(404, `Not Found - ${req.originalUrl}`);
  next(error);
}

// catch prisma record not found errors and send 404
function prismaNotFoundHandler(e, req, res, next) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025 -"An operation failed because it depends on one or more records that were required but not found. {cause}"
    // P2015 - "A related record could not be found. {details}"
    if (e?.meta?.cause?.includes('not found') || e?.code === 'P2025' || e?.code === 'P2015') {
      logger.error(e);
      return next(createError.NotFound());
    }
  }
  return next(e);
}

// catch prisma constraint failed errors and send 40
function prismaConstraintFailedHandler(e, req, res, next) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 - Unique constraint failed
    if (e?.code === 'P2002') {
      logger.error(e);
      return next(createError.Conflict('Unique constraint failed'));
    }
    // P2003 - Foreign key constraint failed
    // P2014 - The change you are trying to make would violate the required relation
    if (e?.code === 'P2003' || e?.code === 'P2014') {
      logger.error(e);
      return next(createError.Conflict('Request could not be processed due to a constraint violation'));
    }
    // P2011 - Null constraint violation
    if (e?.code === 'P2011') {
      logger.error(e);
      return next(createError.BadRequest('Null constraint violation'));
    }
  }
  return next(e);
}

// catch assertion errors and send 400
function assertionErrorHandler(e, req, res, next) {
  if (e instanceof AssertionError) {
    logger.error(e);
    return next(createError.BadRequest(e.message));
  }
  return next(e);
}

// catch axios errors, print a nice message and return 500 error
function axiosErrorHandler(error, req, res, next) {
  if (axios.isAxiosError(error)) {
    log_axios_error(error);
    return next(createError.InternalServerError());
  }
  // The error is not an Axios error, so re-throw it to be handled elsewhere
  return next(error);
}

function errorHandler(err, req, res, next) {
  // delegate to the default Express error handler,
  // when the headers have already been sent to the client
  if (res.headersSent) {
    return next(err);
  }

  // do not print stack traces for client errors
  const is_client_error = _.isInteger(err?.status) && Math.floor(err.status / 100) === 4;
  // eslint-disable-next-line no-console
  console.error(is_client_error ? err.message : err);

  if (err.expose === true) {
    res.status(err.status || 500).send(err);
  } else {
    res.status(500).send(createError.InternalServerError());
  }
}

module.exports = {
  notFound,
  errorHandler,
  prismaNotFoundHandler,
  assertionErrorHandler,
  axiosErrorHandler,
  prismaConstraintFailedHandler,
};
