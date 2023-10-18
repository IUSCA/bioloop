const express = require('express');
const createError = require('http-errors');
const config = require('config');

const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => { res.send('OK'); });
router.get('/favicon.ico', (req, res) => res.status(204));

// From this point on, all routes require authentication.
router.use(authenticate);

function remove_leading_slash(str) {
  return str?.replace(/^\/+/, '');
}

router.get('*', (req, res, next) => {
  const SCOPE_PREFIX = config.get('scope_prefix');

  const scopes = (req.token?.scope || '').split(' ');
  const downoad_scopes = scopes.filter((scope) => scope.startsWith(SCOPE_PREFIX));

  if (downoad_scopes.length === 0) {
    return next(createError.Forbidden('Invalid scope'));
  }

  const token_file_path = remove_leading_slash(downoad_scopes[0].slice(SCOPE_PREFIX.length));
  const req_path = remove_leading_slash(req.path);

  if (req_path === token_file_path) {
    res.set('X-Accel-Redirect', `/data/${token_file_path}`);

    // make browser download response instead of attempting to render it
    res.set('content-type', 'application/octet-stream; charset=utf-8');

    // makes nginx not cache the response file
    // otherwise the response cuts off at 1GB as the max buffer size is reached
    // and the file download fails
    // https://stackoverflow.com/a/64282626
    res.set('X-Accel-Buffering', 'no');
    res.send('');
  } else {
    return next(createError.Forbidden('Invalid path'));
  }
});

module.exports = router;
