const Policy = require('../base/policy');

const isPlatformAdmin = Policy({
  name: 'isPlatformAdmin',
  resourceType: null, // this policy is not tied to a specific resource type
  requires: {
    user: ['roles'],
  },
  evaluate: (user) => user.roles?.includes('admin'),
});

module.exports = {
  isPlatformAdmin,
};
