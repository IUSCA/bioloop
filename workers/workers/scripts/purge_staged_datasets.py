import logging
import shutil
from pathlib import Path

import workers.utils as utils
import workers.api as api
from workers.config import config
from workers.dataset import get_bundle_staged_path, is_dataset_locked_for_writes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# sanity check. If the API accidentally returns all datasets do not blindly delete them
MAX_PURGES = config['stage']['purge']['max_purges']


def main():
    datasets = api.get_all_datasets(days_since_last_staged=config['stage']['purge']['days_to_live'], bundle=True)

    if len(datasets) > MAX_PURGES:
        logger.warning(
            f"Number of staged datasets to purge is more than {MAX_PURGES} MAX_PURGES. "
            f"Only the first {MAX_PURGES} staged datasets will be purged")

    update_data = {
        'is_staged': False,
        'staged_path': None
    }
    for dataset in datasets[:MAX_PURGES]:
        locked, latest_state = is_dataset_locked_for_writes(dataset)
        if locked:
            logger.warning(f"Dataset {dataset['id']} is locked for writes. Dataset will not be purged.'")
            continue

        try:
            staged_path = Path(dataset['staged_path'])
            bundle_path = Path(get_bundle_staged_path(dataset=dataset))

            if staged_path.exists():
                shutil.rmtree(staged_path)
            if bundle_path.exists():
                bundle_path.unlink()

            api.update_dataset(dataset_id=dataset['id'], update_data=update_data)
            api.add_state_to_dataset(dataset_id=dataset['id'], state='PURGED')

            logger.info(
                f'Purged staged dataset id:{dataset["id"]} name:{dataset["name"]} staged_path:{staged_path}')

        except Exception as e:
            logger.error(f'Error purging staged dataset #{dataset["id"]} {dataset["name"]}', exc_info=e)


if __name__ == "__main__":
    main()
