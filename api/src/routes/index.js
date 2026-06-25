const express = require('express');

const { authenticate } = require('../middleware/auth');
const featureService = require('../services/features');
const uploadRouter = require('./datasets/uploads');
const importRouter = require('./datasets/imports');
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
 * Sub-routes under /datasets must be registered before /datasets itself,
 * otherwise Express interprets /datasets/anything as /datasets/:datasetId.
 */
if (featureService.isFeatureEnabled({ key: 'upload' })) {
  router.use('/datasets/uploads', uploadRouter);
}
if (featureService.isFeatureEnabled({ key: 'import' })) {
  router.use('/datasets/imports', importRouter /* #swagger.security = [{"BearerAuth": []}] */);
}

router.use('/v2/datasets', require('./datasets_v2'));
router.use('/v2/users', require('./users_v2'));

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
router.use('/grants', require('./grants'));
router.use('/audit', require('./audit'));
router.use('/notebooks', require('./notebooks'));

if (featureService.isFeatureEnabled({ key: 'fs' })) {
  router.use('/fs', fsRouter);
}

module.exports = router;
