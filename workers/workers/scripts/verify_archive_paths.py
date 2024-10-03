import logging
import shutil
from pathlib import Path

import fire
import workers.api as api
import workers.workflow_utils as wf_utils
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def verify():
    incorrect_path_dataset_ids = []

    datasets = api.get_all_datasets(archived=True, bundle=True)

    for dataset in datasets:
        bundle = dataset['bundle']
        archive_path = dataset['archive_path']

        archive_path_verification_dir = Path(config['paths'][dataset['type']]['archive_path_verification'])
        archive_path_verification_dir.mkdir(exist_ok=True)

        working_dir = archive_path_verification_dir / dataset['name']
        if working_dir.exists():
            shutil.rmtree(working_dir)

        wf_utils.download_file_from_sda(sda_file_path=archive_path,
                                        local_file_path=working_dir)
        tar_file_path = working_dir / bundle['name']

        if tar_file_path.exists():
            shutil.rmtree(tar_file_path)

        extraction_path = working_dir / 'dummy_path'
        wf_utils.extract_tarfile(tar_path=tar_file_path, target_dir=extraction_path)

        logger.info(f"Dataset {dataset['id']} extraction path: {extraction_path}")

        incorrect_nested_path = extraction_path / config['registration'][dataset['type']]['source_dir'][                                                               1:] / dataset["name"]
        has_incorrect_path = incorrect_nested_path.exists()

        if has_incorrect_path:
            logger.info(f"Dataset {dataset['name']} has incorrect nested path: {incorrect_nested_path}")
            incorrect_path_dataset_ids.append(dataset['id'])

        logger.info(f"Incorrect path dataset IDs: {incorrect_path_dataset_ids}")



if __name__ == "__main__":
    fire.Fire(verify)
