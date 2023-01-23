from pathlib import Path
import tarfile
import shutil

import api
from config import config
import sda
import utils
from workflow import WorkflowTask
from celery_app import app


def get_batch_from_sda(batch):
    """
    gets the tar from SDA and extracts it

    input: batch['name'], batch['archive_path'] should exist
    returns: stage_path
    """

    sda_tar_path = batch['archive_path']
    staging_dir = Path(config['paths']['stage'])
    scratch_tar_path = Path(config['paths']['scratch']) / f"{batch['name']}.tar"
    sda_digest = sda.get_hash(sda_path=sda_tar_path)

    # check if tar file is already downloaded
    tarfile_exists = False
    if scratch_tar_path.exists() and scratch_tar_path.is_file() and tarfile.is_tarfile(scratch_tar_path):
        # if tar file exists, validate checksum against SDA
        scratch_digest = utils.checksum(scratch_tar_path)
        if sda_digest == scratch_digest:
            tarfile_exists = True

    if not tarfile_exists:
        # get the tarfile from SDA to scratch
        scratch_tar_path.unlink(missing_ok=True)
        sda.get(source=sda_tar_path, target_dir=scratch_tar_path.parent)
        # after getting the file from SDA, validate the checksum
        scratch_digest = utils.checksum(scratch_tar_path)
        if sda_digest != scratch_digest:
            raise Exception(f'Stage failed: Checksums of local {scratch_tar_path} ({scratch_digest})' +
                            'and SDA {sda_tar_path} ({sda_digest}) do not match')

    # extract the tar file
    # check for name conflicts in stage dir and delete dir if exists
    extracted_dir_name = staging_dir / batch['name']
    if extracted_dir_name.exists():
        shutil.rmtree(extracted_dir_name)
    with tarfile.open(scratch_tar_path) as tar:
        tar.extractall(path=staging_dir)

    # delete the local tar copy after extraction
    scratch_tar_path.unlink()
    return str(extracted_dir_name)


# celery -A celery_app worker --concurrency 4
@app.task(base=WorkflowTask, bind=True)
def stage_batch(celery_app, batch_id, **kwargs):
    batch = api.get_batch(batch_id=batch_id)
    extracted_dir_name = get_batch_from_sda(batch)
    update_data = {
        'stage_path':  extracted_dir_name
    }
    api.update_batch(batch_id=batch_id, update_data=update_data)
    return batch_id


if __name__ == '__main__':
    pass
    # batch = {
    #     'name': 'worker',
    #     'paths': {
    #         'origin': '/N/u/dgluser/Carbonate/DGL/worker'
    #     }
    # }
    # stage_batch(batch)
