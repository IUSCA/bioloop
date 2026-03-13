import RequestApproved from "./RequestApproved.vue";
import RequestCreated from "./RequestCreated.vue";
import RequestExpired from "./RequestExpired.vue";
import RequestPartiallyApproved from "./RequestPartiallyApproved.vue";
import RequestRejected from "./RequestRejected.vue";
import RequestSubmitted from "./RequestSubmitted.vue";
import RequestUpdated from "./RequestUpdated.vue";
import RequestWithdrawn from "./RequestWithdrawn.vue";

export default {
  REQUEST_CREATED: RequestCreated,
  REQUEST_UPDATED: RequestUpdated,
  REQUEST_SUBMITTED: RequestSubmitted,
  REQUEST_APPROVED: RequestApproved,
  REQUEST_REJECTED: RequestRejected,
  REQUEST_PARTIALLY_APPROVED: RequestPartiallyApproved,
  REQUEST_WITHDRAWN: RequestWithdrawn,
  REQUEST_EXPIRED: RequestExpired,
};
