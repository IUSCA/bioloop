const AccessControl = require('accesscontrol');

const grantsObject = {
  admin: {
    user: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    workflow: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    batch: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
  },

  // user role permissions - start
  user: {
    user: {
      'read:own': ['*'],
      'update:own': ['*'],
    },
  },
  // user role permissions - end

  // operator role permissions - start
  operator: {
    user: {
      'read:own': ['*'],
      'update:own': ['*'],
    },
    workflow: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    batch: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
  },
  // operator role permissions - end
};
const ac = new AccessControl(grantsObject);

module.exports = ac;
