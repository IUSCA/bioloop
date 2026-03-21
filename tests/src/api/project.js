const { randomUUID } = require('crypto');
const {
  get, patch, post, put,
} = require('./index');

const createProject = async ({
  requestContext,
  token,
  data = {},
} = {}) => {
  const payload = { ...data };
  if (!data.name) {
    payload.name = await generateUniqueProjectName({
      requestContext,
      token,
    });
  }
  const response = await post({
    requestContext,
    url: '/projects',
    token,
    data: payload,
  });
  const body = await response.json();
  return body;
};

const getProjectById = async ({
  requestContext,
  token,
  id,
  params = {},
} = {}) => get({
  requestContext,
  url: `/projects/${id}`,
  token,
  params: { ...params },
});

const editProjectDatasets = async ({
  requestContext,
  token,
  id,
  data,
}) => patch({
  requestContext, url: `/projects/${id}/datasets`, token, data,
});

const editProjectUsers = async ({
  requestContext,
  token,
  id,
  data,
}) => put({
  requestContext, url: `/projects/${id}/users`, token, data,
});

const projectExists = async ({
  requestContext,
  token,
  params,
}) => get({
  requestContext, url: '/projects', token, params,
});

const generateUniqueProjectName = async ({
  requestContext,
  token,
  baseName = 'Test-Project',
}) => {
  const uuid = randomUUID();
  const candidate = baseName ? `${baseName}-${uuid}` : uuid;

  const response = await projectExists({
    requestContext,
    token,
    params: {
      search: candidate,
    },
  });

  const { exists } = await response.json();

  if (!exists) {
    return candidate;
  }
  throw new Error(`Could not generate unique Project name. Generated name ${candidate} already exists.`);
};

module.exports = {
  editProjectDatasets,
  editProjectUsers,
  createProject,
  getProjectById,
  generateUniqueProjectName,
};
