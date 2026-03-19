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


def test_verify_upload_integrity_manifest_mismatch_raises(tmp_path: Path):
    try:
        import blake3  # noqa: F401
    except ModuleNotFoundError as exc:
        pytest.fail(f"blake3 must be installed for upload integrity tests: {exc}")

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
