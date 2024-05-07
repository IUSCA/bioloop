import shutil
from pathlib import Path

from workers import api
from workers.dataset import get_bundle_staged_path


def mark_archived_and_delete(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)

    source = Path(dataset['origin_path']).resolve()
    bundle_path = Path(get_bundle_staged_path(dataset=dataset))

    sda_tar_path = f'archive/2023/raw_data/{dataset["name"]}.tar'
    update_data = {
        'archive_path': sda_tar_path
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    # delete tar file
    bundle_path.unlink(missing_ok=True)

    # delete source directory
    shutil.rmtree(source, ignore_errors=True)

    return dataset_id,
