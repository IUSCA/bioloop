from pathlib import Path
import hashlib

import utils
import json


def generate_metadata(source):
    """
    source is a directiry that exists and has to readable and executable (see files inside)
    all the files and directories under source should be readable
    returns:    number of files, 
                number of directories, 
                sum of stat size of all files, 
                number of genome data files,
                the md5 digest and relative filenames of genome data files
    """
    # TODO: check source is a directiry that exists and has to readable and executable (see files inside)
    # TODO: all the files and directories under source should be readable
    # TODO: what is the exception raised if rglob fails because of file permission issue?
    # TODO: what is the exception raised by open if the file is not readable?
    num_files, num_directories, size, cbcls = 0, 0, 0, 0
    metadata = []
    for p in source.rglob('*'):
        if p.is_file():
            num_files += 1
            size += p.stat().st_size
            if ''.join(p.suffixes) in ['.cbcl', '.bcl', '.bcl.gz', '.bgzf', '.fastq.gz', '.bam', '.bam.bai', '.vcf.gz', '.vcf.gz.tbi', '.vcf']:
                cbcls += 1
                # with open(p, 'rb') as f:
                #     digest = hashlib.file_digest(f, 'md5')
                hexdigest = utils.checksum(p)
                relpath = p.relative_to(source)
                metadata.append({
                    'path': str(relpath),
                    'md5': hexdigest
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

if __name__=='__main__':
    source = '/N/project/DG_Multiple_Myeloma/share/sentieon_val_7'
    # source = '/N/u/dgluser/Carbonate/DGL'
    inspect(source)