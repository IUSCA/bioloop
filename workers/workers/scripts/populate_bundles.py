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


def download_and_validate(dataset: dict) -> bool:
    logger.info(f'processing dataset {dataset["id"]}')

    bundle_download_path = Path(f'{config["paths"][dataset["type"]]["bundle"]}/{dataset["name"]}.tar')
    # delete pre-existing bundles to force reevaluation of bundle metadata in the archive step
    if bundle_download_path.exists():
        logger.info(f'deleting pre-existing bundle {bundle_download_path}')
        bundle_download_path.unlink()

    sda_archive_path = dataset['archive_path']
    try:
        wf_utils.download_file_from_sda(sda_file_path=sda_archive_path,
                                        local_file_path=bundle_download_path,
                                        celery_task=None)
    except Exception as err:
        logger.info(f'Encountered exception while downloading dataset {dataset["id"]}:')
        logger.info(err)
        return False

    logger.info(f'downloaded dataset {dataset["id"]}')

    sda_archive_checksum = None
    try:
        sda_archive_checksum = sda.get_hash(dataset['archive_path'])
        logger.info(f'sda_archive_checksum: {sda_archive_checksum}')
    except cmd.SubprocessError as err:
        logger.info(f'Encountered exception while retrieving SDA checksum of dataset {dataset["id"]}:')
        logger.info(err)
        return False

    calculated_checksum = utils.checksum(Path(bundle_download_path))
    logger.info(f'calculated_checksum: {calculated_checksum}')
    if sda_archive_checksum != calculated_checksum:
        logger.info('SDA checksum mismatch for dataset %s', dataset['id'])
        return False

    logger.info(f'successfully finished processing dataset {dataset["id"]}')
    return True


def main():
    archived_datasets = api.get_all_datasets(archived=True)

    unprocessed = []
    for dataset in archived_datasets:
        download_validated = False

        try:
            download_validated = download_and_validate(dataset)
            logger.info(f'download_validated for {dataset["id"]}: {download_validated}')
        except Exception as err:
            logger.info(f'failed to download or validate dataset {dataset["id"]}')
            logger.info(err)

        if download_validated:
            run_workflows(dataset)
        else:
            unprocessed.append(dataset['id'])

    logger.info(f'unprocessed datasets: {unprocessed}')


def run_workflows(dataset):
    dataset_id = dataset['id']
    wf_body = wf_utils.get_wf_body(wf_name='sync_archived_bundles')
    wf = Workflow(celery_app=celery_app, **wf_body)
    api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
    wf.start(dataset_id)
    logger.info(f'started sync_archived_bundles for {dataset["id"]}, workflow_id: {wf.workflow["_id"]}')


if __name__ == '__main__':
    main()
