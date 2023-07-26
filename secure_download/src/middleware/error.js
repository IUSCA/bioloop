const { AssertionError } = require('assert');
const createError = require('http-errors');
const axios = require('axios');
const _ = require('lodash/fp');

// catch 404 and forward to error handler
function notFound(req, res, next) {
  const error = createError(404, `Not Found - ${req.originalUrl}`);
  next(error);
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
      console.error(
        'Axios Error: The request was made and the server responded with a status code',
        `Error ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`,
      );
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Axios Error: The request was made but no response was received');
    } else {
      // Something else happened in making the request that triggered an error
      console.error(
        'Axios Error:  Something else happened in making the request that triggered an error',
        error.message,
      );
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
  assertionErrorHandler,
  axiosErrorHandler,
};
