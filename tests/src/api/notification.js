const { post, deleteApi } = require('./index');

/**
 * Creates notifications through the API.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, data: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
const createNotification = async ({
  requestContext, token, data,
}) => post({
  requestContext, url: '/notifications', token, data,
});

/**
 * Deletes notifications by filter params.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, params?: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
const deleteNotifications = async ({
  requestContext, token, params,
}) => deleteApi({
  requestContext, url: '/notifications', token, params,
});

module.exports = {
  createNotification,
  deleteNotifications,
};
