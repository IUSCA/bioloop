from __future__ import annotations

import logging
import os
import socket
import subprocess
import time
from collections import namedtuple
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
from pathlib import Path
from queue import Queue
from subprocess import Popen, PIPE

from sca_rhythm import WorkflowTask

from workers import api
from workers import utils
from workers.config import config

logger = logging.getLogger(__name__)


class SubprocessError(Exception):
    pass


def execute(cmd: list[str], **kwargs) -> tuple[str, str]:
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
    kwargs.pop('capture_output', None)
    kwargs.pop('text', None)
    p = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if p.returncode != 0:
        msg = {
            'return_code': p.returncode,
            'stdout': p.stdout,
            'stderr': p.stderr,
            'args': p.args
        }
        raise SubprocessError(msg)
    return p.stdout, p.stderr


Log = namedtuple('Log', ['timestamp', 'level', 'message'])


def enqueue_output(file, queue, level):
    for line in file:
        timestamp = utils.current_time_iso8601()
        queue.put(Log(timestamp=timestamp, level=level, message=line))
    file.close()


def read_popen_pipes(p, blocking_delay: float = 0.5):
    with ThreadPoolExecutor(2) as pool:
        q = Queue()

        pool.submit(enqueue_output, p.stdout, q, 'stdout')
        pool.submit(enqueue_output, p.stderr, q, 'stderr')

        while True:
            if p.poll() is not None and q.empty():
                break

            lines = []
            while not q.empty():
                lines.append(q.get_nowait())

            if lines:
                yield lines

            # otherwise, loop will run as fast as possible and utilizes 100% of the CPU
            time.sleep(blocking_delay)


def register_process(celery_task, process, process_start_time):
    try:
        hostname = socket.getfqdn()
        worker_process = api.register_process({
            'workflow_id': celery_task.workflow_id,
            'step': celery_task.step,
            'task_id': celery_task.id,
            'pid': process.pid,
            'hostname': hostname,
            'start_time': process_start_time,
            'tags': {
                'args': process.args
            }
        })
        return worker_process['id']
    except Exception as e:
        logger.warning(f'Unable to register process to send logs', exc_info=e)


def log_object(log):
    return {
        'timestamp': log.timestamp,
        'level': log.level,
        'message': log.message,
    }


def execute_with_log_tracking(cmd: list[str], celery_task: WorkflowTask, cwd: str = None, blocking_delay: float = 5.0):
    with subprocess.Popen(cmd,
                          cwd=cwd,
                          stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE,
                          bufsize=1,
                          universal_newlines=True) as p:
        process_start_time = utils.current_time_iso8601()
        worker_process_id = register_process(celery_task, p, process_start_time)
        for lines in read_popen_pipes(p, blocking_delay):

            data = [log_object(line) for line in lines]
            try:
                if not worker_process_id:
                    worker_process_id = register_process(celery_task, p, process_start_time)
                api.post_worker_logs(worker_process_id, data)
            except Exception as e:
                logger.warning(f'Unable to send worker logs', exc_info=e)

    if p.returncode != 0:
        msg = {
            'return_code': p.returncode,
            'stdout': None,
            'stderr': None,
            'args': p.args
        }
        raise SubprocessError(msg)


def execute_old(cmd, cwd=None):
    if not cwd:
        cwd = os.getcwd()
    env = os.environ.copy()
    with Popen(cmd, cwd=cwd, stdout=PIPE, stderr=PIPE, shell=True, env=env) as p:
        stdout_lines = []
        for line in p.stdout:
            stdout_lines.append(line)
        return p.pid, stdout_lines, p.returncode


def total_size(dir_path: Path | str):
    """
    can throw CalledProcessError
    can throw IndexError: list index out of range - if the stdout is not in expected format
    can throw ValueError - invalid literal for int() with base 10 - if the stdout is not in expected format
    """
    completed_proc = subprocess.run(['du', '-sb', str(dir_path)], capture_output=True, check=True, text=True)
    return int(completed_proc.stdout.split()[0])


def tar(tar_path: Path | str, source_dir: Path | str) -> None:
    command = ['tar', 'cf', str(tar_path), '--sparse', '-C', str(source_dir), '.']
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


def send_email(from_addr, to_addrs, msg_subject, msg_body,
               sendmail_path=config['email']['sendmail_path']):
    msg = EmailMessage()
    msg.set_content(msg_body)
    msg['From'] = from_addr
    msg['To'] = to_addrs
    msg['Subject'] = msg_subject

    subprocess.run([sendmail_path, "-t", "-oi"], input=msg.as_bytes())
