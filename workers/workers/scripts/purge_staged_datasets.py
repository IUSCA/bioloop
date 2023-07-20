import logging
import shutil
from pathlib import Path

import workers.api as api
from workers.config import config

logger = logging.getLogger(__name__)


def main():
    datasets = api.get_all_datasets(days_since_last_staged=config['stage']['purge']['days_to_live'])

    update_data = {
        'is_staged': False
    }
    for dataset in datasets:
        try:
            dataset_type = dataset['type']
            staging_dir = Path(config['paths'][dataset_type]['stage'])
            staged_dataset_path = staging_dir / dataset['name']  # path to the staged dataset
            shutil.rmtree(staged_dataset_path)

            api.update_dataset(dataset_id=dataset['id'], update_data=update_data)
            api.add_state_to_dataset(dataset_id=dataset['id'], state='PURGED')

            logger.info(f'Purged dataset #{dataset["id"]} {dataset["name"]} @ {staged_dataset_path}')

        except Exception as e:
            logger.error(f'Error purging dataset #{dataset["id"]} {dataset["name"]}', exc_info=e)


if __name__ == "__main__":
    main()
