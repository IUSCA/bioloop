/**
 * Upload Checksum Service
 *
 * Provides BLAKE3 manifest-based checksum computation for upload verification.
 * Uses hash-wasm for browser-compatible BLAKE3 hashing.
 */

import config from '@/config';

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
    const hashWasm = await import('hash-wasm');
    // Use createBLAKE3 for streaming (not blake3 which loads entire file)
    blake3Fn = hashWasm.createBLAKE3;
    console.log('[checksum.js] ✓ BLAKE3 (streaming) loaded');
    return blake3Fn;
  } catch (error) {
    console.error('Failed to load hash-wasm module:', error);
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
    const parts = file.webkitRelativePath.replace(/\\/g, '/').split('/');
    return parts.slice(1).join('/');
  }
  // Single-file upload — just the filename.
  return file.name.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Compute BLAKE3 hash for a single file using streaming + chunked processing
 * to avoid blocking the browser and hogging memory.
 *
 * OPTIMIZATION STRATEGY:
 * 1. Process file in 64 MB chunks (not all at once)
 * 2. Use File.slice() to read chunks incrementally (low memory)
 * 3. Yield to event loop between chunks (browser stays responsive)
 * 4. Update progress per chunk (smooth UI updates)
 *
 * Why 64 MB chunks?
 * - Too small (e.g., 1 MB): Too many yield points, slower overall
 * - Too large (e.g., 512 MB): High memory usage, browser can freeze
 * - 64 MB: Good balance for files ranging from 100 MB to 100 GB
 *
 * @private
 * @param {File} file - File to hash
 * @param {Function} createBlake3 - BLAKE3 create function from hash-wasm
 * @param {Function} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<string>} Hex hash string
 */
async function _hashFile(file, createBlake3, onProgress = null) {
  const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB chunks
  const hasher = await createBlake3();
  
  console.log(`[checksum.js] _hashFile: Hashing ${file.name} in chunks (${CHUNK_SIZE / 1024 / 1024} MB each)`);
  
  let offset = 0;
  const fileSize = file.size;
  
  while (offset < fileSize) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const arrayBuffer = await chunk.arrayBuffer();
    hasher.update(new Uint8Array(arrayBuffer));
    
    offset += CHUNK_SIZE;
    
    // Report progress if callback provided
    if (onProgress) {
      const progress = Math.min(100, Math.round((offset / fileSize) * 100));
      onProgress(progress);
    }
    
    // Yield to event loop every chunk to avoid freezing the browser
    // This allows UI updates, user interactions, etc.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  const hash = hasher.digest('hex');
  console.log(`[checksum.js] _hashFile: Complete for ${file.name} - hash: ${hash}`);
  return hash;
}

/**
 * Compute BLAKE3 manifest hash for uploaded files.
 *
 * Creates a deterministic manifest string with file paths, sizes, and hashes,
 * then hashes the manifest itself for verification.
 *
 * @param {File[]} files - Array of File objects to hash
 * @param {Function} [progressCallback] - Optional callback for progress updates (0-100)
 * @returns {Promise<Object|null>} Manifest hash object or null if feature disabled/no files
 */
export async function computeManifestHash(files, progressCallback = null) {
  console.log('[checksum.js] computeManifestHash called');
  console.log('[checksum.js]   files:', files?.length || 0);
  console.log('[checksum.js]   progressCallback:', typeof progressCallback);

  // Guard: callers should check _isChecksumVerificationEnabled() first,
  // but this provides a safe fallback if called directly.
  if (!config.enabledFeatures.upload_verify_checksums) {
    console.log('[checksum.js] Feature disabled via config');
    return null;
  }

  if (!files || files.length === 0) {
    console.log('[checksum.js] No files to hash');
    return null;
  }

  try {
    console.log('[checksum.js] Loading BLAKE3 (streaming)...');
    const createBlake3 = await _loadBlake3();

    const manifest = [];
    const totalFiles = files.length;
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let processedBytes = 0;

    // Hash each file with streaming
    console.log(`[checksum.js] Starting to hash ${totalFiles} file(s)... (total: ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB)`);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(
        `[checksum.js] Hashing file ${i + 1}/${totalFiles}: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
      );

      // Hash file with per-file progress
      const fileHash = await _hashFile(file, createBlake3, (fileProgress) => {
        // Calculate overall progress based on bytes processed across all files
        const currentFileBytes = (fileProgress / 100) * file.size;
        const overallProgress = Math.round(((processedBytes + currentFileBytes) / totalBytes) * 100);
        
        if (progressCallback) {
          progressCallback(overallProgress);
        }
      });
      
      processedBytes += file.size;
      console.log(`[checksum.js]   ✓ Hash: ${fileHash}`);

      manifest.push({
        path: _manifestPath(file),
        size: file.size,
        hash: fileHash,
        _webkitRelativePath: file.webkitRelativePath || '',
        _fileName: file.name,
      });

      // Report overall progress after each file completes
      if (progressCallback) {
        const progress = Math.round((processedBytes / totalBytes) * 100);
        console.log(`[checksum.js]   Overall progress: ${progress}%`);
        progressCallback(progress);
      }
    }

    // Sort by path for deterministic order.
    // Use code-point comparison (< >) to match Python's sorted() behaviour
    // exactly — localeCompare is locale-sensitive and can differ from Python's
    // byte-order sort for non-ASCII filenames or locale-special characters.
    console.log('[checksum.js] Sorting manifest...');
    manifest.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    // DEBUG: log every manifest entry so the path/size/hash can be compared
    // directly against the server's stdout output.
    console.log('[checksum.js] Manifest entries (sorted):');
    manifest.forEach((f, i) => {
      console.log(`[checksum.js]   [${i}] path="${f.path}"  size=${f.size}  hash=${f.hash}`);
      console.log(`[checksum.js]        webkitRelativePath="${f._webkitRelativePath}"  file.name="${f._fileName}"`);
    });

    // Create canonical manifest string
    console.log('[checksum.js] Creating manifest string...');
    const manifestStr = [
      'blake3-manifest-v1',
      ...manifest.map((f) => `${f.path}\t${f.size}\t${f.hash}`),
    ].join('\n');
    console.log('[checksum.js] Manifest string length:', manifestStr.length);
    console.log('[checksum.js] Full manifest string:\n' + manifestStr);

    // Hash the manifest itself (small, so we can do it directly)
    console.log('[checksum.js] Hashing manifest itself...');
    const manifestBytes = new TextEncoder().encode(manifestStr);
    const manifestHasher = await createBlake3();
    manifestHasher.update(manifestBytes);
    const manifestHash = manifestHasher.digest('hex');
    console.log('[checksum.js] ✓ Manifest hash:', manifestHash);

    // Always manifest-v1: the format is identical whether there is one file or
    // many (blake3-manifest-v1 header + one tab-separated entry per file).
    // Using a consistent mode string means the server-side verifier never needs
    // to branch on file count.
    const result = {
      algorithm: 'blake3',
      mode: 'manifest-v1',
      manifest_hash: manifestHash,
      file_count: files.length,
      total_size: manifest.reduce((sum, f) => sum + f.size, 0),
      computed_at: new Date().toISOString(),
    };

    console.log('[checksum.js] ✓ Returning manifest hash object:', result);
    return result;
  } catch (error) {
    console.error('[checksum.js] ✗ Failed to compute manifest hash:', error);
    console.error('[checksum.js] Error stack:', error.stack);
    // Don't fail upload if checksum computation fails
    return null;
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
