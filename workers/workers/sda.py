import workers.utils as utils


def put(local_file: str, sda_file: str, verify_checksum=True):
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
    command = ['hsi', '-P', f'${put_cmd} {local_file} : {sda_file}']
    return utils.execute(command)


def get_size(sda_path: str):
    command = ['hsi', '-P', f'ls -s1 {sda_path}']
    stdout, stderr = utils.execute(command)
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
    return utils.execute(command)


def get_hash(sda_path: str):
    command = ['hsi', '-P', f'hashlist {sda_path}']
    stdout, stderr = utils.execute(command)
    return stdout.strip().split()[0]


def delete(path: str):
    command = ['hsi', '-P', f'rm {path}']
    return utils.execute(command)


def ensure_directory(dir_path: str) -> None:
    command = ['hsi', '-P', f'mkdir -p {dir_path}']
    return utils.execute(command)
