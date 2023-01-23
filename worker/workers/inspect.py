import json
from pathlib import Path

import celery
from celery import Celery, Task

import celeryconfig
import utils
from config import config
from workflow import WorkflowTask


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

app = Celery("tasks")
app.config_from_object(celeryconfig)
# celery -A workers.inspect worker --concurrency 4
@app.task(base=WorkflowTask, bind=True)
def inspect_batch(self, source, **kwargs):
    source = Path(source).resolve()
    du_size = utils.total_size(source)
    num_files, num_directories, size, cbcls, metadata = generate_metadata(source)
    
    batch = {
        'name': source.name,
        'du_size': du_size,
        'paths': {
            'origin': str(source)
        },
        'num_files': num_files,
        'num_directories': num_directories,
        'size': size,
        'cbcls': cbcls,
        'metadata': metadata
    }    

    # with open('inspect_result.json', 'w') as f:
    #     json.dump(batch, f)

    return batch

if __name__ == '__main__':
    # source = '/N/u/dgluser/Carbonate/DGL'
    inspect('/N/project/DG_Multiple_Myeloma/share/sentieon_val_7')
