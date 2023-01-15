import hashlib
import os
from subprocess import Popen, PIPE
import subprocess
from multiprocessing import Process 
from contextlib import contextmanager
import time


def checksum(fname):
    m = hashlib.md5()
    with open(fname, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            m.update(chunk)
    return m.hexdigest()


def checksum_py311(fname):
    with open(fname, 'rb') as f:
        digest = hashlib.file_digest(f, 'md5')
        return digest.hexdigest()


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


def execute(cmd, **kwargs):
    """
    returns stdout, stderr (strings)
    if the return code is not zero, subprocess.CalledProcessError is raised
    try:
        execute(cmd)
    except subprocess.CalledProcessError as exc:
        print(exc.stdout, exc.stderr, exc.returncode)
    """
    p = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return p.stdout, p.stderr


def total_size(dir_path):
    """
    can throw CalledProcessError if the executable or options are wrong for the platform or the input dir_path does not exist
    can throw IndexError: list index out of range - if the stdout is not in expected format
    can throw ValueError - invalid literal for int() with base 10 - if the stdout is not in expected format
    """
    completed_proc = subprocess.run(['du', '-sb', str(dir_path)], capture_output=True, check=True)
    return int(completed_proc.stdout.decode('utf-8').split()[0])


@contextmanager
def track_progress_parallel(progress_fn, progress_fn_args, loop_delay=5):
    def progress_loop():
        while True:
            try:
                progress_fn(*progress_fn_args)
            except :
                pass
            time.sleep(loop_delay)
    
    try:
        # start a subprocess to call progress_loop every loop_delay seconds
        p = Process(target=progress_loop)
        p.start()
        yield p # inside the context manager
    finally:
        # terminate the sub process
        p.terminate()

def progress(done, total=None):
    progress = None
    if total_size:
        progress = size * 1.0 / total_size
    return {
        'progress': progress,
        'done': size,
        'total': total_size,
        'units': 'bytes',
    }