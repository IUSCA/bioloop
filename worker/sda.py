import utils


def put(source, target):
    command = ['hsi', '-P', f"put -c {source} : {target}"]
    return utils.execute(command)


def get_size(sda_path):
    command = ['hsi', '-P', f'ls -s {sda_path}']
    stdout, stderr, return_code = utils.execute(command)
    return int(stdout.split()[5])


def get(source, target_dir):
    command = ['hsi', '-P', f'get {source}']
    return utils.execute(command, cwd=target_dir)


# TODO: hsi hash list {source} - get the checksum (md5)