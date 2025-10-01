const { patch, get } = require('./index');

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
}) => patch({
  requestContext, url: `/projects/${id}/users`, token, data,
});

module.exports = {
  editProjectDatasets,
  editProjectUsers,
  getProjectById,
};
