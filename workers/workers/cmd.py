from __future__ import annotations

import os
import subprocess
from pathlib import Path
from subprocess import Popen, PIPE


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


class SubprocessError(Exception):
    pass


def execute_old(cmd, cwd=None):
    if not cwd:
        cwd = os.getcwd()
    env = os.environ.copy()
    with Popen(cmd, cwd=cwd, stdout=PIPE, stderr=PIPE, shell=True, env=env) as p:
        stdout_lines = []
        for line in p.stdout:
            stdout_lines.append(line)
        return p.pid, stdout_lines, p.returncode


def tar(tar_path: Path | str, source_dir: Path | str) -> None:
    command = ['tar', 'cf', str(tar_path), '--sparse', str(source_dir)]
    execute(command)


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
