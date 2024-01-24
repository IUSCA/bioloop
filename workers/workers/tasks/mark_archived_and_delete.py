import shutil
from pathlib import Path

from workers import api


def mark_archived_and_delete(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    source = Path(dataset['origin_path']).resolve()
    source_tar = source.parent / f'{dataset["name"]}.tar'

    sda_tar_path = f'archive/2023/raw_data/{dataset["name"]}.tar'
    bundle_size = source_tar.stat().st_size
    update_data = {
        'archive_path': sda_tar_path,
        'bundle_size': bundle_size
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    # delete tar file
    source_tar.unlink(missing_ok=True)

    # delete source directory
    shutil.rmtree(source, ignore_errors=True)

    return dataset_id,
