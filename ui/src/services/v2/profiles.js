import config from "@/config";
import api from "@/services/api";

/**
 * Writing a profile, and locating the bytes of a profile picture.
 *
 * Every write here is authenticated and goes through the shared client. The one read is
 * `groupAvatarUrl`, which returns a URL for an `<img>` tag rather than fetching anything:
 * the browser cannot attach an Authorization header to an image request, so the avatar is
 * served by the public router and authorized from the `jwt` cookie a signed-in browser
 * already carries.
 *
 * @see docs/design/groups/profiles.md — API
 */
export default {
  /** Update a group profile. `version` is the optimistic lock the API checks. */
  updateGroup(id, data, version) {
    return api.patch(`/groups/${id}/profile`, { ...data, version });
  },

  updateCollection(id, data, version) {
    return api.patch(`/collections/${id}/profile`, { ...data, version });
  },

  /** Replace the group's profile picture. `file` is a File from an <input type="file">. */
  uploadGroupAvatar(id, file) {
    const form = new FormData();
    form.append("avatar", file);
    return api.put(`/groups/${id}/avatar`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  deleteGroupAvatar(id) {
    return api.delete(`/groups/${id}/avatar`);
  },

  /**
   * Where the group's picture is served from.
   *
   * `avatarKey` is not part of the path — it is appended as a query parameter so that
   * replacing a picture changes the URL and no cache serves the old bytes.
   */
  groupAvatarUrl(id, avatarKey) {
    if (!avatarKey) return null;
    return `${config.apiBasePath}/public/groups/${id}/avatar?v=${encodeURIComponent(avatarKey)}`;
  },
};
