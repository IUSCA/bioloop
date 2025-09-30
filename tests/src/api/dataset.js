const { get } = require('./index');

const base64UrlToBase64 = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return normalized.padEnd(normalized.length + paddingLength, '=');
};

const extractTokenPayload = (token) => {
  if (!token) {
    return null;
  }

  const [, payload = ''] = token.split('.');
  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(
      base64UrlToBase64(payload),
      'base64',
    ).toString('utf8')); return decoded;
  } catch (error) { return null; }
};

const datasetExists = async ({
  requestContext, token, params,
}) => {
  const url = `/datasets/${params.type}/${params.name}/exists`;

  return get({
    requestContext,
    url,
    token,
  });
};

const getDatasets = async ({
  requestContext, token, params,
}) => {
  const decoded = extractTokenPayload(token);
  const url = (decoded?.profile?.roles?.includes('admin') || decoded?.profile?.roles?.includes('operator'))
    ? '/datasets'
    : `/datasets/${decoded?.profile?.username}/all`;
  return get({
    requestContext,
    url,
    token,
    params,
  });
};

module.exports = {
  datasetExists,
  getDatasets,
};
