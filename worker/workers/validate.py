from pathlib import Path
from datetime import datetime
import shutil

import utils
import config


def validate(batch):
    check_files(batch_dir=batch['paths']['staged'], metadata=batch['metadata'])
    # TODO: what to do if the checksums do not match?


def check_files(batch_dir, metadata):
    batch_dir = Path(batch_dir)
    validated_count = 0
    for file_metadata in metadata:
        rel_path = file_metadata['path']
        path = stage_dir / batch_dir / rel_path
        digest = utils.checksum(path)
        if digest == files_metadata['md5']:
            validated_count += 1
    return validated_count == len(files_metadata)


# TODO: move out of validate
def clean_old_data(batch):
    stage_dir = Path(config['paths']['stage_dir']).resolve()
    data_age = datetime.strptime(batch['takenAt'], '%Y-%m-%dT%H:%M:%S.%fZ')
    delta = datetime.now() - data_age
    if delta.days > 30:
        stale_path = stage_dir / batch['name']
        shutil.rmtree(stale_path)
