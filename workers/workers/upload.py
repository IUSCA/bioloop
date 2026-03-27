"""
Upload Verification Utilities

Provides BLAKE3 manifest-hash verification for uploaded files.
Falls back to manifest-size verification (or existence checks for legacy uploads)
when the client deliberately did not supply a manifest-hash.

Requires the 'blake3' package (pip install blake3).  If a client-computed
manifest-hash is present in the upload log and blake3 is not installed, the
worker raises an explicit error — it will NOT silently fall back to the
existence check.
"""

from pathlib import Path


def verify_upload_integrity(dataset, upload_log=None):
    """
    Verify upload integrity.

    Strategy (in priority order):
      1. If the upload log carries a client-computed BLAKE3 manifest-hash in
         metadata.checksum.manifest_hash, recompute the hash server-side from
         the files at origin_path and compare. A mismatch raises immediately.
      2. Otherwise, if metadata.size_manifest is present, verify every expected
         path exists and its byte-size matches the client-reported size.
      3. Otherwise fall back to a lightweight existence check — confirm that at
         least one file is present at origin_path.

    The two-path design means:
      - New uploads (UI computes and stores a manifest-hash payload) get end-to-end integrity
        verification: client hash === server hash, or the upload is rejected.
      - Uploads where manifest-hash computation failed/was skipped can still receive
        path+size verification when the UI supplies metadata.size_manifest.
      - Legacy uploads without manifest-hash and without size manifest are still
        accepted once their files land on disk, preserving backward
        compatibility.

    Args:
        dataset (dict): Dataset dict; must contain 'id' and 'origin_path'.
        upload_log (dict, optional): Upload log dict; metadata.checksum is read
            when present.

    Returns:
        bool: True when verification passes.

    Raises:
        Exception: If files are missing or the manifest-hash does not match.
    """
    dataset_id = dataset['id']
    origin_path = dataset.get('origin_path')

    if not origin_path:
        raise Exception(f"Dataset {dataset_id} has no origin_path")

    origin = Path(origin_path)

    # Extract client-supplied manifest-hash metadata (may be absent, a full hash
    # object, or a skip-marker set when client-side computation failed).
    client_manifest_hash = None
    client_skipped_reason = None
    client_skipped_error = None
    size_manifest = None
    if upload_log:
        metadata = upload_log.get('metadata') or {}
        checksum_meta = metadata.get('checksum') or {}
        size_manifest = metadata.get('size_manifest') or None
        client_manifest_hash = checksum_meta.get('manifest_hash')
        if checksum_meta.get('skipped'):
            client_skipped_reason = checksum_meta.get('skipped_reason')
            client_skipped_error = checksum_meta.get('error')

    if client_manifest_hash:
        # A client-computed BLAKE3 manifest-hash is present — full verification
        # is required.  Confirm blake3 is installed before doing any file I/O so
        # the error message is actionable rather than a bare ImportError traceback.
        try:
            import blake3  # noqa: F401
        except ImportError:
            raise Exception(
                "blake3 package is not installed on this worker node, but the "
                "upload includes a client-computed BLAKE3 manifest-hash that "
                "must be verified.  Install blake3 (pip install blake3) on the "
                "worker, or disable upload_verify_checksums in the UI config."
            )

        print(f"Client-supplied manifest-hash found — running BLAKE3 verification")
        print(f"  Expected: {client_manifest_hash}")
        server_hash = _compute_manifest_hash(origin)
        print(f"  Computed: {server_hash}")
        if server_hash != client_manifest_hash:
            raise Exception(
                f"Manifest hash mismatch for dataset {dataset_id}.\n"
                f"  Expected (client): {client_manifest_hash}\n"
                f"  Computed (server): {server_hash}\n"
                f"Files may have been corrupted or tampered with during transfer."
            )
        print(f"✓ Manifest hash verified for dataset {dataset_id}")

    elif client_skipped_reason:
        # The client attempted manifest-hash computation but it failed (e.g. the
        # hash-wasm WASM module could not be loaded, or an OOM occurred during
        # hashing).  This is distinct from the feature being intentionally
        # disabled — the upload was made with end-to-end integrity in mind, but
        # the client could not fulfil its part.  We cannot run a meaningful
        # manifest comparison without the client-side hash, so we fall back to
        # the file-existence check and log a clear explanation.
        print()
        print("⚠ WARNING: Manifest verification will be skipped.")
        print(f"  Reason  : Client-side manifest-hash computation failed during upload.")
        print(f"  Code    : {client_skipped_reason}")
        if client_skipped_error:
            print(f"  Detail  : {client_skipped_error}")
        print("  Falling back to file-existence check only.")
        print("  End-to-end integrity cannot be guaranteed for this upload.")
        print()
        if size_manifest:
            print("  Using size manifest fallback verification.")
            _verify_files_match_size_manifest(origin_path, size_manifest)
        else:
            _verify_files_exist(origin_path)

    else:
        # No manifest-hash metadata at all — the UI had upload_verify_checksums
        # disabled, or this is a legacy upload predating the manifest-hash feature.
        # Fall back to size manifest verification when available, otherwise use
        # the lightweight existence check.
        if size_manifest:
            print("No client manifest-hash found — using size manifest fallback verification")
            _verify_files_match_size_manifest(origin_path, size_manifest)
        else:
            print(f"No client manifest-hash found — falling back to file existence check")
            _verify_files_exist(origin_path)

    return True


