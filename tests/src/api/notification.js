const { post, deleteApi } = require('./index');

const createNotification = async ({
  requestContext, token, data,
}) => post({
  requestContext, url: '/notifications', token, data,
});

const deleteNotifications = async ({
  requestContext, token, params,
}) => deleteApi({
  requestContext, url: '/notifications', token, params,
});

module.exports = {
  createNotification,
  deleteNotifications,
};
