from __future__ import annotations  # type unions by | are only available in versions > 3.10

import hashlib
import json
import os
from collections.abc import Iterable
from contextlib import contextmanager
from datetime import datetime, timezone, date, time
from time import time as seconds_since_epoch
from enum import Enum, unique
from itertools import islice, chain
from pathlib import Path


def str_func_call(func, args, kwargs):
    args_list = [repr(arg) for arg in args] + [f"{key}={repr(val)}" for key, val in kwargs.items()]
    args_str = ", ".join(args_list)
    return f"{func.__name__}({args_str})"


def checksum(fname: Path | str):
    m = hashlib.md5()
    with open(str(fname), "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            m.update(chunk)
    return m.hexdigest()


#
# def checksum_py311(fname):
#     with open(fname, 'rb') as f:
#         digest = hashlib.file_digest(f, 'md5')
#         return digest.hexdigest()


def parse_number(x, default=None, func=int):
    if x is None:
        return x
    try:
        return func(x)
    except ValueError:
        return default


def convert_size_to_bytes(size_str: str) -> int:
    num, unit = size_str[:-1], size_str[-1]
    if unit == "K":
        return int(float(num) * 1024)
    elif unit == "M":
        return int(float(num) * 1024 ** 2)
    elif unit == "G":
        return int(float(num) * 1024 ** 3)
    elif unit == "T":
        return int(float(num) * 1024 ** 4)
    else:
        return parse_number(size_str, default=size_str)


def merge(a: dict, b: dict) -> dict:
    """
    "merges b into a" - overwrites values of a with that of b for conflicting keys

    a = {
        1: {"a":"A"},
        2: {"b":"B"},
        3: [1,2,3],
        4: {'a': {'b': 2}}
    }

    b = {
        2: {"c":"C"},
        3: {"d":"D"},
        4: {'c': {'b': 3}, 'a': [1,2,{'b':2}]}
    }

    merge(a,b)
    {
        1: {'a': 'A'},
        2: {'b': 'B', 'c': 'C'},
        3: {'d': 'D'},
        4: {'a': [1, 2, {'b': 2}], 'c': {'b': 3}}
    }
    """

    for key in b:
        if key in a:
            if isinstance(a[key], dict) and isinstance(b[key], dict):
                merge(a[key], b[key])
            else:
                a[key] = b[key]
        else:
            a[key] = b[key]
    return a


def is_readable(f: Path):
    if f.is_file() and os.access(str(f), os.R_OK):
        return True
    if f.is_dir() and os.access(str(f), os.R_OK | os.X_OK):
        return True
    return False


def batched(iterable: Iterable, n: int) -> list:
    """Batch data into lists of length n. The last batch may be shorter."""
    # batched('ABCDEFG', 3) --> ABC DEF G
    it = iter(iterable)
    while True:
        batch = list(islice(it, n))
        if not batch:
            return
        yield batch


@contextmanager
def empty_context_manager():
    try:
        yield
    finally:
        pass


@unique
class FileType(str, Enum):
    FILE = 'file'
    DIRECTORY = 'directory'
    SYMBOLIC_LINK = 'symbolic link'
    OTHER = 'other'


def filetype(p: Path) -> FileType:
    if p.is_symlink():
        return FileType.SYMBOLIC_LINK
    if p.is_file():
        return FileType.FILE
    if p.is_dir():
        return FileType.DIRECTORY
    return FileType.OTHER


def current_time_iso8601() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date, time)):
            return obj.isoformat()
        # if isinstance(obj, bytes):
        #     # Encode bytes as base64
        #     return obj.decode('utf-8')
        return super().default(obj)


def dir_last_modified_time(dir_path: Path) -> float:
    """
    Obtain the most recent modification time for a directory and all its contents in a recursive manner.
    At times, when copying files, outdated modification times may be retained.
    To address this, monitor the modification time of the root directory as well.

    If the copy process is configured to preserve the metadata of the source file, it will update the m_time
    of the target file after the copy process. This will update the c_time of the target file. In these cases,
    c_time will be bigger than m_time. So, we will consider the maximum of c_time and m_time of the file / directory
    as the last modified time.


    Args:
    dir_path (Path): Path object to the directory.

    Returns:
    float: The last modified time in epoch seconds.
    """
    paths = chain([dir_path], dir_path.rglob('*'))
    return max(
        (max(p.lstat().st_mtime, p.lstat().st_ctime) for p in paths if p.exists()),
        default=seconds_since_epoch()
    )
