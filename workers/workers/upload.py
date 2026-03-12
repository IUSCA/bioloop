"""
Upload Verification Utilities

Provides BLAKE3 manifest-based checksum verification for uploaded files.
Falls back to file existence check when the client did not supply a checksum
(e.g. legacy uploads or uploads where checksum computation failed/was disabled).

Requires the 'blake3' package (pip install blake3) when checksum verification
is used.  The package is only imported when actually needed so that the fallback
path works even if blake3 is not installed.
"""

from pathlib import Path


def verify_upload_integrity(dataset, upload_log=None):
    """
    Verify upload integrity.

    Strategy (in priority order):
      1. If the upload log carries a client-computed BLAKE3 manifest hash in
         metadata.checksum.manifest_hash, recompute the hash server-side from
         the files at origin_path and compare. A mismatch raises immediately.
      2. Otherwise fall back to a lightweight existence check — confirm that at
         least one file is present at origin_path.

    The two-path design means:
      - New uploads (UI computes and stores a checksum) get end-to-end integrity
        verification: client hash === server hash, or the upload is rejected.
      - Legacy uploads or uploads where checksum computation failed/was skipped
        are still accepted once their files land on disk, preserving backward
        compatibility without a schema migration.

    Args:
        dataset (dict): Dataset dict; must contain 'id' and 'origin_path'.
        upload_log (dict, optional): Upload log dict; metadata.checksum is read
            when present.

    Returns:
        bool: True when verification passes.

    Raises:
        Exception: If files are missing or the manifest hash does not match.
    """
    dataset_id = dataset['id']
    origin_path = dataset.get('origin_path')

    if not origin_path:
        raise Exception(f"Dataset {dataset_id} has no origin_path")

    origin = Path(origin_path)

    # Extract client-supplied checksum from upload log metadata (may be absent).
    client_checksum = None
    if upload_log:
        metadata = upload_log.get('metadata') or {}
        checksum_meta = metadata.get('checksum') or {}
        client_checksum = checksum_meta.get('manifest_hash')

    if client_checksum:
        print(f"Client-supplied manifest hash found — running BLAKE3 verification")
        print(f"  Expected: {client_checksum}")
        server_hash = _compute_manifest_hash(origin)
        print(f"  Computed: {server_hash}")
        if server_hash != client_checksum:
            raise Exception(
                f"Manifest hash mismatch for dataset {dataset_id}.\n"
                f"  Expected (client): {client_checksum}\n"
                f"  Computed (server): {server_hash}\n"
                f"Files may have been corrupted or tampered with during transfer."
            )
        print(f"✓ Manifest hash verified for dataset {dataset_id}")
    else:
        # No checksum available — fall back to existence check.
        # This covers: legacy uploads, uploads where the UI had checksum
        # computation disabled, and uploads where computation failed gracefully.
        print(f"No client checksum found — falling back to file existence check")
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


def _compute_manifest_hash(origin_path):
    """
    Compute BLAKE3 manifest hash from the files at origin_path.

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
        str: Hex digest of the manifest hash.

    Raises:
        Exception: If no files are found or hashing fails.
    """
    import blake3  # deferred import — only required on the checksum path

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
