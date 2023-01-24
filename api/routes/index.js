const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.send('OK')
})

router.use('/batch', require('./batch'));

module.exports = router;
