const express = require('express');
const cookieParser = require('cookie-parser');
const requestLogger = require('morgan');
const compression = require('compression');
const cors = require('cors');

const indexRouter = require('./routes/index');
const { notFound, errorHandler } = require('./middleware/error');

// Register application
const app = express();

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

// gzip compression
app.use(compression());

// enable CORS - cross origin resource sharing
app.use(cors());

// mount router
app.use('/', indexRouter);

// handle unknown routes
app.use(notFound);

// pass any unhandled errors to the error handler
app.use(errorHandler);

module.exports = app;
