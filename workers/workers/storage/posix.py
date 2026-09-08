"""Archive backend backed by an ordinary filesystem directory.

Used where the hsi command line tools are not installed, which is every
developer machine. The interface matches workers/storage/sda.py exactly; see
workers/storage/__init__.py for how a backend is chosen.

Paths handed to these functions are absolute paths on the local filesystem,
because config['paths'][<type>]['archive'] points at a real directory rather
than at an SDA namespace.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from workers import utils


def put(local_file: str, archive_file: str, verify_checksum: bool = True):
    """Copy a local file into the archive, overwriting whatever is there.

    Parent directories are created. With verify_checksum the copy is read back
    and compared, which is the closest local equivalent of the checksum hsi
    computes during a transfer.
    """
    destination = Path(archive_file)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(local_file, destination)

    if verify_checksum:
        _verify(Path(local_file), destination)

    return '', ''


def get(archive_file: str, local_file: str, verify_checksum: bool = True):
    """Copy a file out of the archive, overwriting the local file."""
    destination = Path(local_file)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(archive_file, destination)

    if verify_checksum:
        _verify(Path(archive_file), destination)

    return '', ''


def get_size(archive_path: str) -> int:
    return Path(archive_path).stat().st_size


def get_hash(archive_path: str, missing_ok: bool = False) -> str | None:
    """md5 of an archived file, or None when it is absent and missing_ok.

    This digest is comparable with utils.checksum and with nothing else. It is
    not the digest the sda backend returns for the same logical file.
    """
    path = Path(archive_path)
    if not path.is_file():
        if missing_ok:
            return None
        raise FileNotFoundError(archive_path)
    return utils.checksum(path)


def delete(path: str) -> None:
    Path(path).unlink(missing_ok=True)


def exists(path: str) -> bool:
    return Path(path).exists()


def ensure_directory(dir_path: str) -> None:
    Path(dir_path).mkdir(parents=True, exist_ok=True)


def _verify(source: Path, destination: Path) -> None:
    source_digest = utils.checksum(source)
    destination_digest = utils.checksum(destination)
    if source_digest != destination_digest:
        raise OSError(
            f'checksum mismatch after copying {source} to {destination}: '
            f'{source_digest} != {destination_digest}'
        )
