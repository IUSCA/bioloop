import api from "./api";

export default {
  /**
   * Get all configured import sources.
   * @returns {Promise} Axios response with list of import_source records
   */
  getSources() {
    return api.get("/datasets/imports/sources");
  },

  /**
   * Returns a display label for an import source, falling back to its path.
   * @param {Object} source - import_source record
   * @returns {string}
   */
  _getLabel(source) {
    return source?.label || source?.path || "";
  },
};
