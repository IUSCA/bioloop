const { prefixedApiPath } = require('../utils/api');
const { patch, get } = require('./index');

const getAll = async ({
  requestContext, token, params,
}) => get({
  requestContext, url: prefixedApiPath('projects/all'), token, params,
});

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

module.exports = {
  getAll,
  editProjectDatasets,
  getProjectById,
};
