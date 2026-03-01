import api from "@/services/api";

export default {
  /**
   * GET /access-requests/requested-by-me — all requests raised by the current user.
   * Returns {metadata:{total, limit, offset}, data: Array}
   */
  requestedByMe() {
    return api.get("/access-requests/requested-by-me");
  },

  /**
   * GET /access-requests/my-pending-reviews — requests awaiting the current user's review.
   * Only returns data for group admins and platform admins.
   * Returns {metadata:{total, limit, offset}, data: Array}
   */
  pendingReview() {
    return api.get("/access-requests/my-pending-reviews");
  },

  /**
   * GET /access-requests/reviewed-by-me — requests already reviewed by the current user.
   * Returns {metadata:{total, limit, offset}, data: Array}
   */
  reviewedByMe() {
    return api.get("/access-requests/reviewed-by-me");
  },

  /** GET /access-requests/:id — get a specific request by ID. */
  get(id) {
    return api.get(`/access-requests/${id}`);
  },

  /**
   * POST /access-requests/ — create a new access request.
   * @param {{ resource_type: 'DATASET'|'COLLECTION', resource_id, purpose, items: Array }} data
   */
  create(data) {
    return api.post("/access-requests/", data);
  },

  /** PUT /access-requests/:id — update a DRAFT status request. */
  update(id, data) {
    return api.put(`/access-requests/${id}`, data);
  },

  /** POST /access-requests/:id/submit — submit a draft request for review. */
  submit(id) {
    return api.post(`/access-requests/${id}/submit`);
  },

  /**
   * POST /access-requests/:id/review — submit review decisions.
   * @param {string} id
   * @param {{ items: Array<{ id, decision: 'APPROVED'|'REJECTED', requested_until?, justification? }> }} decisions
   */
  review(id, decisions) {
    return api.post(`/access-requests/${id}/review`, decisions);
  },

  /** POST /access-requests/:id/withdraw — withdraw a pending request. */
  withdraw(id) {
    return api.post(`/access-requests/${id}/withdraw`);
  },
};
