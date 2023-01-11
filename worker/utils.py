import hashlib
import os
from subprocess import Popen, PIPE
import subprocess


def checksum_old(fname):
    m = hashlib.md5()
    with open(fname, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            m.update(chunk)
    return m.hexdigest()


def checksum(fname):
    with open(fname, 'rb') as f:
        digest = hashlib.file_digest(f, 'md5')
        return digest.hexdigest()


def execute_old(cmd, cwd):
    env = os.environ.copy()
    with Popen(cmd, cwd=cwd, stdout=PIPE, stderr=PIPE, shell=True, env=env) as p:
        return p.pid, list(p.stdout), p.returncode


def execute(cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, check=True, shell=True)
    return p.stdout.decode('utf-8'), p.stderr.decode('utf-8'), p.returncode


def total_size(dir_path):
    """
    can throw CalledProcessError if the executable or options are wrong for the platform or the input dir_path does not exist
    can throw IndexError: list index out of range - if the stdout is not in expected format
    can throw ValueError - invalid literal for int() with base 10 - if the stdout is not in expected format
    """
    completed_proc = subprocess.run(['du', '-sb', str(dir_path)], capture_output=True, check=True)
    return int(completed_proc.stdout.decode('utf-8').split()[0])