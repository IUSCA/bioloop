const express = require("express");
const cookieParser = require("cookie-parser");
var winston = require("winston");
let requestLogger = require('morgan')

global.__basedir = __dirname;

// Local import
let config = require("config")

// let storage = require('./storage')
// storage.file_status_update()

// let cron = require('node-cron')

// // cron.schedule('* * * * *', () => {
// //   console.log('running a task every minute')
// // })

// cron.schedule('* * * * *', file_status())


const logger_settings = {
  transports: [
    //display all logs to console
    new winston.transports.Console({
      timestamp: function () {
        var d = new Date();
        return d.toString(); //show timestamp
      },
      level: config.get("logger.level"),
      colorize: config.get("logger.colorize"),
    }),
  ],
}

var logger = new winston.createLogger(logger_settings);

// Register routes
const router = require("./routes/index");

// Register application
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: false }));
app.use(cookieParser());
app.use(requestLogger('dev'))

app.use("/", router);

exports.app = app;

exports.start = function (cb) {
  var port = process.env.PORT || config.get("express.port") || "3030";
  var host = process.env.HOST || config.get("express.host") || "localhost";
  app.listen(port, host, function (err) {
    if (err) return cb(err);
    logger.info(
      `gpdb-api service running on ${host}:${port} in mode ${app.settings.env}`
    );
    cb(null);
  });
};
