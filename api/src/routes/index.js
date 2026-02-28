const express = require('express');

const { authenticate } = require('../middleware/auth');
const featureService = require('../services/features');
const uploadRouter = require('./datasets/uploads');
const fsRouter = require('./fs');

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
  router.use('/datasets/uploads', uploadRouter);
}

router.use('/datasets', require('./datasets'));
router.use('/metrics', require('./metrics'));
router.use('/users', require('./users'));
router.use('/workflows', require('./workflows'));
router.use('/projects', require('./projects'));
router.use('/statistics', require('./statistics'));
router.use('/notifications', require('./notifications'));
router.use('/instruments', require('./instruments'));
router.use('/uploads', require('./uploads'));
router.use('/alerts', require('./alerts'));
router.use('/groups', require('./groups'));
router.use('/collections', require('./collections'));
router.use('/access-requests', require('./access_requests'));
router.use('/datasets/v2', require('./datasets_v2'));
router.use('/grants', require('./grants'));

if (featureService.isFeatureEnabled({ key: 'fs' })) {
  router.use('/fs', fsRouter);
}

module.exports = router;
