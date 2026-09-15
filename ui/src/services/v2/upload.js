import config from "@/config";
import { useAuthStore } from "@/stores/auth";
import { _getUploadServiceURL } from "@/services/upload";
import * as tus from "tus-js-client";

// A directory of ten thousand files launched at once exhausts the browser's socket pool and
// every request fails at the same moment. A bounded pool keeps the failure modes ordinary.
const MAX_CONCURRENT_TUS_UPLOADS = 3;

// Fibonacci back-off, roughly sixteen minutes in total. It starts above zero so a retried
// PATCH does not immediately race a lock still held by the request it is replacing.
// tus-js-client retries on its own; onError fires only once these are exhausted.
const RETRY_DELAYS = [
  1000, 2000, 3000, 5000, 8000, 13000, 21000, 34000, 55000, 89000, 144000,
  233000, 377000,
];

/**
 * The bearer token as TUS needs it.
 *
 * Read from the in-memory auth store rather than browser storage, which can be
 * quota-constrained and hold a stale value. Storage may also hold a JSON-quoted string, so
 * a stray "Bearer " prefix and surrounding quotes are stripped.
 */
function currentAuthToken() {
  let token = useAuthStore()?.token;
  if (typeof token !== "string") return null;
  token = token.trim();
  if (token.startsWith("Bearer ")) token = token.slice("Bearer ".length).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(token);
      token = (typeof parsed === "string" ? parsed : token.slice(1, -1)).trim();
    } catch {
      token = token.slice(1, -1).trim();
    }
  }
  return token || null;
}

/**
 * The path recorded for a file, relative to the directory the user picked.
 *
 * A directory selection carries webkitRelativePath, whose first segment is the directory's
 * own name; the server already knows that from directory_name, so it is dropped.
 */
function relativePathOf(file, selectionMode) {
  if (selectionMode === "directory" && file.webkitRelativePath) {
    return file.webkitRelativePath.split("/").slice(1).join("/");
  }
  return file.webkitRelativePath || file.name;
}

/**
 * Send one file, resolving when the server has it.
 *
 * The auth token is read inside onBeforeRequest rather than captured once, so an upload
 * running for hours keeps using an unexpired JWT.
 */
function uploadOneFile({
  file,
  datasetId,
  selectionMode,
  directoryName,
  onBytes,
}) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: _getUploadServiceURL(window.location.origin),
      // Resume fingerprints are not persisted. Large sessions exceeded the browser's
      // storage quota and aborted uploads with QuotaExceededError before PATCH began, so
      // an upload does not survive a reload and the dialog says so.
      storeFingerprintForResuming: false,
      // Bounded PATCH chunks, so proxies with a request-size limit do not answer 413.
      chunkSize: config.upload.tus_chunk_size_bytes,
      retryDelays: RETRY_DELAYS,
      metadata: {
        dataset_id: String(datasetId),
        filename: file.name,
        filetype: file.type || "application/octet-stream",
        selection_mode: selectionMode,
        relative_path: relativePathOf(file, selectionMode),
        directory_name: directoryName || "",
      },
      onBeforeRequest: (req) => {
        const token = currentAuthToken();
        if (token && req?.setHeader)
          req.setHeader("Authorization", `Bearer ${token}`);
      },
      onProgress: (bytesUploaded) => onBytes?.(bytesUploaded),
      onError: (error) => reject(error),
      onSuccess: () => resolve(upload.url?.split("/").pop()),
    });

    upload.start();
  });
}

/**
 * Transfer a list of files to one dataset.
 *
 * A plain function over a file list, deliberately holding no component state: the store that
 * calls it outlives any component, which is what lets a transfer continue while the user
 * navigates. Lifted from the legacy stepper, which is left in place.
 *
 * Progress is reported in bytes across the whole set, so a single big file and ten thousand
 * small ones both give a meaningful bar.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — C2
 * @returns {Promise<{ok: boolean, processId: string|null, failures: Array}>}
 */
export async function transferFiles({
  files,
  datasetId,
  selectionMode = "files",
  directoryName = "",
  onProgress,
}) {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const bytesPerFile = new Array(files.length).fill(0);
  let filesDone = 0;
  let processId = null;

  const report = () => {
    const uploaded = bytesPerFile.reduce((a, b) => a + b, 0);
    onProgress?.({
      uploadedBytes: uploaded,
      totalBytes,
      percent: totalBytes ? Math.round((uploaded / totalBytes) * 100) : 0,
      filesDone,
      filesTotal: files.length,
    });
  };

  const failures = [];
  let next = 0;

  const worker = async () => {
    while (next < files.length) {
      const index = next++;
      const file = files[index];
      try {
        // eslint-disable-next-line no-await-in-loop
        const id = await uploadOneFile({
          file,
          datasetId,
          selectionMode,
          directoryName,
          onBytes: (bytes) => {
            bytesPerFile[index] = bytes;
            report();
          },
        });
        // Any one process id is enough: it is an audit reference, and the server moves the
        // files itself in its onUploadFinish hook.
        processId = id || processId;
        bytesPerFile[index] = file.size;
        filesDone += 1;
        report();
      } catch (error) {
        failures.push({
          name: file.name,
          relativePath: relativePathOf(file, selectionMode),
          message: error?.message || "Upload failed",
        });
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_TUS_UPLOADS, files.length) },
      worker,
    ),
  );

  return { ok: failures.length === 0, processId, failures };
}

export default { transferFiles };
