from pathlib import Path

import pytest

from workers.upload import verify_upload_integrity


def test_verify_upload_integrity_fallback_accepts_existing_files(tmp_path: Path):
    data_file = tmp_path / "sample.txt"
    data_file.write_text("hello world", encoding="utf-8")

    dataset = {
        "id": 101,
        "origin_path": str(tmp_path),
    }

    assert verify_upload_integrity(dataset, upload_log=None) is True


def test_verify_upload_integrity_fallback_rejects_missing_files(tmp_path: Path):
    dataset = {
        "id": 102,
        "origin_path": str(tmp_path),
    }

    with pytest.raises(Exception, match="No files found"):
        verify_upload_integrity(dataset, upload_log=None)


_blake3_available = True
try:
    import blake3  # noqa: F401
except ModuleNotFoundError:
    _blake3_available = False


@pytest.mark.skipif(not _blake3_available, reason="blake3 not installed in this environment")
def test_verify_upload_integrity_manifest_mismatch_raises(tmp_path: Path):
    data_file = tmp_path / "sample.txt"
    data_file.write_text("hello world", encoding="utf-8")

    dataset = {
        "id": 103,
        "origin_path": str(tmp_path),
    }
    upload_log = {
        "metadata": {
            "checksum": {
                "manifest_hash": "0000000000000000000000000000000000000000000000000000000000000000",
            }
        }
    }

    with pytest.raises(Exception, match="Manifest hash mismatch"):
        verify_upload_integrity(dataset, upload_log=upload_log)


def test_verify_upload_integrity_size_manifest_fallback_passes(tmp_path: Path):
    a_file = tmp_path / "a.txt"
    a_file.write_text("abc", encoding="utf-8")
    b_dir = tmp_path / "dir"
    b_dir.mkdir(parents=True, exist_ok=True)
    b_file = b_dir / "b.txt"
    b_file.write_text("hello", encoding="utf-8")

    dataset = {
        "id": 104,
        "origin_path": str(tmp_path),
    }
    upload_log = {
        "metadata": {
            "checksum": {
                "skipped": True,
                "skipped_reason": "client_computation_failed",
            },
            "size_manifest": {
                "mode": "path-size-v1",
                "file_count": 2,
                "total_size": 8,
                "files": [
                    {"path": "a.txt", "size": 3},
                    {"path": "dir/b.txt", "size": 5},
                ],
            },
        }
    }

    assert verify_upload_integrity(dataset, upload_log=upload_log) is True


def test_verify_upload_integrity_size_manifest_fallback_rejects_mismatch(tmp_path: Path):
    data_file = tmp_path / "sample.txt"
    data_file.write_text("hello", encoding="utf-8")

    dataset = {
        "id": 105,
        "origin_path": str(tmp_path),
    }
    upload_log = {
        "metadata": {
            "size_manifest": {
                "mode": "path-size-v1",
                "file_count": 1,
                "total_size": 999,
                "files": [
                    {"path": "sample.txt", "size": 999},
                ],
            },
        }
    }

    with pytest.raises(Exception, match="Size mismatch"):
        verify_upload_integrity(dataset, upload_log=upload_log)
