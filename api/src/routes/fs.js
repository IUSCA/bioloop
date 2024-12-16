const { constants } = require('node:fs');
const fs = require('fs');
const express = require('express');
const {
  query,
  // param, body, checkSchema,
} = require('express-validator');
const path = require('node:path');
const createError = require('http-errors');

const config = require('config');
const _ = require('lodash');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('fs');

const router = express.Router();

function getBaseDirKey(req) {
  return Object.keys(config.filesystem.base_dir).filter((key) => key === req.query.search_space)[0];
}

function getBaseDir(req) {
  const base_dir_key = getBaseDirKey(req);
  return config.filesystem.base_dir[base_dir_key];
}

function verifyFileSystemSearchEnabled(req, res, next) {
  const isFileSystemSearchEnabledForUser = config.enabled_features.fs.enabled_for_roles.some(
    (role) => req.user.roles.includes(role),
  );
  if (!isFileSystemSearchEnabledForUser) {
    return next(createError.Forbidden('File system search is not enabled for this user'));
  }
  next();
}

function validatePath(req, res, next) {
  const query_path = req.query.path;
  if (!query_path) {
    return next(createError.Forbidden());
  }

  let p = query_path ? path.normalize(query_path) : null;
  if (!p || !path.isAbsolute(p)) {
    res.status(400).send('Invalid path');
    return;
  }

  p = path.resolve(p);

  const base_dir = getBaseDir(req);
  if (!p.startsWith(base_dir)) {
    res.status(403).send('Forbidden');
    return;
  }

  req.query.path = p;
  next();
}

const get_mount_dir = (req) => {
  const base_dir_key = getBaseDirKey(req);
  return config.filesystem.mount_dir[base_dir_key];
};

const get_mounted_search_dir = (req) => {
  const base_dir = getBaseDir(req);
  const path_prefix = `${base_dir}/`;

  const query_path = req.query.path.slice(req.query.path.indexOf(path_prefix)
    + path_prefix.length);
  const mount_dir = get_mount_dir(req);
  return path.join(mount_dir, query_path);
};

router.get(
  '/',
  verifyFileSystemSearchEnabled,
  validatePath,
  isPermittedTo('read'),
  query('dirs_only').optional().default(false),
  query('search_space').optional().escape().notEmpty(),
  asyncHandler(async (req, res, next) => {
    const { dirs_only, path: query_path } = req.query;

    if (!query_path) {
      res.json([]);
      return;
    }

    const mounted_search_dir = get_mounted_search_dir(req);

    fs.access(mounted_search_dir, constants.F_OK, (err) => {
      if (err) {
        return next(createError.NotFound());
      }

      fs.readdir(mounted_search_dir, {
        withFileTypes: true,
      }, (_err, files) => {
        let filesData = files.map((f) => {
          const file = {
            name: f.name,
            isDir: f.isDirectory(),
            path: path.join(query_path, f.name),
          };
          if (dirs_only) {
            return file.isDir ? file : null;
          }
          return file;
        });
        filesData = _.compact(filesData);
        res.json(filesData);
      });
    });
  }),
);

// router.get(
//   '/dir-size',
//   validatePath,
//   asyncHandler(async (req, res) => {
//     const mounted_search_dir = get_mounted_search_dir(req);
//     console.log('mounted_search_dir: ', mounted_search_dir);
//
//     // check if the path is a directory
//     const stats = await fsPromises.stat(mounted_search_dir);
//     if (!stats.isDirectory()) {
//       console.log(mounted_search_dir, 'is not a directory');
//       res.status(400).send('Not a directory');
//     }
//
//     // As du -sb /path is a long running command,
//     // we will use SSE to keep connection alive and send the size when it's
//     // ready
//     res.setHeader('Content-Type', 'text/event-stream');
//     res.setHeader('Cache-Control', 'no-cache');
//     res.setHeader('Connection', 'keep-alive');
//     res.flushHeaders(); // flush the headers to establish SSE with client
//
//     console.log('sse started');
//
//     // get the size of the directory by spawning a child process to run "du -sb
//     // /path"
//     exec(`du -s ${mounted_search_dir}`, (err, stdout) => {
//       if (err) {
//         console.error('du -s');
//         console.error(err);
//         res.status(500).end();
//         return;
//       }
//       const size = parseInt(stdout.split('\t')[0], 10);
//       // send "message" type event to the client
//       console.log('before write');
//       res.write(`data: ${JSON.stringify({ size })}\n\n`);
//       res.write('event: done\ndata: \n\n');
//       console.log('before write');
//
//       res.end();
//     });
//   }),
// );

module.exports = router;
