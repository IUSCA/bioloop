from pathlib import Path
import hashlib

import utils


def generate_metadata(source):
    num_files, num_directories, size, cbcls = 0, 0, 0, 0
    metadata = []
    for p in source.rglob('*'):
        if p.is_file():
            num_files += 1
            size += p.stat().st_size
            if ''.join(p.suffixes) in ['.cbcl', '.bcl', '.bcl.gz', '.bgzf']: # .fastq.gz, .bam, .bam.bai, .vcf.gz, .vcf.gz.tbi, .vcf
                cbcls += 1
                with open(p, 'rb') as f:
                    digest = hashlib.file_digest(f, 'md5')
                relpath = p.relative_to(source)
                metadata.append({
                    'path': str(relpath),
                    'md5': digest.hexdigest()
                })
        elif p.is_dir():
            num_directories += 1

    return num_files, num_directories, size, cbcls, metadata


def inspect(source):
    source = Path(source).resolve()
    # events?
    du_size = utils.total_size(source)
    num_files, num_directories, size, cbcls, metadata = generate_metadata(source)
