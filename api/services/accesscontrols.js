const AccessControl = require('accesscontrol');

const grantsObject = {
  admin: {
    user: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
  },
  user: {
    user: {
      'read:own': ['*'],
      'update:own': ['*'],
    },
  },
};
const ac = new AccessControl(grantsObject);

module.exports = ac;
