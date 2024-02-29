import logging
from pathlib import Path

import workers.api as api
import workers.cmd as cmd
import workers.workflow_utils as wf_utils
import workers.utils as utils
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    archived_datasets = api.get_all_datasets(archived=True)
    failed_checksum_validation = []
    failed_checksum_retrieval = []
    failed_download = []

    for dataset in archived_datasets:
        logger.info(f'processing dataset {dataset["id"]}')

        bundle_download_path = Path(f'{config["paths"][dataset["type"]]["bundle"]}/{dataset["name"]}.tar')
        logger.info(f'bundle_download_path: {bundle_download_path}')
        # delete pre-existing bundles to force reevaluation of bundle metadata
        if bundle_download_path.exists():
            bundle_download_path.unlink()

        sda_archive_path = dataset['archive_path']
        try:
            wf_utils.download_file_from_sda(sda_file_path=sda_archive_path,
                                            local_file_path=str(bundle_download_path),
                                            celery_task=None)
        except Exception as err:
            logger.info(f'Encountered exception while downloading dataset {dataset["id"]}:')
            logger.info(err)
            failed_download.append(dataset['id'])
            continue

        sda_archive_checksum = None
        try:
            sda_archive_checksum = wf_utils.get_hash(dataset['archive_path'])
        except cmd.SubprocessError as err:
            # failed_checksum_retrieval.append(dataset['id'])
            logger.info(f'Encountered exception while getting SDA checksum of dataset {dataset["id"]}:')
            logger.info(err)

        if sda_archive_checksum is None:
            failed_checksum_retrieval.append(dataset['id'])
        elif sda_archive_checksum != utils.checksum(Path(bundle_download_path)):
            failed_checksum_validation.append(dataset['id'])

    logger.info('The following datasets failed download:')
    logger.info(failed_download)
    logger.info('The following datasets failed checksum retrieval:')
    logger.info(failed_checksum_retrieval)
    logger.info('The following datasets failed checksum validation:')
    logger.info(failed_checksum_validation)


if __name__ == '__main__':
    main()
