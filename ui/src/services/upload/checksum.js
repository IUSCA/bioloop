/**
 * Upload Checksum Service
 *
 * Provides BLAKE3 manifest-based checksum computation for upload verification.
 * Uses hash-wasm for browser-compatible BLAKE3 hashing.
 */

import config from "@/config";

let blake3Fn = null;

/**
 * Load BLAKE3 hash function lazily
 * @private
 */
async function _loadBlake3() {
  if (blake3Fn) {
    return blake3Fn;
  }

  try {
    // Dynamic import to avoid loading WASM until needed
    const hashWasm = await import("hash-wasm");
    // Use createBLAKE3 for streaming (not blake3 which loads entire file)
    blake3Fn = hashWasm.createBLAKE3;
    console.log("[checksum.js] ✓ BLAKE3 (streaming) loaded");
    return blake3Fn;
  } catch (error) {
    console.error("Failed to load hash-wasm module:", error);
    throw error;
  }
}

/**
 * Derive the relative path for a file as it will appear in the manifest.
 *
 * For directory uploads the browser sets webkitRelativePath to
 * "<rootDirName>/…/filename".  The server stores files under origin_path
 * which IS the root directory, so relative_to(origin_path) strips the root
 * directory name.  We must strip it here too so both sides build identical
 * manifest lines.
 *
 * For single-file uploads webkitRelativePath is empty; fall back to file.name.
 *
 * @private
 * @param {File} file
 * @returns {string} Forward-slash path with no leading root directory
 */
function _manifestPath(file) {
  if (file.webkitRelativePath) {
    // "rootDir/sub/file.txt" → "sub/file.txt"
    const parts = file.webkitRelativePath.replace(/\\/g, "/").split("/");
    return parts.slice(1).join("/");
  }
  // Single-file upload — just the filename.
  return file.name.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Compute BLAKE3 hash for a single file using streaming + chunked processing
 * to avoid blocking the browser and hogging memory.
 *
 * OPTIMIZATION STRATEGY:
 * 1. Reuse a single hasher instance across all files (hasher.init() resets
 *    its internal WASM state without re-allocating WASM memory).  Creating a
 *    new hasher per file accumulates WASM state objects faster than GC runs,
 *    exhausting virtual address space after a few hundred files.
 * 2. Process each file in 64 MB chunks via File.slice() (never the whole file
 *    in memory at once).
 * 3. Yield to the event loop between chunks so the browser stays responsive.
 *
 * Why 64 MB chunks?
 * - Too small (e.g., 1 MB): Too many yield points, slower overall
 * - Too large (e.g., 512 MB): High memory usage, browser can freeze
 * - 64 MB: Good balance for files ranging from small to 100+ GB
 *
 * @private
 * @param {File} file - File to hash
 * @param {Object} hasher - Reusable hash-wasm BLAKE3 hasher (shared across calls)
 * @param {Function} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<string>} Hex hash string
 */
async function _hashFile(file, hasher, onProgress = null) {
  const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB chunks

  // Reset the shared hasher for this file — avoids allocating a new WASM
  // state object, which is the root cause of the OOM on large file counts.
  hasher.init();

  let offset = 0;
  const fileSize = file.size;

  if (fileSize === 0) {
    // Zero-byte file: nothing to read; digest an empty stream.
    return hasher.digest("hex");
  }

  while (offset < fileSize) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const arrayBuffer = await chunk.arrayBuffer();
    hasher.update(new Uint8Array(arrayBuffer));

    offset += CHUNK_SIZE;

    if (onProgress) {
      const progress = Math.min(100, Math.round((offset / fileSize) * 100));
      onProgress(progress);
    }

    // Yield to event loop every chunk to avoid freezing the browser.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return hasher.digest("hex");
}

