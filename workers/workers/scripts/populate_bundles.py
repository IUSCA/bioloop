import logging

import fire

import workers.api as api
import workers.sda as sda
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BundleSyncManager:
    WORKFLOW_COLLECTION_NAME = 'workflow_meta'
    TASK_COLLECTION_NAME = 'celery_taskmeta'

    def __init__(self, dry_run, app_id):
        self.dry_run = dry_run
        self.app_id = app_id

    def populate_bundles(self):
        archived_datasets = api.get_all_datasets(archived=True,
                                                 bundle=True)

        logger.info(f'Found {len(archived_datasets)} archived datasets to process')

        processed_datasets = []
        unprocessed_datasets = []

        for dataset in archived_datasets:
            logger.info(f'Processing dataset {dataset["id"]}')

            bundle_metadata_populated = dataset['bundle'] is not None
            logger.info(f'Bundle metadata is populated? : {bundle_metadata_populated}')

            if not bundle_metadata_populated:
                # Populate Dataset's bundle metadata
                try:
                    bundle_metadata_populated = self.populate_bundle_metadata(dataset)
                    logger.info(f'Bundle metadata populated for {dataset["id"]}?: {bundle_metadata_populated}')
                except Exception as err:
                    logger.info(f'Failed to populate bundle metadata for dataset {dataset["id"]}')
                    logger.info(err)

            if not bundle_metadata_populated:
                unprocessed_datasets.append(dataset)
            else:
                processed_datasets.append(dataset)

        unprocessed_datasets_ids = [dataset['id'] for dataset in unprocessed_datasets]
        logger.info(f'unprocessed datasets: {unprocessed_datasets_ids}')
        processed_datasets_ids = [dataset['id'] for dataset in processed_datasets]
        logger.info(f'processed datasets: {processed_datasets_ids}')

    def populate_bundle_metadata(self, dataset: dict) -> bool:
        logger.info(f'populating dataset {dataset["id"]}')

        bundle_md5 = sda.get_hash(dataset['archive_path'])
        bundle_metadata = {
            'name': f'{dataset["name"]}.tar',
            'size': dataset['du_size'],
            'md5': bundle_md5,
        }
        if not self.dry_run:
            api.update_dataset(dataset_id=dataset['id'],
                               update_data=
                               {
                                   'is_staged': False,
                                   'bundle': bundle_metadata
                               })
            logger.info(f'successfully finished populating bundle metadata for dataset {dataset["id"]}')
            logger.info(f"unstaged dataset {dataset['id']}")
        else:
            logger.info(f"dry run: would have populated bundle metadata for dataset {dataset['id']}")
            logger.info(f"dry run: would have unstaged dataset {dataset['id']}")
        return True


def initiate_bundle_sync(app_id=config['app_id'], dry_run=False):
    """
    For the given app_id, creates the bundle metadata for previously-archived datasets, and
    launches a workflow which sets up the bundles for download. Any existing instances of
    the `prepare_bundle_downloads` workflow that are pending will be deleted.

    :param app_id:  app_id to prepare bundle downloads for
    :param dry_run: if True, do not delete pending workflows
    :return:

    example usage:

    python -m workers.scripts.sync_bundles_phase1 --app_id='bioloop-dev.sca.iu.edu' --dry_run
    """

    BundleSyncManager(dry_run=dry_run, app_id=app_id).populate_bundles()


if __name__ == '__main__':
    fire.Fire(initiate_bundle_sync)
