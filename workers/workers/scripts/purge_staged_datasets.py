import logging
import shutil
from pathlib import Path

import workers.api as api
from workers.config import config
from workers.dataset import get_bundle_staged_path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# sanity check. If the API accidentally returns all datasets do not blindly delete them
MAX_PURGES = config['stage']['purge']['max_purges']


def main():
    retention_days = config['stage']['purge']['days_to_live']
    datasets = api.get_all_datasets(days_since_last_staged=retention_days, bundle=True)

    if len(datasets) > MAX_PURGES:
        logger.warning(
            f"Number of staged datasets to purge is more than {MAX_PURGES} MAX_PURGES. "
            f"Only the first {MAX_PURGES} staged datasets will be purged")

    for dataset in datasets[:MAX_PURGES]:
        try:
            staged_path = Path(dataset['staged_path'])
            bundle_path = Path(get_bundle_staged_path(dataset=dataset))

            if staged_path.exists():
                shutil.rmtree(staged_path)
            if bundle_path.exists():
                bundle_path.unlink()

            if api.expire_dataset_staging(dataset['id'], dataset['staged_path'], retention_days):
                logger.info(
                    f'Purged staged dataset id:{dataset["id"]} name:{dataset["name"]} staged_path:{staged_path}')

        except Exception as e:
            logger.error(f'Error purging staged dataset #{dataset["id"]} {dataset["name"]}', exc_info=e)


if __name__ == "__main__":
    main()
