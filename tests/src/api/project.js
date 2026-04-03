const { randomUUID } = require('crypto');
const {
  get, patch, post, put,
} = require('./index');

/**
 * Creates a project, generating a unique name when one is not provided.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, data?: Record<string, any>}=} params
 * @returns {Promise<Record<string, any>>}
 */
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

/**
 * Fetches one project by id.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, id: number|string, params?: Record<string, any>}=} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Replaces associated datasets for a project.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, id: number|string, data: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
const editProjectDatasets = async ({
  requestContext,
  token,
  id,
  data,
}) => patch({
  requestContext, url: `/projects/${id}/datasets`, token, data,
});

/**
 * Replaces associated users for a project.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, id: number|string, data: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
const editProjectUsers = async ({
  requestContext,
  token,
  id,
  data,
}) => put({
  requestContext, url: `/projects/${id}/users`, token, data,
});

/**
 * Checks whether a project exists via search query.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, params: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
const projectExists = async ({
  requestContext,
  token,
  params,
}) => get({
  requestContext, url: '/projects', token, params,
});

/**
 * Generates a unique project name by searching for collisions.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, baseName?: string}} params
 * @returns {Promise<string>}
 * @throws {Error} When generated candidate already exists.
 */
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