/**
 * Compute BLAKE3 manifest hash for uploaded files.
 *
 * Creates a deterministic manifest string with file paths, sizes, and hashes,
 * then hashes the manifest itself for verification.
 *
 * Return value semantics (important — the worker reads these):
 *   null                            → feature disabled or no files; worker treats
 *                                     as legacy/feature-off, falls back to existence check.
 *   { algorithm, mode, manifest_hash, … } → success; worker runs full BLAKE3 verification.
 *   { skipped: true, skipped_reason, error } → computation was attempted but failed
 *                                     (e.g. hash-wasm WASM OOM, dynamic import error);
 *                                     worker logs the reason and falls back to
 *                                     existence check, distinguishing it from the
 *                                     intentional feature-disabled case.
 *
 * @param {File[]} files - Array of File objects to hash
 * @param {Function} [progressCallback] - Optional callback for progress updates (0-100)
 * @returns {Promise<Object|null>} See return value semantics above.
 */
export async function computeManifestHash(files, progressCallback = null) {
  console.log("[checksum.js] computeManifestHash called");
  console.log("[checksum.js]   files:", files?.length || 0);
  console.log("[checksum.js]   progressCallback:", typeof progressCallback);

  // Guard: callers should check _isChecksumVerificationEnabled() first,
  // but this provides a safe fallback if called directly.
  if (!config.enabledFeatures.upload_verify_checksums) {
    console.log("[checksum.js] Feature disabled via config");
    return null;
  }

  if (!files || files.length === 0) {
    console.log("[checksum.js] No files to hash");
    return null;
  }

  try {
    console.log("[checksum.js] Loading BLAKE3 (streaming)...");
    const createBlake3 = await _loadBlake3();

    // Create a SINGLE hasher instance reused across all files.
    // Each _hashFile call resets it via hasher.init() — this avoids allocating
    // a new WASM state object per file, which causes OOM on large file counts.
    const hasher = await createBlake3();

    const manifest = [];
    const totalFiles = files.length;
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let processedBytes = 0;

    console.log(
      `[checksum.js] Hashing ${totalFiles} file(s) (${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB total)...`,
    );

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(
        `[checksum.js] [${i + 1}/${totalFiles}] ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
      );

      const fileHash = await _hashFile(file, hasher, (fileProgress) => {
        const currentFileBytes = (fileProgress / 100) * file.size;
        const overallProgress = Math.round(
          ((processedBytes + currentFileBytes) / totalBytes) * 100,
        );
        if (progressCallback) {
          progressCallback(overallProgress);
        }
      });

      processedBytes += file.size;

      manifest.push({
        path: _manifestPath(file),
        size: file.size,
        hash: fileHash,
      });

      if (progressCallback) {
        progressCallback(Math.round((processedBytes / totalBytes) * 100));
      }
    }

    // Sort by path for deterministic order.
    // Use code-point comparison (< >) to match Python's sorted() exactly —
    // localeCompare is locale-sensitive and can diverge for non-ASCII names.
    manifest.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    const manifestStr = [
      "blake3-manifest-v1",
      ...manifest.map((f) => `${f.path}\t${f.size}\t${f.hash}`),
    ].join("\n");

    // Hash the manifest string itself using the same reusable hasher.
    hasher.init();
    hasher.update(new TextEncoder().encode(manifestStr));
    const manifestHash = hasher.digest("hex");
    console.log("[checksum.js] ✓ Manifest hash:", manifestHash);

    const result = {
      algorithm: "blake3",
      mode: "manifest-v1",
      manifest_hash: manifestHash,
      file_count: files.length,
      total_size: manifest.reduce((sum, f) => sum + f.size, 0),
      computed_at: new Date().toISOString(),
    };

    console.log("[checksum.js] ✓ Done:", result);
    return result;
  } catch (error) {
    console.error("[checksum.js] ✗ Failed to compute manifest hash:", error);
    console.error("[checksum.js] Error stack:", error.stack);
    // Do not fail the upload — return a skip-marker so the API records that
    // computation was attempted but failed.  The worker reads this marker and
    // logs a clear explanation instead of silently treating the upload as a
    // legacy/feature-disabled case.
    return {
      skipped: true,
      skipped_reason: "client_computation_failed",
      error: String(error),
    };
  }
}

/**
 * Check if checksum verification is enabled
 * @returns {boolean} True if feature is enabled
 */
export function isChecksumVerificationEnabled() {
  return Boolean(config.enabledFeatures.upload_verify_checksums);
}

export default {
  computeManifestHash,
  isChecksumVerificationEnabled,
};
