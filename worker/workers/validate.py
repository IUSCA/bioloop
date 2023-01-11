from pathlib import Path
from datetime import datetime
import shutil

import utils
import config


def validate(dataset):
    if check_files(dataset):
        dataset['validated'] = True
        clean_old_data(dataset)


def check_files(dataset):
    dataset_name, files_metadata = dataset['name'], dataset['checksums']
    stage_dir = Path(config['paths']['stage_dir']).resolve()
    validated_count = 0
    for file_metadata in files_metadata:
        fname = file_metadata['path']
        path = stage_dir / dataset_name / fname
        digest = utils.checksum(path)
        if digest == files_metadata['md5']:
            validated_count += 1
    return validated_count == len(files_metadata)


# TODO: move out of validate
def clean_old_data(dataset):
    stage_dir = Path(config['paths']['stage_dir']).resolve()
    data_age = datetime.strptime(dataset['takenAt'], '%Y-%m-%dT%H:%M:%S.%fZ')
    delta = datetime.now() - data_age
    if delta.days > 30:
        stale_path = stage_dir / dataset['name']
        shutil.rmtree(stale_path)
