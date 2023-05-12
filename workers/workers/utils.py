from __future__ import annotations  # type unions by | are only available in versions > 3.10

import hashlib
import logging
import os
import subprocess
import time
from collections.abc import Iterable
from contextlib import contextmanager
from functools import wraps
from itertools import islice
from pathlib import Path
from subprocess import Popen, PIPE

# import multiprocessing
# https://stackoverflow.com/questions/30624290/celery-daemonic-processes-are-not-allowed-to-have-children
import billiard as multiprocessing
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress

logger = logging.getLogger(__name__)


def str_func_call(func, args, kwargs):
    args_list = [repr(arg) for arg in args] + [f"{key}={repr(val)}" for key, val in kwargs.items()]
    args_str = ", ".join(args_list)
    return f"{func.__name__}({args_str})"


def timing(f):
    @wraps(f)
    def wrap(*args, **kw):
        f_str = str_func_call(f, args, kw)
        print(f"{f_str} start")
        ts = time.perf_counter()
        try:
            result = f(*args, **kw)
            return result
        except Exception:
            raise
        finally:
            te = time.perf_counter()
            print(f"{f_str} took: {(te - ts):2.4f} s")

    return wrap


@timing
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


def execute_old(cmd, cwd=None):
    if not cwd:
        cwd = os.getcwd()
    env = os.environ.copy()
    with Popen(cmd, cwd=cwd, stdout=PIPE, stderr=PIPE, shell=True, env=env) as p:
        stdout_lines = []
        for line in p.stdout:
            stdout_lines.append(line)
        return p.pid, stdout_lines, p.returncode


class SubprocessError(Exception):
    pass


@timing
def execute(cmd: list[str], cwd: str = None) -> tuple[str, str]:
    """
    returns stdout, stderr (strings)
    if the return code is not zero, SubprocessError is raised with a dict of
    {
        'return_code': 1,
        'stdout': '',
        'stderr': '',
        'args': []
    }
    """
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        msg = {
            'return_code': p.returncode,
            'stdout': p.stdout,
            'stderr': p.stderr,
            'args': p.args
        }
        raise SubprocessError(msg)
    return p.stdout, p.stderr


def total_size(dir_path: Path | str):
    """
    can throw CalledProcessError
    can throw IndexError: list index out of range - if the stdout is not in expected format
    can throw ValueError - invalid literal for int() with base 10 - if the stdout is not in expected format
    """
    completed_proc = subprocess.run(['du', '-sb', str(dir_path)], capture_output=True, check=True, text=True)
    return int(completed_proc.stdout.split()[0])


@contextmanager
def track_progress_parallel(celery_task: WorkflowTask,
                            name: str,
                            progress_fn,
                            total: int = None,
                            units: str = None,
                            loop_delay=5):
    def progress_loop():
        prog = Progress(celery_task=celery_task, name=name, total=total, units=units)
        while True:
            time.sleep(loop_delay)
            try:
                done = progress_fn()
                prog.update(done)
            except Exception as e:
                # log the exception message without stacktrace
                logger.warning('exception in parallel progress loop: %s', e)

    p = None
    try:
        # start a subprocess to call progress_loop every loop_delay seconds
        p = multiprocessing.Process(target=progress_loop)
        p.start()
        logger.info(f'starting a sub process to track progress with pid: {p.pid}')
        yield p  # inside the context manager
    finally:
        # terminate the sub process
        logger.info(f'terminating progress tracker: {p.pid}')
        if p is not None:
            p.terminate()


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


def tar(tar_path: Path | str, source_dir: Path | str) -> None:
    command = ['tar', 'cf', str(tar_path), '--sparse', str(source_dir)]
    execute(command)


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


def fastqc_parallel(fastq_files: list[Path | str], output_dir: Path | str, num_threads: int = 8) -> None:
    """
    Run the FastQC tool to check the quality of all fastq files

    @param fastq_files: list of paths to fastq.gz files
    @param output_dir: cmd = ['fastqc', '-t', '8'] + fastq_files + ['-o', str(output_dir)]
    @param num_threads: parallel processing threads
    """
    cmd = ['fastqc', '-t', str(num_threads)] + [str(p) for p in fastq_files] + ['-o', str(output_dir)]
    execute(cmd)


def multiqc(source_dir: Path | str, output_dir: Path | str) -> None:
    """
    Run the MultiQC tool to generate an aggregate report

    @param source_dir: (pathlib.Path): where fastqc generated reports
    @param output_dir: (pathlib.Path): where to create multiqc_report.html and multiqc_data
    @return: none
    """
    cmd = ['multiqc', str(source_dir), '-o', str(output_dir)]
    execute(cmd)
