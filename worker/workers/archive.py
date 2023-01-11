from pathlib import Path
import tarfile

import config
import sda


def make_tarfile(dataset):
    ds_name = dataset["name"]
    tar_path = Path(f'{config["paths"]["scratch"]}/{ds_name}.tar')
    if tar_path.exists():
        tar_path.unlink()
    parent = Path(dataset['paths']['origin']).resolve().parent
    with tarfile.open(tar_path, 'w') as tar:
        tar.add(str(parent / ds_name), arcname=ds_name, recursive=True)
    return tar_path


# TODO: dataset -> batch
def archive(dataset):
    scratch_tar_path = make_tarfile(dataset)
    sda_tar_path = f'{config["paths"][""]}/{dataset["name"]}.tar'  # TODO: year in archive dir name
    dataset['paths']['archive'] = sda_tar_path
    sda.put(scratch_tar_path, sda_tar_path)
    scratch_tar_path.unlink()


def tar_progress(tar_path, total_size):
    size = Path(tar_path).stat().st_size
    progress = size * 1.0 / total_size
    return {
        'progress': progress,
        'done': size,
        'total': total_size,
        'units': 'bytes',
    }


def hsi_put_progress(sda_path, total_size):
    size = sda.get_size(sda_path)
    progress = size * 1.0 / total_size
    return {
        'progress': progress,
        'done': size,
        'total': total_size,
        'units': 'bytes'
    }
