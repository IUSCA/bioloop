import api from "@/services/api";

export default {
  /**
   * Import sources the current user may browse, scoped to their groups.
   * A SUSPENDED source is listed with its `status_reason` rather than hidden,
   * so an unreadable path says so instead of appearing empty.
   */
  list() {
    return api.get("/v2/import-sources");
  },

  /**
   * Browse a directory inside an import source the user may reach.
   * A trailing slash lists contents; a partial path matches siblings by substring.
   */
  browse({ path, dirs_only = true, extension = undefined }) {
    return api.get("/v2/fs", { params: { path, dirs_only, extension } });
  },
};
