import api from "./api";

class TrackService {
  /**
   *
   * @param deleted    Boolean field to filter datasets by `is_deleted` field
   * @param processed  Field to filter datasets by number of associated workflows. Can be one of
   *                   'some' or 'none'
   * @param archived   Boolean field to filter datasets by the presence/absence of `archive_path`
   *                   field
   * @param staged     Boolean field to filter datasets by `is_deleted` field
   * @param type       Field to filter datasets by `type`. One of 'RAW_DATA' or 'DATA_PRODUCT'
   * @param name       Field to filter datasets by `name`
   * @param match_name_exact Boolean field to determine whether datasets will be matched by
   *                         the exact name `name`, or names containing `name`
   * @param limit      The number of datasets to be retrieved
   * @param offset     Database offset starting at which results will be retrieved
   * @param sortBy     Object containing property to sort datasets by, whose key is the name
   *                   of said property, and value is one of 'asc' or 'desc'
   * @returns          Object containing matching datasets, and count of matching datasets
   */
  getAll(params) {
    return api.get("/datasets", {
      params,
    });
  }


}

export default new TrackService();
