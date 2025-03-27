const express = require('express');

const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => { res.send('OK'); });
router.use('/auth', require('./auth/index'));
router.use('/reports', require('./reports'));
router.use('/about', require('./about'));
router.use('/env', require('./env'));

// From this point on, all routes require authentication.
router.use(authenticate);

router.use('/datasets', require('./datasets'));
router.use('/resource-metrics', require('./metrics'));
router.use('/users', require('./users'));
router.use('/workflows', require('./workflows'));
router.use('/projects', require('./projects'));
router.use('/statistics', require('./statistics'));
router.use('/notifications', require('./notifications'));
router.use('/fs', require('./fs'));
router.use('/uploads', require('./uploads'));
router.use('/datasetUploads', require('./datasetUploads'));

module.exports = router;
