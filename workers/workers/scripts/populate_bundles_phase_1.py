import logging
from pathlib import Path
from sca_rhythm import Workflow

from workers.celery_app import app as celery_app
import workers.sda as sda
import workers.api as api
import workers.cmd as cmd
import workers.workflow_utils as wf_utils
import workers.utils as utils
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def populate_bundle_metadata(dataset: dict) -> bool:
    logger.info(f'processing dataset {dataset["id"]}')

    bundle_md5 = sda.get_hash(dataset['archive_path'])

    bundle_metadata = {
        'name': f'{dataset["name"]}.tar',
        'path': f'{config["paths"][dataset["type"]]["bundle"]}/{dataset["name"]}.tar',
        'size': dataset['bundle_size'],
        'md5': bundle_md5,
    }

    update_data = {
        'bundle': bundle_metadata
    }
    api.update_dataset(dataset_id=dataset['id'], update_data=update_data)

    logger.info(f'successfully finished processing dataset {dataset["id"]}')
    return True


def main():
    archived_datasets = api.get_all_datasets(archived=True, bundle=True)

    unprocessed_datasets = []
    for dataset in archived_datasets:
        bundle_metadata_populated = False

        if dataset['bundle'] is None:
            try:
                bundle_metadata_populated = populate_bundle_metadata(dataset)
                logger.info(f'bundle_metadata_populated for {dataset["id"]}: {bundle_metadata_populated}')
            except Exception as err:
                logger.info(f'failed to download or validate dataset {dataset["id"]}')
                logger.info(err)

            if bundle_metadata_populated:
                run_workflows(dataset)
            else:
                unprocessed_datasets.append(dataset['id'])

    logger.info(f'unprocessed datasets: {unprocessed_datasets}')


def run_workflows(dataset):
    dataset_id = dataset['id']
    wf_body = wf_utils.get_wf_body(wf_name='sync_archived_bundles')
    wf = Workflow(celery_app=celery_app, **wf_body)
    api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
    wf.start(dataset_id)
    logger.info(f'started sync_archived_bundles for {dataset["id"]}, workflow_id: {wf.workflow["_id"]}')


if __name__ == '__main__':
    main()
