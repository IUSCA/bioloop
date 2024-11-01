const { patch, get } = require('./index');

const getProjectById = async ({
  requestContext, token, id,
} = {}) => {
  console.log('project api token: ', token);
  return get({
    requestContext, url: `/projects/${id}`, token,
  });
};

const editProjectDatasets = async ({
  requestContext, token, id, data,
}) => {
  console.log('project api token: ', token);
  return patch({
    requestContext, url: `/projects/${id}/datasets`, token, data,
  });
};

module.exports = {
  editProjectDatasets,
  getProjectById,
};
