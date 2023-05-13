from __future__ import annotations  # type unions by | are only available in versions > 3.10

import hashlib
import logging
import os
import time
from collections.abc import Iterable
from contextlib import contextmanager
from functools import wraps, partial
from itertools import islice
from pathlib import Path

logger = logging.getLogger(__name__)


def str_func_call(func, args, kwargs):
    args_list = [repr(arg) for arg in args] + [f"{key}={repr(val)}" for key, val in kwargs.items()]
    args_str = ", ".join(args_list)
    return f"{func.__name__}({args_str})"


def logged(func=None, header=True, trailer=True):
    if func is None:
        return partial(logged, header=header, trailer=trailer)

    @wraps(func)
    def wrap(*args, **kw):
        f_str = str_func_call(func, args, kw)
        if header:
            logger.info(f_str)
        ts = time.perf_counter()
        try:
            return func(*args, **kw)
        except Exception:
            raise
        finally:
            if trailer:
                te = time.perf_counter()
                logger.info(f"{f_str} completed in {(te - ts):2.4f} s")

    return wrap


def checksum(fname: Path | str):
    m = hashlib.md5()
    with open(str(fname), "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            m.update(chunk)
    return m.hexdigest()

    # python 3.11
    # with open(fname, 'rb') as f:
    #     digest = hashlib.file_digest(f, 'md5')


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
    "merges b into a"

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
