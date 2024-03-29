"""
HPFS - Utilities to monitor the usage of High Performance File Systems
"""
import logging

import workers.cmd as cmd
from workers import utils
from workers.utils import convert_size_to_bytes

logger = logging.getLogger(__name__)


def parse_quota_output(text):
    """
    Parse the stdout of quota command.

    prerequisite: run "module load quota" or add it to ~/.modules
    :param text:
    :return: List of dicts like {'Filesystem': 'home', 'usage': 4294967296, 'quota': 107374182400}
    """
    data = []
    header = None
    for line in text.strip().split("\n"):
        if "Filesystem" in line:
            header = line.strip().split()
        elif header is not None and "Projects" not in line:
            fields = line.strip().split("  ")
            # remove empty strings from fields list
            fields = list(filter(None, fields))
            # convert usage and quota to bytes
            for i, field in enumerate(fields):
                if header[i] in ["usage", "quota"]:
                    try:
                        fields[i] = convert_size_to_bytes(field.strip())
                    except Exception as e:
                        logger.warning('unable to convert to bytes', field, e)
            # create a dict by mapping the fields to the header
            data.append(dict(zip(header, fields)))
    return [{k: v for k, v in d.items() if k in ['Filesystem', 'usage', 'quota']} for d in data if d]


def parse_lfs_quota_output(text):
    """
    Parse the stdout of "lfs quota -h -u username /N/scratch" command.

    refer: https://kb.iu.edu/d/bgtr#check
    :param text:
    :return: List of dicts like {'Filesystem': 'home', 'usage': 4294967296, 'limit': 107374182400, quota: 0, grace: 0}
    """
    lines = [line.strip() for line in text.split('\n') if line.strip()][1:]
    header = lines[0].split()
    fields = [utils.parse_number(f, f) for f in lines[1].split()]
    fields = [0 if f == '-' else f for f in fields]
    size_usage = dict(zip(header[:5], fields[:5]))
    size_usage['usage'] = size_usage.pop('kbytes') * 1024
    size_usage['limit'] = size_usage['limit'] * 1024

    files_usage = dict(zip(header[5:], fields[5:]))
    files_usage['usage'] = files_usage.pop('files')
    files_usage['Filesystem'] = str(size_usage['Filesystem']) + ' files'
    return size_usage, files_usage


def get_disk_usages():
    """
    runs quota command and parses its output to a neat dictionary

    prerequisite: run "module load quota" or add it to ~/.modules

    :return: List of dicts like {'Filesystem': 'home', 'usage': 4294967296, 'quota': 107374182400}
    """
    stdout, stderr = cmd.execute(['quota'])
    return parse_quota_output(stdout)


def get_slate_scratch_usage(username):
    command = ['lfs', 'quota', '-u', username, '/N/scratch']
    stdout, stderr = cmd.execute(command)
    return parse_lfs_quota_output(stdout)
