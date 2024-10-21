const fs = require('fs');
// const fsPromises = require('fs').promises;
const express = require('express');
const {
  query,
  // param, body, checkSchema,
} = require('express-validator');
const path = require('node:path');
// const { exec } = require('child_process');
const createError = require('http-errors');

const config = require('config');
const _ = require('lodash');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('fs');

const router = express.Router();

// const BASE_DIRS = Object.values(config.filesystem.base_dir);
// console.log('BASE_DIRS: ', BASE_DIRS);

function getBaseDirKey(req) {
  const base_dir_key = Object.keys(config.filesystem.base_dir).filter((key) => key === req.query.search_space)[0];
  return base_dir_key;
}

function getBaseDir(req) {
  const base_dir_key = getBaseDirKey(req);
  console.log('base_dir_key: ', base_dir_key);
  const base_dir = config.filesystem.base_dir[base_dir_key];
  console.log('base_dir: ', base_dir);
  return base_dir;
}

// function getSearchSpaceKey(req) {
//   const base_dir_key = getBaseDirKey(req);
//   console.log('base_dir_key: ', base_dir_key);
//   return base_dir_key;
// }

function validatePath(req, res, next) {
  const query_path = req.query.path;
  if (!query_path) {
    return next(createError.Forbidden());
  }

  // const query_path = req_path.slice(req.path.indexOf(BASE_PATH) +
  // path_prefix.length + 1);

  let p = query_path ? path.normalize(query_path) : null;
  console.log(`Normalized path: ${p}`);

  if (!p || !path.isAbsolute(p)) {
    res.status(400).send('Invalid path');
    return;
  }

  p = path.resolve(p);
  console.log(`Resolved path: ${p}`);

  const base_dir = getBaseDir(req);
  console.log('base_dir: ', base_dir);

  if (!p.startsWith(base_dir)) {
    res.status(403).send('Forbidden');
    return;
  }

  req.query.path = p;
  console.log('req.query.path: ', req.query.path);
  console.log('next()');
  next();
}

const get_mount_dir = (req) => {
  const base_dir_key = getBaseDirKey(req);
  console.log('get_mount_dir(): base_dir:', base_dir_key);
  console.log('config.filesystem.base_dir.slateScratch:', config.filesystem.base_dir.slateScratch);
  console.log('config.filesystem.base_dir.slateProject:', config.filesystem.base_dir.slateProject);
  console.log('config.filesystem.mount_dir[base_dir]:', config.filesystem.mount_dir[base_dir_key]);
  return config.filesystem.mount_dir[base_dir_key];

  // switch (base_dir) {
  //   case config.filesystem.base_dir.slateScratch:
  //     return config.filesystem.mount_dir.slateScratch;
  //   case config.filesystem.base_dir.slateProject:
  //     return config.filesystem.mount_dir.slateProject;
  //   default:
  //     return null;
  // }
};

const get_mounted_search_dir = (req) => {
  const base_dir = getBaseDir(req);
  const path_prefix = `${base_dir}/`;

  const query_path = req.query.path.slice(req.query.path.indexOf(path_prefix)
    + path_prefix.length);
  console.log('query_path: ', query_path);

  const mount_dir = get_mount_dir(req);

  console.log('FILESYSTEM_MOUNT_DIR: ', mount_dir);

  const mounted_search_dir = path.join(mount_dir, query_path);
  console.log('mounted_search_dir: ', mounted_search_dir);

  return mounted_search_dir;
};

router.get(
  '/',
  validatePath,
  isPermittedTo('read'),
  query('dirs_only').optional().default(false),
  query('search_space').optional().escape().notEmpty(),
  asyncHandler(async (req, res) => {
    // console.log('current path: ', __dirname);

    const { dirs_only, path: query_path } = req.query;

    if (!query_path) {
      res.json([]);
      return;
    }

    // const query_path = req.query.path;

    // const base_dir = Object.values(config.filesystem.base_dir).filter((dir)
    // => req.query.path.startsWith(dir))[0]; console.log('base_dir: ',
    // base_dir);
    //
    const mounted_search_dir = get_mounted_search_dir(req);
    console.log('mounted_search_dir: ', mounted_search_dir);

    if (!fs.existsSync(mounted_search_dir)) {
      res.json([]);
      return;
    }

    const files = fs.readdirSync(mounted_search_dir, {
      withFileTypes: true,
    });

    let filesData = files.map((f) => {
      console.dir(f, { depth: null });
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

    // let filesData = _.range(0, 3).map((e, i) => ({
    //   name: `file-${e}-${i}`,
    //   // name: `f${i}`,
    //   isDir: true,
    //   path: `${req.query.path}`,
    // }));

    filesData = _.compact(filesData);
    console.log('filesData: ', filesData);

    res.json(filesData);
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
