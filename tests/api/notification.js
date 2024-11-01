const { post, deleteApi } = require('./index');

const createNotification = async ({
  requestContext, token, data,
}) => {
  console.log('project api token: ', token);
  return post({
    requestContext, url: '/notifications', token, data,
  });
};

const deleteNotifications = async ({
  requestContext, token, params,
}) => {
  console.log('project api token: ', token);
  return deleteApi({
    requestContext, url: '/notifications', token, params,
  });
};

module.exports = {
  createNotification,
  deleteNotifications,
};
