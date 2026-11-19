const express = require('express');

const asyncHandler = require('../middleware/asyncHandler');
const ac = require('../services/accesscontrols');
const { isFeatureEnabledForRole } = require('../services/features');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(process.env.NODE_ENV);
  }),
);

// Expose only the effective Import roles, not the full server configuration.
router.get('/features', (req, res) => {
  const enabledForRoles = ac.getRoles().filter((roleName) => isFeatureEnabledForRole({ key: 'import', roleName }));
  res.set('Cache-Control', 'no-store');
  res.json({ import: { enabledForRoles } });
});

module.exports = router;
