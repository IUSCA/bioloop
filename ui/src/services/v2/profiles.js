import api from "@/services/api";

/**
 * Writing the profile of a group or a collection.
 *
 * Every write here is authenticated and goes through the shared client.
 *
 * @see docs/design/groups/profiles.md — The UI
 */
export default {
  /** Update a group profile. `version` is the optimistic lock the API checks. */
  updateGroup(id, data, version) {
    return api.patch(`/groups/${id}/profile`, { ...data, version });
  },

  updateCollection(id, data, version) {
    return api.patch(`/collections/${id}/profile`, { ...data, version });
  },
};
