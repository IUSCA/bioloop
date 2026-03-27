const express = require('express');

const { authenticate } = require('../middleware/auth');
const featureService = require('../services/features');
const uploadRouter = require('./datasets/uploads');
const importRouter = require('./datasets/imports');
const fsRouter = require('./fs');
const notificationsRouter = require('./notifications');

const router = express.Router();

router.get('/health', (req, res) => {
  res.send('OK');
});
router.use('/auth', require('./auth/index'));
router.use('/reports', require('./reports'));
router.use('/about', require('./about'));
router.use('/env', require('./env'));

// From this point on, all routes require authentication.
router.use(authenticate);

/**
 * Sub-routes under /datasets must be registered before /datasets itself,
 * otherwise Express interprets /datasets/anything as /datasets/:datasetId.
 */
if (featureService.isFeatureEnabled({ key: 'upload' })) {
  router.use('/datasets/uploads', uploadRouter /* #swagger.security = [{"BearerAuth": []}] */);
}
if (featureService.isFeatureEnabled({ key: 'import' })) {
  router.use('/datasets/imports', importRouter /* #swagger.security = [{"BearerAuth": []}] */);
}

router.use('/datasets', require('./datasets') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/metrics', require('./metrics') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/users', require('./users') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/workflows', require('./workflows') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/projects', require('./projects') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/statistics', require('./statistics') /* #swagger.security = [{"BearerAuth": []}] */);

if (featureService.isFeatureEnabled({ key: 'notifications' })) {
  router.use('/notifications', notificationsRouter /* #swagger.security = [{"BearerAuth": []}] */);
}
router.use('/instruments', require('./instruments') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/uploads', require('./datasets/uploads') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/alerts', require('./alerts') /* #swagger.security = [{"BearerAuth": []}] */);

if (featureService.isFeatureEnabled({ key: 'fs' })) {
  router.use('/fs', fsRouter /* #swagger.security = [{"BearerAuth": []}] */);
}

module.exports = router;
