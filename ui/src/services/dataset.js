import api from "./api";
import config from "@/config";
import { useToastStore } from "@/stores/toast";

const toast = useToastStore();

class DatasetService {
  getAll({ deleted = null, processed = null, type = null } = {}) {
    return api.get("/datasets", {
      params: {
        deleted,
        processed,
        type,
      },
    });
  }

  getById({
    id,
    files = false,
    workflows = true,
    last_task_run = false,
    prev_task_runs = false,
    only_active = false,
  }) {
    return api.get(`/datasets/${id}`, {
      params: {
        files,
        workflows,
        last_task_run,
        prev_task_runs,
        only_active,
      },
    });
  }

  stage_dataset(id, user_id) {
    return api
      .post(`/datasets/${id}/workflow/stage`, null, {
        params: { user_id },
      })
      .then(() => {
        toast.success("A workflow has started to stage the dataset");
      })
      .catch((err) => {
        console.error("unable to stage the dataset", err);
        toast.error("Unable to stage the dataset");
        return Promise.reject(err);
      });
  }

  archive_dataset(id) {
    return api.post(`/datasets/${id}/workflow/integrated`);
  }

  delete_dataset({ id, soft_delete = true }) {
    return api.delete(`/datasets/${id}`, {
      params: {
        soft_delete,
      },
    });
  }

  getStats({ type }) {
    return api.get("/datasets/stats", {
      params: {
        type,
      },
    });
  }

  // is_staged(states) {
  //   return (
  //     (states || []).filter((s) => (s?.state || "").toLowerCase() == "staged")
  //       .length > 0
  //   );
  // }

  get_staged_path(dataset) {
    if (dataset?.metadata?.stage_alias) {
      const dataset_type = dataset.type;
      return `${config.paths.stage[dataset_type]}/${dataset.metadata.stage_alias}/${dataset.name}`;
    }
  }

  update({ id, updated_data }) {
    return api.patch(`/datasets/${id}`, updated_data);
  }

  list_files({ id, basepath }) {
    return api.get(`/datasets/${id}/files`, {
      params: {
        basepath,
        id: config.file_browser.cache_busting_id,
      },
    });
  }

  get_file_download_data({ dataset_id, file_id, user_id }) {
    return api.get(`/datasets/${dataset_id}/files/${file_id}/download`, {
      params: {
        user_id,
      },
    });
  }

  search_files({
    id,
    name,
    location,
    skip,
    take,
    extension,
    filetype,
    minSize,
    maxSize,
  }) {
    return api.get(`/datasets/${id}/files/search`, {
      params: {
        name,
        basepath: location,
        skip,
        take,
        extension,
        filetype,
        min_file_size: minSize,
        max_file_size: maxSize,
      },
    });
  }
}

export default new DatasetService();
