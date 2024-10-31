const express = require('express');

const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => { res.send('OK'); });
router.get('/favicon.ico', (req, res) => res.status(204));

router.get(
  '/test',
  (req, res) => {
    res.json("hello")
  }
)

// From this point on, all routes require authentication.
router.use(authenticate);

router.use('/download', require('./download'));
router.use('/upload', require('./upload'));

module.exports = router;
