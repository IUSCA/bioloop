const { AssertionError } = require('assert');
const createError = require('http-errors');
const { Prisma } = require('@prisma/client');

// catch 404 and forward to error handler
function notFound(req, res, next) {
  const error = createError(404, `Not Found - ${req.originalUrl}`);
  next(error);
}

// catch prisma record not found errors and send 404
function prismaNotFoundHandler(e, req, res, next) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e?.meta?.cause?.includes('not found')) {
      return next(createError.NotFound());
    }
  }
  return next(e);
}

// catch assertion errors and send 400
function assertionErrorHandler(e, req, res, next) {
  if (e instanceof AssertionError) {
    return next(createError.BadRequest(e.message));
  }
  return next(e);
}

function errorHandler(err, req, res, next) {
  // delegate to the default Express error handler,
  // when the headers have already been sent to the client
  if (res.headersSent) {
    return next(err);
  }
  if (err.status !== 404) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
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
};
