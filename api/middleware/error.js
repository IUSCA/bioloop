const { AssertionError } = require('assert');
const createError = require('http-errors');
const { Prisma } = require('@prisma/client');
const axios = require('axios');

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

// catch axios errors, print a nice message and return 500 error
function axiosErrorHandler(error, req, res, next) {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error('Axios Error: The request was made and the server responded with a status code', `Error ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Axios Error: The request was made but no response was received');
    } else {
      // Something else happened in making the request that triggered an error
      console.error('Axios Error:  Something else happened in making the request that triggered an error', error.message);
    }
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
  axiosErrorHandler,
};
