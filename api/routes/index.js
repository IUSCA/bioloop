const express = require('express');

const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => {
  res.send('OK');
});
router.use('/auth', require('./auth'));

// From this point on, all routes require authentication.
router.use(authenticate);

router.get('/protected/health', (req, res) => {
  res.send('OK');
});

router.use('/batch', require('./batch'));

module.exports = router;
