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
    datasets: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    projects: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    project_dataset_files: {
      'read:any': ['*'],
    },
    statistics: {
      'create:any': ['*'],
      'read:any': ['*'],
    },
    metrics: {
      'create:any': ['*'],
      'read:any': ['*'],
    },
    uploads: {
      'create:any': ['*'],
    },
    about: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    auth: {
      'create:any': ['*'],
    },
  },

  // user role permissions
  user: {
    user: {
      'read:own': ['*'],
      'update:own': ['*'],
    },
    projects: {
      'read:own': ['*', '!users'], // cannot read associated users to the project
    },
    project_dataset_files: {
      'read:own': ['*'],
    },
    workflow: {
      'create:any': ['stage'], // can only create a stage workflow
    },
  },

  // operator role permissions
  operator: {
    user: {
      'read:any': ['*'],
      'update:any': ['*', '!roles'], // cannot update roles attribute of a user
      'create:any': ['*', '!roles'], // cannot set roles attribute while creating a user
    },
    workflow: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    datasets: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    projects: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    project_dataset_files: {
      'read:any': ['*'],
    },
    statistics: {
      'read:any': ['*'],
    },
    metrics: {
      'read:any': ['*'],
    },
    about: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    uploads: {
      'create:any': ['*'],
    },
  },
};
const ac = new AccessControl(grantsObject);

module.exports = ac;
