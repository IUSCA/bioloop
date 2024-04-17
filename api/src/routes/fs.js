const fsPromises = require('fs').promises;
const express = require('express');
const path = require('node:path');
const { exec } = require('child_process');

const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('datasets');
const router = express.Router();

const BASE_PATH = '/Users/deduggi/';

function validatePath(req, res, next) {
  let p = req.query.path ? path.normalize(req.query.path) : null;
  // Ensure the path is an absolute path
  if (!p || !path.isAbsolute(p)) {
    res.status(400).send('Invalid path');
    return;
  }

  p = path.resolve(p);

  // Ensure the path is within the base path
  if (!p.startsWith(BASE_PATH)) {
    res.status(403).send('Forbidden');
  }

  req.query.path = p;
  next();
}

router.get(
  '/',
  validatePath,
  // isPermittedTo('create'),
  asyncHandler(async (req, res) => {
    const files = await fsPromises.readdir(req.query.path, { withFileTypes: true });
    const filesData = files.map((f) => ({
      name: f.name,
      isDir: f.isDirectory(),
      path: path.join(req.query.path, f.name),
    }));
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
    // we will use SSE to keep connection alive and send the size when it's ready
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    // get the size of the directory by spawning a child process to run "du -sb /path"
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
