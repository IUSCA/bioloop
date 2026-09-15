import api from "../api";

class RestrictionService {
  /** The qualified actions a restriction type blocks, as `{ type, blocked_actions }`. */
  blockedActions(type) {
    return api.get(`/v2/restrictions/${type}/blocked-actions`);
  }
}

export default new RestrictionService();
