from pathlib import Path
import tarfile

import config
import sda


def get_batch_from_sda(batch):
    """
    gets the tar from SDA and extracts it

    input: batch['name'], batch['paths']['archive'] should exists
    returns: batch, adds batch['paths']['staged']
    """
    sda_path = batch['paths']['archive']
    stage_dir = Path(config['paths']['stage_dir'])
    scratch_tar_path = Path(config['paths']['scratch']) / f"{batch['name']}.tar"
    sda_digest = sda.get_hash(sda_path=sda_path)
    scratch_digest = utils.checksum(scratch_tar_path)

    # check if tar file is already downloaded
    tarfile_exists = False
    if scratch_tar_path.exists() and scratch_tar_path.is_file() and tarfile.is_tarfile(scratch_tar_path):
        # if tar file exists, validate checksum against SDA
        if sda_digest == scratch_digest:
            tarfile_exists = True

    # get the tarfile from SDA to scratch
    if not tarfile_exists:
        scratch_tar_path.unlink(missing_ok=True)
        sda.get(source=sda_path, target_dir=scratch_tar_path.parent)
        # after getting the file from SDA, validate the checksum
        scratch_digest = utils.checksum(scratch_tar_path)
        if sda_digest != scratch_digest:
            raise Exception(f'Stage failed: Checksums of local {scratch_tar_path} ({scratch_digest}) and SDA {sda_tar_path} ({sda_digest}) do not match')

    # extract the tar file
    # check for name conflicts in stage dir and delete dir if exists
    extracted_dirname = stage_dir / batch['name']
    extracted_dirname.unlink(missing_ok=True)
    with tarfile.open(scratch_tar_path) as tar:
        tar.extractall(path=stage_dir)
    
    # delete the local tar copy after extraction
    scratch_tar_path.unlink()
    batch['paths']['staged'] = str(extracted_dirname)
    return batch

if __name__=='__main__':
    batch = {
        'name': 'worker',
        'paths': {
            'origin': '/N/u/dgluser/Carbonate/DGL/worker'
        }
    }
    get_dataset_from_sda()