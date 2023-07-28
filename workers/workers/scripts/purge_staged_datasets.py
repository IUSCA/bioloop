import logging
import shutil
from pathlib import Path

import workers.api as api
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# sanity check. If the API accidentally returns all datasets do not blindly delete them
MAX_PURGES = config['stage']['purge']['max_purges']


def main():
    datasets = api.get_all_datasets(days_since_last_staged=config['stage']['purge']['days_to_live'])

    if len(datasets) > MAX_PURGES:
        logger.warning(
            f"Number of staged datasets to purge is more than {MAX_PURGES} MAX_PURGES. "
            f"Only the first {MAX_PURGES} staged datasets will be purged")

    update_data = {
        'is_staged': False
    }
    for dataset in datasets[:MAX_PURGES]:
        try:
            dataset_type = dataset['type']
            staging_dir = Path(config['paths'][dataset_type]['stage'])
            staged_dataset_path = staging_dir / dataset['name']  # path to the staged dataset
            shutil.rmtree(staged_dataset_path)

            api.update_dataset(dataset_id=dataset['id'], update_data=update_data)
            api.add_state_to_dataset(dataset_id=dataset['id'], state='PURGED')

            logger.info(f'Purged staged dataset #{dataset["id"]} {dataset["name"]} @ {staged_dataset_path}')

        except Exception as e:
            logger.error(f'Error purging staged dataset #{dataset["id"]} {dataset["name"]}', exc_info=e)


if __name__ == "__main__":
    main()
