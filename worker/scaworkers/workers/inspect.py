from pathlib import Path

from celery import Celery

import scaworkers.api as api
import scaworkers.celeryconfig as celeryconfig
import scaworkers.utils as utils
from scaworkers.config import config
from scaworkers.workflow import WorkflowTask

app = Celery("tasks")
app.config_from_object(celeryconfig)


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
    num_files, num_directories, size, num_genome_files = 0, 0, 0, 0
    metadata = []
    for p in source.rglob('*'):
        if p.is_file():
            num_files += 1
            size += p.stat().st_size
            if ''.join(p.suffixes) in config['genome_file_types'] and not p.is_symlink():
                num_genome_files += 1
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

    return num_files, num_directories, size, num_genome_files, metadata


# celery -A celery_app worker --concurrency 4
@app.task(base=WorkflowTask, bind=True)
def inspect_dataset(self, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    source = Path(dataset['origin_path']).resolve()
    du_size = utils.total_size(source)
    num_files, num_directories, size, num_genome_files, metadata = generate_metadata(source)

    update_data = {
        'du_size': du_size,
        'size': size,
        'num_files': num_files,
        'num_directories': num_directories,
        'num_genome_files': num_genome_files,
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_checksums_to_dataset(dataset_id=dataset_id, checksums=metadata)

    return dataset_id,


if __name__ == '__main__':
    pass
    # source = '/N/u/dgluser/Carbonate/DGL'
    # inspect('/N/project/DG_Multiple_Myeloma/share/sentieon_val_7')
