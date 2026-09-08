"""The archive tier, behind one interface with two backends.

A dataset is bundled into a single tar file and then handed to an archive. In a
real deployment that archive is SDA, IU's tape system, reached through the hsi
command line tools. On a developer machine hsi is not installed, so the archive
is an ordinary directory instead.

Both backends expose the same seven functions, and callers use this module
rather than either backend directly:

    put(local_file, archive_file, verify_checksum=True)
    get(archive_file, local_file, verify_checksum=True)
    get_size(archive_path)          -> int
    get_hash(archive_path, missing_ok=False) -> str | None
    delete(path)
    exists(path)                    -> bool
    ensure_directory(dir_path)

The backend is chosen by `config['storage']['backend']`, not by APP_ENV, so a
deployment that has hsi and a developer machine that does not differ by one
config value. An unknown name raises at import rather than falling back.

get_hash returns whatever digest its own backend records: hsi returns the
checksum SDA stored, and the posix backend returns an md5. The two are not
comparable, and nothing needs them to be, because a given archive is only ever
read by the backend that wrote it.
"""

import importlib

from workers.config import config

BACKENDS = ('sda', 'posix')

_name = config['storage']['backend']
if _name not in BACKENDS:
    raise ValueError(
        f"unknown storage backend {_name!r} in config['storage']['backend']; "
        f'expected one of {BACKENDS}'
    )

backend_name = _name
_backend = importlib.import_module(f'workers.storage.{backend_name}')

put = _backend.put
get = _backend.get
get_size = _backend.get_size
get_hash = _backend.get_hash
delete = _backend.delete
exists = _backend.exists
ensure_directory = _backend.ensure_directory

__all__ = [
    'backend_name', 'put', 'get', 'get_size', 'get_hash', 'delete', 'exists',
    'ensure_directory',
]
