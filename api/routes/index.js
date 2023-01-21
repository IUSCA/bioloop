const express = require('express');

const router = express.Router();

router.use('/batch', require('./batch'));

module.exports = router;
