const { patch } = require('./index');

const getProjectById = async ({
  requestContext, token, id,
}) => patch({
  requestContext, url: `/projects/${id}`, token,
});

const editProject = async ({
  requestContext, token, id, data,
}) => patch({
  requestContext, url: `/projects/${id}/datasets`, token, data,
});

module.exports = {
  editProject,
  getProjectById,
};
