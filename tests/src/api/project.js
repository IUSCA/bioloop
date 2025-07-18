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

module.exports = {
  editProjectDatasets,
  getProjectById,
};
