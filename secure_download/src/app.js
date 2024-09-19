// const fs = require('fs');

const express = require('express');
const cookieParser = require('cookie-parser');
const requestLogger = require('morgan');
// const compression = require('compression');
const cors = require('cors');
// const swaggerUi = require('swagger-ui-express');
const config = require('config');

const indexRouter = require('./routes/index');
const {
  notFound, errorHandler, assertionErrorHandler, axiosErrorHandler,
} = require('./middleware/error');

// Register application
const app = express();

// remove fingerprinting header
app.disable('x-powered-by');

app.set('etag', false);

// request logger - https://github.com/expressjs/morgan
app.use(requestLogger('dev'));

// request parsing middleware
app.use(express.json({ limit: '50mb' }));

// extended: false -> use querystring instead of qs library to parse urlencoded query string
// removes ? ex: ?a=b will be {a: b}
// does not parse nested objects:
// ?person[name]=bobby&person[age]=3 will be { 'person[age]': '3', 'person[name]': 'bobby' }
// see https://stackoverflow.com/questions/29960764/what-does-extended-mean-in-express-4-0
app.use(express.urlencoded({ limit: '50mb', extended: false }));
app.use(cookieParser());

// compress all responses
// app.use(compression());

// enable CORS - cross origin resource sharing
app.use(cors());

// if (!['production', 'test'].includes(config.get('mode'))) {
//   // mount swagger ui
//   try {
//     const swaggerFile = JSON.parse(fs.readFileSync('./swagger_output.json'));
//     app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile));
//   } catch (e) {
//     console.error('Unable to load "./swagger_output.json"', e);
//   }
// }

// mount router
app.use('/', indexRouter);

// handle unknown routes
app.use(notFound);

// handle prisma errors that indicate record is not found and send 404
// app.use(prismaNotFoundHandler);

// handle asserions errors and send 400
app.use(assertionErrorHandler);

// handle axios errors
app.use(axiosErrorHandler);

// pass any unhandled errors to the error handler
app.use(errorHandler);

module.exports = app;