def _verify_files_exist(origin_path):
    """
    Lightweight fallback: confirm at least one file exists at origin_path.

    Sufficient as a fallback because files are only moved to origin_path after
    the /complete endpoint runs successfully — their presence implies the upload
    and file-move steps both completed. TUS handles protocol-level integrity
    (offset tracking, resume) during transfer, so a missing-file failure here
    indicates a filesystem or post-move problem rather than a transfer issue.

    No file content is read — this is purely a directory traversal.

    Args:
        origin_path (str | Path): Path to uploaded files.

    Raises:
        Exception: If origin_path does not exist or contains no files.
    """
    origin = Path(origin_path)

    if not origin.exists():
        raise Exception(f"Origin path does not exist: {origin_path}")

    file_count = sum(1 for f in origin.rglob('*') if f.is_file())

    if file_count == 0:
        raise Exception(f"No files found at {origin_path}")

    print(f"✓ Found {file_count} file(s) at {origin_path}")


def _verify_files_match_size_manifest(origin_path, size_manifest):
    """
    Fallback integrity check that validates file existence + byte size.

    The UI sends metadata.size_manifest in the /complete payload even when
    manifest-hash verification is skipped. This allows workers to verify each
    expected path exists and matches the client-observed size without reading
    file content.

    Args:
        origin_path (str | Path): Root path where uploaded files were moved.
        size_manifest (dict): Client-provided manifest with:
            - mode: "path-size-v1"
            - files: [{path: "<relative/path>", size: <bytes>}]
            - file_count: int
            - total_size: int

    Raises:
        Exception: If the manifest is invalid, files are missing, or any size
            mismatch is detected.
    """
    origin = Path(origin_path)
    if not origin.exists():
        raise Exception(f"Origin path does not exist: {origin_path}")

    mode = size_manifest.get('mode')
    files = size_manifest.get('files') or []
    expected_count = size_manifest.get('file_count')
    expected_total_size = size_manifest.get('total_size')

    if mode != 'path-size-v1':
        raise Exception(f"Unsupported size manifest mode: {mode}")
    if not files:
        raise Exception("size_manifest is present but contains no files")

    origin_resolved = origin.resolve()
    actual_total_size = 0

    for entry in files:
        rel_path = entry.get('path')
        expected_size = entry.get('size')

        if not rel_path or expected_size is None:
            raise Exception(f"Invalid size_manifest entry: {entry}")

        candidate = (origin / rel_path).resolve()
        if origin_resolved not in candidate.parents and candidate != origin_resolved:
            raise Exception(f"size_manifest path escapes origin_path: {rel_path}")

        if not candidate.exists() or not candidate.is_file():
            raise Exception(f"Missing expected file from size_manifest: {rel_path}")

        actual_size = candidate.stat().st_size
        if actual_size != int(expected_size):
            raise Exception(
                f"Size mismatch for '{rel_path}': expected {expected_size}, got {actual_size}"
            )

        actual_total_size += actual_size

    actual_count = sum(1 for f in origin.rglob('*') if f.is_file())
    if expected_count is not None and int(expected_count) != len(files):
        raise Exception(
            f"size_manifest file_count mismatch: file_count={expected_count}, entries={len(files)}"
        )
    if expected_count is not None and actual_count != int(expected_count):
        raise Exception(
            f"File count mismatch at origin_path: expected {expected_count}, found {actual_count}"
        )
    if expected_total_size is not None and actual_total_size != int(expected_total_size):
        raise Exception(
            f"Total size mismatch: expected {expected_total_size}, got {actual_total_size}"
        )

    print(
        f"✓ Size-manifest fallback verified {len(files)} file(s), {actual_total_size} bytes at {origin_path}"
    )


