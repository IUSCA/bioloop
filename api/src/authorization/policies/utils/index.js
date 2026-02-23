const Policy = require('@/authorization/policies/base/policy');

const isPlatformAdmin = new Policy({
  name: 'isPlatformAdmin',
  resourceType: null, // this policy is not tied to a specific resource type
  requires: {
    user: ['roles'],
  },
  evaluate: (user) => user?.roles?.includes('admin') === true,
});

module.exports = {
  isPlatformAdmin,
};
