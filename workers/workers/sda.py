import workers.utils as utils


def put(source: str, target: str):
    command = ['hsi', '-P', f'put -c on {source} : {target}']
    return utils.execute(command)


def get_size(sda_path: str):
    command = ['hsi', '-P', f'ls -s1 {sda_path}']
    stdout, stderr = utils.execute(command)
    return int(stdout.strip().split()[0])


def get(source: str, target: str):
    command = ['hsi', '-P', f'get {source} : {target}']
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
