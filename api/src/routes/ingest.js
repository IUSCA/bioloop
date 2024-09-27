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

const BASE_PATH = config.dataset_ingestion_source_dir;
const DATASET_INGESTION_SOURCE_MOUNT = config.dataset_ingestion_source_mount;

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

  // /N/scratch/scadev
  // Ensure the path is within the base path
  if (!p.startsWith(BASE_PATH)) {
    res.status(403).send('Forbidden');
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

// TODO - validatePath,
router.get(
  '/',
  validatePath,
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    console.log('current path: ', __dirname);

    const path_prefix = `${BASE_PATH}/`;
    const query_path = req.query.path.slice(req.query.path.indexOf(path_prefix)
      + path_prefix.length);
    console.log('query_path: ', query_path);

    console.log('DATASET_INGESTION_SOURCE_MOUNT: ', DATASET_INGESTION_SOURCE_MOUNT);

    // TODO - if dir_path doesn't start with '/opt/sca', don't return any dirs

    const dir_path = path.join(DATASET_INGESTION_SOURCE_MOUNT, query_path);
    console.log('dir_path: ', dir_path);

    // if (dir_path !== DATASET_INGESTION_SOURCE_MOUNT) {
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
    //     path: '/path/1',
    //   },
    //   {
    //     name: 'Landing',
    //     isDir: true,
    //     path: '/path/2',
    //   },
    //   {
    //     name: 'bioloop',
    //     isDir: true,
    //     path: '/path/3',
    //   },
    // ];

    res.json(filesData);
  }),
);

router.get(
  '/dir-size',
  validatePath,
  asyncHandler(async (req, res) => {
    // check if the path is a directory
    const stats = await fsPromises.stat(req.query.path);
    if (!stats.isDirectory()) {
      res.status(400).send('Not a directory');
    }

    // As du -sb /path is a long running command,
    // we will use SSE to keep connection alive and send the size when it's
    // ready
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    // get the size of the directory by spawning a child process to run "du -sb
    // /path"
    exec(`du -s ${req.query.path}`, (err, stdout) => {
      if (err) {
        console.error(err);
        res.status(500).end();
        return;
      }
      const size = parseInt(stdout.split('\t')[0], 10);
      // send "message" type event to the client
      res.write(`data: ${JSON.stringify({ size })}\n\n`);
      res.write('event: done\ndata: \n\n');
      res.end();
    });
  }),
);

module.exports = router;
