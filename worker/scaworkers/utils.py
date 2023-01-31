import hashlib
import os
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path
from subprocess import Popen, PIPE

# import multiprocessing
# https://stackoverflow.com/questions/30624290/celery-daemonic-processes-are-not-allowed-to-have-children
import billiard as multiprocessing


def checksum(fname):
    m = hashlib.md5()
    with open(fname, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            m.update(chunk)
    return m.hexdigest()


#
# def checksum_py311(fname):
#     with open(fname, 'rb') as f:
#         digest = hashlib.file_digest(f, 'md5')
#         return digest.hexdigest()


def execute_old(cmd, cwd=None):
    if not cwd:
        cwd = os.getcwd()
    print('executing', cmd, 'at', cwd)
    env = os.environ.copy()
    with Popen(cmd, cwd=cwd, stdout=PIPE, stderr=PIPE, shell=True, env=env) as p:
        stdout_lines = []
        for line in p.stdout:
            stdout_lines.append(line)
        return p.pid, stdout_lines, p.returncode


def execute(cmd, cwd=None):
    """
    returns stdout, stderr (strings)
    if the return code is not zero, subprocess.CalledProcessError is raised
    try:
        execute(cmd)
    except subprocess.CalledProcessError as exc:
        print(exc.stdout, exc.stderr, exc.returncode)
    """
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=True)
    return p.stdout, p.stderr


def total_size(dir_path):
    """
    can throw CalledProcessError
    can throw IndexError: list index out of range - if the stdout is not in expected format
    can throw ValueError - invalid literal for int() with base 10 - if the stdout is not in expected format
    """
    completed_proc = subprocess.run(['du', '-sb', str(dir_path)], capture_output=True, check=True, text=True)
    return int(completed_proc.stdout.split()[0])


@contextmanager
def track_progress_parallel(progress_fn, progress_fn_args, loop_delay=5):
    def progress_loop():
        while True:
            time.sleep(loop_delay)
            try:
                progress_fn(*progress_fn_args)
            except Exception as e:
                print('loop: exception', e)

    p = None
    try:
        # start a subprocess to call progress_loop every loop_delay seconds
        p = multiprocessing.Process(target=progress_loop)
        p.start()
        print(f'starting a sub process to track progress with pid: {p.pid}')
        yield p  # inside the context manager
    finally:
        # terminate the sub process
        print(f'terminating progress tracker')
        if p is not None:
            p.terminate()


def progress(name, done, total=None):
    percent_done = None
    if total:
        percent_done = done * 1.0 / total
    return {
        'name': name,
        'percent_done': percent_done,
        'done': done,
        'total': total,
        'units': 'bytes',
    }


def file_progress(celery_task, path, total, progress_name):
    size = Path(path).stat().st_size
    name = f'{celery_task.name}.{progress_name}.progress'
    r = progress(name=name, done=size, total=total)
    celery_task.update_progress(r)


def parse_int(x, default=None):
    if x is None:
        return x
    try:
        return int(x)
    except ValueError:
        return default
