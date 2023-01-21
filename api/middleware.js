const createError = require('http-errors');

// catch 404 and forward to error handler
function notFound(req, res, next) {
  const error = createError(404, `Not Found - ${req.originalUrl}`);
  next(error);
}

// eslint-disable-next-line consistent-return
function errorHandler(err, req, res, next) {
  // delegate to the default Express error handler,
  // when the headers have already been sent to the client
  if (res.headersSent) {
    return next(err);
  }
  console.log(JSON.stringify({
    status: err.status,
    statusCode: err.statusCode,
    expose: err.expose,
    headers: err.headers,
    message: err.message,
  }, null, 2));
  if (err.status !== 404) {
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
};
