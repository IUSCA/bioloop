import api from "./api";
import config from "@/config";
import { useUIStore } from "@/stores/ui";
import { useDatasetStore } from "@/stores/dataset";
import { useToastStore } from "@/stores/toast";
import workflowService from "@/services/workflow";

const toast = useToastStore();
const ui = useUIStore();
const datasetStore = useDatasetStore();

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

  stage_dataset(id) {
    return api
      .post(`/datasets/${id}/workflow/stage`)
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

  get_icon(dataset_type) {
    return dataset_type === "RAW_DATA"
      ? "mdi-dna"
      : "mdi-package-variant-closed";
  }

  list_files({ id, basepath }) {
    return api.get(`/datasets/${id}/files`, {
      params: {
        basepath,
        id: config.file_browser.cache_busting_id,
      },
    });
  }

  get_file_download_data({ dataset_id, file_id }) {
    return api.get(`/datasets/${dataset_id}/files/${file_id}/download`);
  }

  loadDataset(id) {
    ui.setIsLoadingResource(true);
    return this.getById({ id })
      .then((res) => {
        const _dataset = res.data;
        const _workflows = _dataset?.workflows || [];

        // sort workflows
        _workflows.sort(workflowService.workflow_compare_fn);
        // add collapse_model to open running workflows
        // keep workflows open that were open
        _dataset.workflows = _workflows.map((w) => {
          return {
            ...w,
            collapse_model: !workflowService.is_workflow_done(w) || false,
          };
        });
        datasetStore.setDataset(_dataset);
      })
      .catch((err) => {
        console.error(err);
        if (err?.response?.status == 404)
          toast.error("Could not find the dataset");
        else toast.error("Something went wrong. Could not fetch datatset");
      })
      .finally(() => {
        ui.setIsLoadingResource(false);
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