def _compute_manifest_hash(origin_path):
    """
    Compute BLAKE3 manifest-hash from the files at origin_path.

    The algorithm mirrors the client-side implementation in
    ui/src/services/upload/checksum.js exactly so that the two hashes can be
    compared byte-for-byte:

      1. Collect all files under origin_path, sorted by relative path.
      2. Hash each file in streaming 16 MB chunks (optimal for Lustre HPFS;
         >4 MB minimum, 10–32 MB ideal range).
      3. Build a manifest string:
             blake3-manifest-v1
             <rel_path>\\t<size_bytes>\\t<file_hash>
             ...
         (one line per file, sorted, tab-separated)
      4. Hash the manifest string itself and return its hex digest.

    Args:
        origin_path (Path): Root directory of the uploaded files.

    Returns:
        str: Hex digest of the manifest-hash.

    Raises:
        Exception: If no files are found or hashing fails.
    """
    import blake3  # already confirmed importable in verify_upload_integrity

    # 16 MB chunks — optimal for Lustre HPFS (>4 MB minimum, 10–32 MB ideal)
    CHUNK_SIZE = 16 * 1024 * 1024

    files = sorted([f for f in origin_path.rglob('*') if f.is_file()])

    if not files:
        raise Exception(f"No files found at {origin_path}")

    print(f"    Found {len(files)} file(s) to hash")
    manifest_lines = ['blake3-manifest-v1']

    for idx, file_path in enumerate(files, 1):
        print(f"    Hashing file {idx}/{len(files)}: {file_path.name} ({file_path.stat().st_size} bytes)")
        
        # Stream hash file content in chunks to avoid loading entire file into memory
        hasher = blake3.blake3()
        with open(file_path, 'rb') as f:
            while chunk := f.read(CHUNK_SIZE):
                hasher.update(chunk)
        file_hash = hasher.hexdigest()
        print(f"      File hash: {file_hash}")

        # Relative path from origin_path
        rel_path = file_path.relative_to(origin_path)
        rel_path_str = str(rel_path).replace('\\', '/')

        manifest_lines.append(
            f"{rel_path_str}\t{file_path.stat().st_size}\t{file_hash}"
        )

    # Hash the manifest
    print(f"    Hashing manifest itself (manifest has {len(manifest_lines)} lines)...")
    manifest_str = '\n'.join(manifest_lines)
    manifest_hash = blake3.blake3(manifest_str.encode('utf-8')).hexdigest()
    print(f"    Manifest hash: {manifest_hash}")
    return manifest_hash
