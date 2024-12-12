import api from "./api";

class StatisticsService {
  log_data_access({ access_type, file_id, dataset_id }) {
    return api.post("/statistics/data-access-log", null, {
      params: {
        access_type,
        file_id,
        dataset_id,
      },
    });
  }

  /**
   * Retrieves data access logs for the date range provided
   * @param {Date} start_date Starting date for the data access logs retrieved
   * @param {Date} end_date   End date for the data access logs retrieved
   * @param {Boolean} by_access_type   If true, results will be grouped by date and access type
   *                                   (browser download vs Slate-Scratch
   *                                   access)
   * @returns Promise which resolves with the array of data access logs retrieved
   */
  getDataAccessCountGroupedByDate(start_date, end_date, by_access_type) {
    return api.get("/statistics/data-access-count-by-date", {
      params: {
        start_date,
        end_date,
        by_access_type,
      },
    });
  }

  /**
   * Retrieves data access logs grouped by type of data access (browser
   * download vs Slate-Scratch access)
   */
  getDataAccessCountGroupedByAccessMethod() {
    return api.get("/statistics/data-access-count-by-access-method");
  }

  getMostAccessedData(limit, include_datasets) {
    return api.get(`/statistics/most-accessed-data`, {
      params: {
        limit,
        include_datasets,
      },
    });
  }

  getDataAccessTimestampRange() {
    return api.get(`/statistics/data-access-timestamp-range`);
  }

  /**
   * Retrieves stage attempt logs for the date range provided
   * @param {Date} start_date Starting date for stage request logs retrieved
   * @param {Date} end_date   End date for the stage request logs retrieved
   * @returns Promise which resolves with the array of stage request logs retrieved
   */
  getStageRequestCountGroupedByDate(start_date, end_date) {
    return api.get("/statistics/stage-request-count-by-date", {
      params: {
        start_date,
        end_date,
      },
    });
  }

  getMostStagedDatasets(limit) {
    return api.get(`/statistics/most-staged-datasets`, {
      params: {
        limit,
      },
    });
  }

  getStageRequestTimestampRange() {
    return api.get(`/statistics/stage-request-timestamp-range`);
  }

  getUserCountGroupedByDate() {
    return api.get("/statistics/user-count");
  }

  getUsersByBandwidthConsumption(limit) {
    return api.get("/statistics/users-by-bandwidth", {
      params: {
        limit,
      },
    });
  }
}

export default new StatisticsService();
