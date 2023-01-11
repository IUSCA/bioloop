from pathlib import Path
import tarfile

import config
import sda


def get_dataset_from_sda(dataset):
    ds_name = dataset['name']
    sda_path = f"{config['paths']['archive_dir']}/{ds_name}.tar"
    stage_dir = Path(config['paths']['stage_dir'])
    tar_path = Path(config['paths']['tar_dir']) / f"{ds_name}.tar"

    # TODO: check for name conflicts in stage dir
    # TODO: delete entirely existing dir in stage dir
    if not (tar_path.exists() and tar_path.is_file() and tarfile.is_tarfile(tar_path)): # TODO: validate checksum with hsi
        sda.get(source=sda_path, target_dir=tar_path.parent)
        with tarfile.open(tar_path) as tar:
            tar.extractall(path=stage_dir)
        tar_path.unlink()
        dataset['staged'] = True
        dataset['paths']['staged'] = str(stage_dir / ds_name)
