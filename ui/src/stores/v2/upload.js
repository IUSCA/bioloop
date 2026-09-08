import DatasetService from "@/services/v2/datasets";
import { transferFiles } from "@/services/v2/upload";
import toast from "@/services/toast";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * In-flight uploads, owned by the store rather than by a component.
 *
 * This is the whole reason uploads no longer trap the user on one page. The legacy stepper
 * keeps every tus.Upload object in component state, so leaving the route would destroy them,
 * and it blocks navigation with onBeforeRouteLeave to prevent that. State outside a
 * component survives a route change, so the dialog can hand the files over and close.
 *
 * A reload still ends a transfer, and always will: a File handle cannot outlive the
 * document, and resume fingerprints are not persisted because large sessions exceeded the
 * browser's storage quota. beforeunload warns instead.
 *
 * @see docs/design/groups/dataset-creation-plan.md — C3
 */
export const useUploadStore = defineStore("v2-upload", () => {
  // Keyed by dataset id. Each entry: { datasetId, datasetName, ownerGroupName, status,
  // percent, uploadedBytes, totalBytes, filesDone, filesTotal, failures, startedAt }
  const transfers = ref({});

  const list = computed(() => Object.values(transfers.value));
  const active = computed(() =>
    list.value.filter((t) => t.status === "uploading"),
  );
  const hasActive = computed(() => active.value.length > 0);

  /** Total progress across every running transfer, for the one bar in the app chrome. */
  const overallPercent = computed(() => {
    const running = active.value;
    if (running.length === 0) return 0;
    const total = running.reduce((sum, t) => sum + t.totalBytes, 0);
    const done = running.reduce((sum, t) => sum + t.uploadedBytes, 0);
    return total ? Math.round((done / total) * 100) : 0;
  });

  function patch(datasetId, changes) {
    const current = transfers.value[datasetId];
    if (current) transfers.value[datasetId] = { ...current, ...changes };
  }

  /**
   * Take over a registered dataset's files and send them.
   *
   * Returns immediately; the caller is expected to close its dialog. The dataset already
   * exists at this point, so a failure here leaves a dataset whose upload log records what
   * happened rather than losing the work silently.
   */
  function start({
    dataset,
    files,
    selectionMode = "files",
    directoryName = "",
  }) {
    const datasetId = dataset.id;

    transfers.value[datasetId] = {
      datasetId,
      datasetResourceId: dataset.resource_id,
      datasetName: dataset.name,
      ownerGroupName: dataset.owner_group?.name || null,
      status: "uploading",
      percent: 0,
      uploadedBytes: 0,
      totalBytes: files.reduce((sum, f) => sum + f.size, 0),
      filesDone: 0,
      filesTotal: files.length,
      failures: [],
      startedAt: Date.now(),
    };

    run({ datasetId, files, selectionMode, directoryName });

    return transfers.value[datasetId];
  }

  async function run({ datasetId, files, selectionMode, directoryName }) {
    let result;
    try {
      result = await transferFiles({
        files,
        datasetId,
        selectionMode,
        directoryName,
        onProgress: (p) => patch(datasetId, p),
      });
    } catch (err) {
      patch(datasetId, {
        status: "failed",
        failures: [{ name: "", message: err?.message || "Upload failed" }],
      });
      toast.error(
        `Upload of ${transfers.value[datasetId]?.datasetName} failed`,
      );
      return;
    }

    if (!result.ok) {
      patch(datasetId, { status: "failed", failures: result.failures });
      toast.error(
        `${result.failures.length} file(s) failed to upload for ${transfers.value[datasetId]?.datasetName}`,
      );
      return;
    }

    // Tell the API the transfer is done. The server moves the files and starts verification
    // from its own hook; this call is what flips the upload log out of UPLOADING.
    try {
      patch(datasetId, { status: "finalizing", percent: 100 });
      await DatasetService.completeUpload(datasetId, {
        process_id: result.processId,
      });
      patch(datasetId, { status: "complete" });
      toast.success(
        `${transfers.value[datasetId]?.datasetName} uploaded and queued for processing`,
      );
    } catch (err) {
      patch(datasetId, {
        status: "failed",
        failures: [
          {
            name: "",
            message:
              "Files were sent but the upload could not be finalized. It will be retried automatically.",
          },
        ],
      });
    }
  }

  /** Forget a finished transfer. Running ones are left alone. */
  function dismiss(datasetId) {
    const t = transfers.value[datasetId];
    if (!t || t.status === "uploading") return;
    const { [datasetId]: _removed, ...rest } = transfers.value;
    transfers.value = rest;
  }

  function dismissFinished() {
    transfers.value = Object.fromEntries(
      Object.entries(transfers.value).filter(
        ([, t]) => t.status === "uploading" || t.status === "finalizing",
      ),
    );
  }

  /** Refresh one dataset's upload log, for the panel on its page. */
  async function fetchUploadLog(datasetResourceId) {
    const { data } = await DatasetService.uploadLog(datasetResourceId);
    return data;
  }

  return {
    transfers,
    list,
    active,
    hasActive,
    overallPercent,
    start,
    dismiss,
    dismissFinished,
    fetchUploadLog,
  };
});

export default useUploadStore;
