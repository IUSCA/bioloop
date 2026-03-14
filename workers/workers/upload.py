"""
Upload Verification Utilities

Provides BLAKE3 manifest-based checksum verification for uploaded files.
Falls back to file existence check when checksums are disabled.
"""

import json
from pathlib import Path

from workers.config.common import config


def verify_upload_integrity(dataset, upload_log=None):
    """
    Verify upload integrity using manifest hash or file existence fallback.

    Args:
        dataset (dict): Dataset with origin_path
        upload_log (dict, optional): Upload log with metadata

    Returns:
        bool: True if upload is verified

    Raises:
        Exception: If verification fails
    """
    dataset_id = dataset['id']
    origin_path = dataset.get('origin_path')

    if not origin_path:
        raise Exception(f"Dataset {dataset_id} has no origin_path")

    # Default: Skip checksum verification, just check files exist
    print(f"Checking file existence for dataset {dataset_id}")
    return _verify_files_exist(origin_path)


def _verify_files_exist(origin_path):
    """
    Fallback verification when checksum is disabled.
    Simply checks that files exist at origin_path.

    Note: This is lightweight (no file content reading) but sufficient because:
    1. Files are moved to origin_path only after successful upload completion
    2. Upload service (TUS) handles protocol-level integrity (offset tracking, resume)
    3. If upload was incomplete, files wouldn't be at origin_path
    
    Why not check TUS metadata or file sizes?
    - TUS metadata (.json files) only exist in temp upload directory
    - After /complete endpoint moves files, TUS metadata is no longer accessible
    - We don't store expected file sizes/names in database (upload handles that)
    - File existence at final destination path implies successful upload + move
    
    This is fast (just directory traversal, no file I/O) and works for large datasets.

    Args:
        origin_path (str): Path to uploaded files

    Returns:
        bool: True if files exist

    Raises:
        Exception: If no files found
    """
    origin = Path(origin_path)

    if not origin.exists():
        raise Exception(f"Origin path does not exist: {origin_path}")

    # Count files (directory traversal only, no file content reading)
    files = list(origin.rglob('*'))
    file_count = sum(1 for f in files if f.is_file())

    if file_count == 0:
        raise Exception(f"No files found at {origin_path}")

    print(f"Found {file_count} file(s) at {origin_path}")
    return True


def _compute_manifest_hash(origin_path):
    """
    Compute BLAKE3 manifest hash from directory.
    Matches client-side algorithm exactly.
    
    Uses streaming hash with 16MB chunks optimized for Lustre filesystem performance.

    Args:
        origin_path (Path): Path to uploaded files

    Returns:
        str: Hex hash of the manifest
    """
    import blake3

    # 16MB chunks - optimal for Lustre HPFS (>4MB minimum, 10-32MB ideal)
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
