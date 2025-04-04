import os
import tempfile

import pytest

from workers import utils  # assuming utils.checksum is available
from workers.services.storage import FSBackend

FILE_SIZE = 100 * 1024 * 1024  # 100 MB


@pytest.fixture
def temp_dirs():
    with tempfile.TemporaryDirectory() as local_dir, tempfile.TemporaryDirectory() as storage_dir:
        yield local_dir, storage_dir


@pytest.fixture
def fs_backend():
    backend = FSBackend()
    backend.delay_multiplier = 0  # skip artificial delay for tests
    return backend


def create_large_file(path: str, size: int):
    with open(path, 'wb') as f:
        f.write(os.urandom(size))


def test_put_and_get(fs_backend, temp_dirs):
    local_dir, storage_dir = temp_dirs
    src = os.path.join(local_dir, 'source_file')
    dst = os.path.join(storage_dir, 'stored_file')
    result_file = os.path.join(local_dir, 'result_file')

    create_large_file(src, FILE_SIZE)
    src_checksum = utils.checksum(src)

    fs_backend.put(src, dst)
    assert os.path.exists(dst)
    assert utils.checksum(dst) == src_checksum

    fs_backend.get(dst, result_file)
    assert os.path.exists(result_file)
    assert utils.checksum(result_file) == src_checksum


def test_get_size(fs_backend, temp_dirs):
    local_dir, _ = temp_dirs
    path = os.path.join(local_dir, 'file')
    create_large_file(path, FILE_SIZE)
    assert fs_backend.get_size(path) == FILE_SIZE


def test_get_hash(fs_backend, temp_dirs):
    local_dir, _ = temp_dirs
    path = os.path.join(local_dir, 'file')
    create_large_file(path, FILE_SIZE)
    expected = utils.checksum(path)
    actual = fs_backend.get_hash(path)
    assert actual == expected


def test_exists_and_delete(fs_backend, temp_dirs):
    local_dir, _ = temp_dirs
    path = os.path.join(local_dir, 'file')
    create_large_file(path, 1024)

    assert fs_backend.exists(path) is True
    fs_backend.delete(path)
    assert not os.path.exists(path)
    assert fs_backend.exists(path) is False


def test_ensure_directory(fs_backend, temp_dirs):
    _, storage_dir = temp_dirs
    nested_path = os.path.join(storage_dir, 'nested', 'subdir')
    fs_backend.ensure_directory(nested_path)
    assert os.path.isdir(nested_path)
