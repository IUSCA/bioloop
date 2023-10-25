from __future__ import annotations

import workers.cmd as cmd


def put(local_file: str, sda_file: str, verify_checksum: bool = True):
    """
    Transfer a local file to SDA

    If sda_file exists, it will be overwritten

    The checksum algorithms that are used are very CPU-intensive.
    Although the checksum code is compiled with a high level of compiler optimization,
    transfer rates can be significantly reduced when checksum creation or verification is in effect.
    The amount of degradation in transfer rates depends on several factors, such as processor speed,
    network transfer speed, and speed of the local filesystem.
    """
    # -c flag enables checksum creation
    put_cmd = 'put -c on' if verify_checksum else 'put'
    command = ['hsi', '-P', f'{put_cmd} {local_file} : {sda_file}']
    return cmd.execute(command)


def get_size(sda_path: str):
    command = ['hsi', '-P', f'ls -s1 {sda_path}']
    stdout, stderr = cmd.execute(command)
    return int(stdout.strip().split()[0])


def get(sda_file: str, local_file: str, verify_checksum=True):
    """
    Transfer a file from SDA to local disk.

    If the local_file exists, it will be overwritten.

    Transfer speeds are around 56 MBps

    The checksum algorithms that are used are very CPU-intensive.
    Although the checksum code is compiled with a high level of compiler optimization,
    transfer rates can be significantly reduced when checksum creation or verification is in effect.
    The amount of degradation in transfer rates depends on several factors, such as processor speed,
    network transfer speed, and speed of the local filesystem.
    """
    get_cmd = 'get -c on' if verify_checksum else 'get'
    command = ['hsi', '-P', f'{get_cmd} {local_file} : {sda_file}']
    return cmd.execute(command)


def get_hash(sda_path: str, missing_ok: bool = False) -> str | None:
    command = ['hsi', '-P', f'hashlist {sda_path}']
    try:
        stdout, stderr = cmd.execute(command)
        checksum = stdout.strip().split()[0]
        if checksum == '(none)':
            return None
        return checksum
    except cmd.SubprocessError:
        if missing_ok:
            return None
        else:
            raise


def delete(path: str) -> None:
    if exists(path):
        command = ['hsi', '-P', f'rm {path}']
        cmd.execute(command)


def exists(path: str) -> bool:
    command = ['hsi', '-P', f'ls {path}']
    try:
        cmd.execute(command)
        return True
    except cmd.SubprocessError:
        return False


def ensure_directory(dir_path: str) -> None:
    command = ['hsi', '-P', f'mkdir -p {dir_path}']
    cmd.execute(command)
