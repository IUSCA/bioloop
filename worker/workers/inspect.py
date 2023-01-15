import json
from pathlib import Path

import utils
from config import config


def generate_metadata(source):
    """
    source is a directory that exists and has to readable and executable (see files inside)
    all the files and directories under source should be readable
    returns:    number of files, 
                number of directories, 
                sum of stat size of all files, 
                number of genome data files,
                the md5 digest and relative filenames of genome data files
    """
    # TODO: check source is a directory that exists and has to readable and executable (see files inside)
    # TODO: all the files and directories under source should be readable
    # TODO: what is the exception raised if rglob fails because of file permission issue?
    # TODO: what is the exception raised by open if the file is not readable?
    num_files, num_directories, size, cbcls = 0, 0, 0, 0
    metadata = []
    for p in source.rglob('*'):
        if p.is_file():
            num_files += 1
            size += p.stat().st_size
            if ''.join(p.suffixes) in config['genome_file_types']:
                cbcls += 1
                # with open(p, 'rb') as f:
                #     digest = hashlib.file_digest(f, 'md5')
                hex_digest = utils.checksum(p)
                relpath = p.relative_to(source)
                metadata.append({
                    'path': str(relpath),
                    'md5': hex_digest
                })
        elif p.is_dir():
            num_directories += 1

    return num_files, num_directories, size, cbcls, metadata


def inspect(source):
    source = Path(source).resolve()
    du_size = utils.total_size(source)
    num_files, num_directories, size, cbcls, metadata = generate_metadata(source)
    print(num_files, num_directories, size, cbcls)
    with open('inspect_result.json', 'w') as f:
        json.dump({
            'num_files': num_files,
            'num_directories': num_directories,
            'size': size,
            'cbcls': cbcls,
            'metadata': metadata
        }, f)


if __name__ == '__main__':
    # source = '/N/u/dgluser/Carbonate/DGL'
    inspect('/N/project/DG_Multiple_Myeloma/share/sentieon_val_7')
