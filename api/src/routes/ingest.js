const fs = require('fs');
const fsPromises = require('fs').promises;
const express = require('express');
const path = require('node:path');
const { exec } = require('child_process');

const config = require('config');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('fs');

const router = express.Router();

// // todo - these must be sent with the request
// const BASE_PATH = config.filesystem_scratch_source_dir;
// const FILESYSTEM_BASE_DIR_PROJECT = config.dataset_ingestion_source_mount;

const base_dirs = Object.values(config.filesystem.base_dir);

function validatePath(req, res, next) {
  const query_path = req.query.path;
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

  const filtered_base_dirs = base_dirs.filter((dir) => p.startsWith(dir));
  console.log('filtered_base_dirs: ', filtered_base_dirs);

  if (filtered_base_dirs.length === 0) {
    res.status(403).send('Forbidden');
    return;
  }

  req.query.path = p;
  console.log('req.query.path: ', req.query.path);
  console.log('next()');
  next();
}

// router.get(
//   '/',
//   (req, res) => {
//     res.send('ok');
//   },
// );

const get_mount_dir = (base_dir) => {
  console.log('get_mount_dir(): base_dir:', base_dir);
  console.log('config.filesystem.base_dir.scratch:', config.filesystem.base_dir.scratch);
  console.log('config.filesystem.base_dir.project:', config.filesystem.base_dir.project);
  switch (base_dir) {
    case config.filesystem.base_dir.scratch:
      return config.filesystem.mount_dir.scratch;
    case config.filesystem.base_dir.project:
      return config.filesystem.mount_dir.project;
    default:
      return null;
  }
};

const get_search_dir = (req) => {
  const base_dir = Object.values(config.filesystem.base_dir).filter((dir) => req.query.path.startsWith(dir))[0];
  console.log('base_dir: ', base_dir);
  const path_prefix = `${base_dir}/`;

  const query_rel_path = req.query.path.slice(req.query.path.indexOf(path_prefix)
    + path_prefix.length);
  console.log('query_rel_path: ', query_rel_path);

  const mount_dir = get_mount_dir(base_dir);

  console.log('FILESYSTEM_MOUNT_DIR: ', mount_dir);

  const dir_path = path.join(mount_dir, query_rel_path);
  console.log('dir_path: ', dir_path);

  return dir_path;
};

// TODO - validatePath,
router.get(
  '/',
  validatePath,
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // console.log('current path: ', __dirname);

    const dir_path = get_search_dir(req);
    console.log('dir_path: ', dir_path);

    // if (dir_path !== FILESYSTEM_BASE_DIR_PROJECT) {
    //   res.json()
    //   res.json([]);
    //   return
    // }

    if (!fs.existsSync(dir_path)) {
      res.json([]);
      return;
    }

    const files = fs.readdirSync(dir_path, { withFileTypes: true });

    const filesData = files.map((f) => {
      console.dir(f, { depth: null });
      return {
        name: f.name,
        isDir: f.isDirectory(),
        path: path.join(req.query.path, f.name),
      };
    });

    // const filesData = [
    //   {
    //     name: '00_SCRATCH_FILES_DELETED_AFTER_30_DAYS.txt',
    //     isDir: false,
    //     path: `/${dir_path}/${req.query.path}/dir-1`,
    //   },
    //   {
    //     name: 'Landing',
    //     isDir: true,
    //     path: `/${dir_path}/${req.query.path}/dir-2`,
    //   },
    //   {
    //     name: 'bioloop',
    //     isDir: true,
    //     path: `/${dir_path}/${req.query.path}/dir-3`,
    //   },
    // ];

    res.json(filesData);
  }),
);

router.get(
  '/dir-size',
  validatePath,
  asyncHandler(async (req, res) => {
    const dir_path = get_search_dir(req);
    console.log('dir_path: ', dir_path);

    // check if the path is a directory
    const stats = await fsPromises.stat(dir_path);
    if (!stats.isDirectory()) {
      console.log(dir_path, 'is not a directory');
      res.status(400).send('Not a directory');
    }

    // As du -sb /path is a long running command,
    // we will use SSE to keep connection alive and send the size when it's
    // ready
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    console.log('sse started');

    // get the size of the directory by spawning a child process to run "du -sb
    // /path"
    exec(`du -s ${dir_path}`, (err, stdout) => {
      if (err) {
        console.error(`du -s`);
        console.error(err);
        res.status(500).end();
        return;
      }
      const size = parseInt(stdout.split('\t')[0], 10);
      // send "message" type event to the client
      console.log('before write')
      res.write(`data: ${JSON.stringify({ size })}\n\n`);
      res.write('event: done\ndata: \n\n');
      console.log('before write')

      res.end();
    });
  }),
);

module.exports = router;
