import shutil
from pathlib import Path

from workers import api
import workers.utils as utils


def mark_archived_and_delete(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)

    locked, latest_state = utils.is_dataset_locked_for_writes(dataset)
    if locked:
        raise Exception(f"Dataset {dataset['id']} is locked for writes. Dataset's current "
                        f"state is {latest_state}.")


    source = Path(dataset['origin_path']).resolve()
    bundle = Path(dataset['bundle']['path'])

    sda_tar_path = f'archive/2023/raw_data/{dataset["name"]}.tar'
    update_data = {
        'archive_path': sda_tar_path
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    # delete tar file
    bundle.unlink(missing_ok=True)

    # delete source directory
    shutil.rmtree(source, ignore_errors=True)

    return dataset_id,
