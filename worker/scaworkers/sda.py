import scaworkers.utils as utils


def put(source, target):
    command = ['hsi', '-P', f'put -c on {source} : {target}']
    return utils.execute(command)


def get_size(sda_path):
    command = ['hsi', '-P', f'ls -s1 {sda_path}']
    stdout, stderr = utils.execute(command)
    return int(stdout.strip().split()[0])


def get(source, target_dir):
    command = ['hsi', '-P', f'get {source}']
    return utils.execute(command, cwd=target_dir)


def get_hash(sda_path):
    command = ['hsi', '-P', f'hashlist {sda_path}']
    stdout, stderr = utils.execute(command)
    return stdout.strip().split()[0]


def delete(path):
    command = ['hsi', '-P', f'rm {path}']
    return utils.execute(command)
