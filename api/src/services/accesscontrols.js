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
    datasetUploads: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
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
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
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
      'create:own': ['*'],
      'read:own': ['*', '!projects'], // cannot read projects that this dataset is assigned to
    },
    project_dataset_files: {
      'read:own': ['*'],
    },
    workflow: {
      // user role can only create these four workflows
      'create:any': ['integrated', 'stage', 'process_dataset_upload', 'cancel_dataset_upload'],
    },
    datasetUploads: {
      'create:any': ['*'],
      'read:own': ['*'],
      'update:own': ['*'],
      'delete:own': ['*'],
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
      'read:own': ['*'],
      'update:own': ['*'],
      'delete:own': ['*']
    },
    fs: {
      'read:any': ['*'],
    }
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
    datasetUploads: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
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
