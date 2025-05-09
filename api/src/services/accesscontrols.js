const AccessControl = require('accesscontrol'); // cspell: disable-line

const CONSTANTS = require('../constants');

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
    dataset_name: {
      'read:any': ['*'],
    },
    instruments: {
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
    about: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    auth: {
      'create:any': ['*'],
    },
    notifications: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    fs: {
      'read:any': ['*'],
    },
    upload: {
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
    datasets: {
      'create:any': ['*'],
      'read:own': ['*'],
      'update:own': ['*'],
    },
    dataset_name: {
      'read:any': ['*'],
    },
    project_dataset_files: {
      'read:own': ['*'],
    },
    workflow: {
      // user role can only create these four workflows
      'create:any': [
        CONSTANTS.WORKFLOWS.INTEGRATED,
        CONSTANTS.WORKFLOWS.STAGE,
        CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD,
        CONSTANTS.WORKFLOWS.CANCEL_DATASET_UPLOAD,
      ],
    },
    instruments: {
      'read:any': ['*'],
    },
    statistics: {
      'create:any': ['*'],
      'read:any': ['*'],
    },
    upload: {
      'create:any': ['*'],
    },
    fs: {
      'read:any': ['*'],
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
    },
    datasets: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    dataset_name: {
      'read:any': ['*'],
    },
    instruments: {
      'create:any': ['*'],
      'read:any': ['*'],
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
      'read:any': ['*'],
    },
    about: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    notifications: {
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
    fs: {
      'read:any': ['*'],
    },
    upload: {
      'create:any': ['*'],
    },
  },
};
const ac = new AccessControl(grantsObject);

module.exports = ac;
