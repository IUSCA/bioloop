const { createAccessRequest, updateAccessRequest, submitRequest } = require('./request');
const {
  getRequestById,
  getRequestsReviewedByUser,
  getRequestsPendingReviewForUser,
  getRequestsByUser,
} = require('./fetch');
const { submitReview } = require('./review');
const { expireStaleRequests, withdrawRequest } = require('./lifecycle');

// Transitions are shown for documentation purposes
// Enforced in each service method independently based on the action being performed
const config = {
  states: ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  transitions: [
    {
      from: 'DRAFT', to: 'UNDER_REVIEW', action: 'SUBMIT', roles: ['REQUESTER'],
    },
    {
      from: 'DRAFT', to: 'WITHDRAWN', action: 'WITHDRAW', roles: ['REQUESTER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'APPROVED', action: 'APPROVE', roles: ['REVIEWER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'PARTIALLY_APPROVED', action: 'PARTIAL_APPROVE', roles: ['REVIEWER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'REJECTED', action: 'REJECT', roles: ['REVIEWER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'WITHDRAWN', action: 'WITHDRAW', roles: ['REQUESTER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'EXPIRED', action: 'EXPIRE', roles: ['SYSTEM'],
    },
  ],
};

module.exports = {
  createAccessRequest,
  updateAccessRequest,
  submitRequest,
  submitReview,
  withdrawRequest,
  expireStaleRequests,
  getRequestById,
  getRequestsByUser,
  getRequestsPendingReviewForUser,
  getRequestsReviewedByUser,
  ACCESS_REQUEST_STATES: config.states,
};
