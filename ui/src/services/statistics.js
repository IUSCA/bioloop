import api from "./api";
import { useToastStore } from "@/stores/toast";

const toast = useToastStore();

class StatisticsService {
  log_data_access({ access_type, file_id, dataset_id, user_id }) {
    return api.post("/statistics/data-access-log", null, {
      params: {
        access_type,
        file_id,
        dataset_id,
        user_id,
      },
    });
  }

  /**
   * Retrieves data access logs for the date range provided
   * @param {Date} start_date Starting date for the data access logs retrieved
   * @param {Date} end_date   End date for the data access logs retrieved
   * @param {Boolean} by_access_type   If true, results will be grouped by date and access type
   *                                   (browser download vs Slate-Scratch access)
   * @returns Promise which resolves with the array of data access logs retrieved
   */
  getDataAccessCountGroupedByDate(start_date, end_date, by_access_type) {
    return api
      .get("/statistics/data-access-count-by-date", {
        params: {
          start_date,
          end_date,
          by_access_type,
        },
      })
      .catch((err) => {
        console.log("Unable to retrieve data access counts by date", err);
        toast.error("Unable to retrieve data access counts by date");
      });
  }

  /**
   * Retrieves data access logs grouped by type of data access (browser download vs Slate-Scratch
   * access)
   */
  getDataAccessCountGroupedByAccessMethod() {
    return api
      .get("/statistics/data-access-count-by-access-method")
      .catch((err) => {
        console.log("Unable to retrieve data access counts by type", err);
        toast.error("Unable to retrieve data access counts by type");
      });
  }

  getMostAccessedData(limit, include_datasets) {
    return api
      .get(`/statistics/most-accessed-data`, {
        params: {
          limit,
          include_datasets,
        },
      })
      .catch((err) => {
        console.log("Unable to retrieve most accessed files", err);
        toast.error("Unable to retrieve most accessed files");
      });
  }

  getDataAccessTimestampRange() {
    return api.get(`/statistics/data-access-timestamp-range`).catch((err) => {
      console.log("Unable to retrieve data access timestamp range", err);
      toast.error("Unable to retrieve data access timestamp range");
    });
  }

  /**
   * Retrieves stage attempt logs for the date range provided
   * @param {Date} start_date Starting date for stage request logs retrieved
   * @param {Date} end_date   End date for the stage request logs retrieved
   * @returns Promise which resolves with the array of stage request logs retrieved
   */
  getStageRequestCountGroupedByDate(start_date, end_date) {
    return api
      .get("/statistics/stage-request-count-by-date", {
        params: {
          start_date,
          end_date,
        },
      })
      .catch((err) => {
        console.log("Unable to retrieve stage request counts by date", err);
        toast.error("Unable to retrieve stage request counts by date");
      });
  }

  getMostStagedDatasets(limit) {
    return api
      .get(`/statistics/most-staged-datasets`, {
        params: {
          limit,
        },
      })
      .catch((err) => {
        console.log("Unable to retrieve most staged datasets", err);
        toast.error("Unable to retrieve most staged datasets");
      });
  }

  getStageRequestTimestampRange() {
    return api.get(`/statistics/stage-request-timestamp-range`).catch((err) => {
      console.log("Unable to retrieve stage request timestamp range", err);
      toast.error("Unable to retrieve stage request timestamp range");
    });
  }

  getUserCountGroupedByDate() {
    return api.get("/statistics/user-count").catch((err) => {
      console.log("Unable to retrieve user count", err);
      toast.error("Unable to retrieve user count");
    });
  }

  getUsersByBandwidthConsumption(limit) {
    return api
      .get("/statistics/users-by-bandwidth", {
        params: {
          limit,
        },
      })
      .catch((err) => {
        console.log("Unable to retrieve user count", err);
        toast.error("Unable to retrieve user count");
      });
  }
}

export default new StatisticsService();
