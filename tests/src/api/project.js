const {
  get, patch, post, put,
} = require('./index');

const createProject = async ({
  requestContext, token, data,
}) => {
  const response = await post({
    requestContext, url: '/projects', token, data,
  });
  const body = await response.json();
  return body;
};

const getProjectById = async ({
  requestContext, token, id,
} = {}) => get({
  requestContext, url: `/projects/${id}`, token,
});

const editProjectDatasets = async ({
  requestContext, token, id, data,
}) => patch({
  requestContext, url: `/projects/${id}/datasets`, token, data,
});

const editProjectUsers = async ({
  requestContext, token, id, data,
}) => put({
  requestContext, url: `/projects/${id}/users`, token, data,
});

module.exports = {
  editProjectDatasets,
  editProjectUsers,
  createProject,
  getProjectById,
};
