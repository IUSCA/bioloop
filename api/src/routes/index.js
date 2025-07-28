const express = require('express');

const { authenticate } = require('../middleware/auth');
const featureService = require('../services/features');
const uploadRouter = require('./datasets/uploads');

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
 * Note: The `/datasets/uploads` route needs to be registered before the `/datasets` route.
 * If the `/datasets` route is registered first, Express interprets the path `/datasets/uploads`
 * as a call to the `/datasets/:datasetId` API.
 */
if (featureService.isFeatureEnabled({ key: 'upload' })) {
  router.use('/datasets/uploads', uploadRouter /* #swagger.security = [{"BearerAuth": []}] */);
}

router.use('/datasets', require('./datasets') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/metrics', require('./metrics') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/users', require('./users') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/workflows', require('./workflows') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/projects', require('./projects') /* #swagger.security = [{"BearerAuth": []}] */);

if (featureService.isFeatureEnabled({ key: 'fs' })) {
  router.use('/fs', require('./fs') /* #swagger.security = [{"BearerAuth": []}] */);
}
router.use('/statistics', require('./statistics') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/notifications', require('./notifications') /* #swagger.security = [{"BearerAuth": []}] */);
router.use('/instruments', require('./instruments') /* #swagger.security = [{"BearerAuth": []}] */);

module.exports = router;
