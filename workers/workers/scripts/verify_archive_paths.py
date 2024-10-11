import logging
import shutil
from pathlib import Path
import os

import fire
import workers.api as api
import workers.workflow_utils as wf_utils
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def verify():
    archive_path_verification_dir = Path(config['paths'][dataset['type']]['archive_path_verification'])
    logger.info(f"Archive path verification dir: {archive_path_verification_dir}")
    archive_path_verification_dir.mkdir(exist_ok=True, parents=True)

    incorrect_path_dataset_ids = []
    correct_path_dataset_ids = []
    unprocessed_dataset_ids = []

    datasets = api.get_all_datasets(archived=True, bundle=True)

    for dataset in datasets:
        logger.info(f"Verifying dataset {dataset['id']}")
        
        bundle = dataset['bundle']
        if bundle is None:
            logger.info(f"No bundle for dataset {dataset['id']}. Will not process. Skipping...")
            unprocessed_dataset_ids.append(dataset['id'])
            continue
        
        archive_path = dataset['archive_path']
        
        working_dir = archive_path_verification_dir / dataset['name']
        if working_dir.exists():
            shutil.rmtree(working_dir)
        working_dir.mkdir(exist_ok=True, parents=True)

        logger.info(f"Working dir: {working_dir}")
        tar_file_download_path = working_dir / bundle['name']

        logger.info(f"Tar file download path: {tar_file_download_path}")


        wf_utils.download_file_from_sda(sda_file_path=archive_path,
                                        local_file_path=tar_file_download_path)

        extraction_path = working_dir / f"{dataset['name']}_extracted" / dataset['name']
        logger.info(f"Extraction path: {extraction_path}")

        wf_utils.extract_tarfile(tar_path=tar_file_download_path, target_dir=extraction_path, override_arcname=True)

        dataset_origin_path = config['registration'][dataset['type']]['source_dir']
        logger.info(f"Dataset origin path: {dataset_origin_path}")

        incorrect_nested_path = extraction_path / dataset_origin_path[1:] / dataset["name"]
        logger.info(f"Looking for incorrect nested path: {incorrect_nested_path}")
        
        has_incorrect_path = incorrect_nested_path.exists()
        logger.info(f"Has incorrect path: {has_incorrect_path}")

        if not has_incorrect_path:
            extracted_dirs = [x[0] for x in os.walk(extraction_path)]
            logger.info(f"Extracted dataset dirs: {extracted_dirs}")
        
        if has_incorrect_path:
            logger.info(f"Dataset {dataset['name']} has incorrect nested path {incorrect_nested_path}")
            incorrect_path_dataset_ids.append(dataset['id'])
        else:
            logger.info(f"Dataset {dataset['name']} has no incorrect nested path {incorrect_nested_path}")
            correct_path_dataset_ids.append(dataset['id'])

        shutil.rmtree(working_dir)
        logger.info(f"Removed working dir: {working_dir}")

    logger.info(f"Incorrect path dataset IDs: {incorrect_path_dataset_ids}")
    logger.info(f"Correct path dataset IDs: {correct_path_dataset_ids}")
    logger.info(f"Unprocessed dataset IDs: {unprocessed_dataset_ids}")

    shutil.rmtree(archive_path_verification_dir)
    logger.info(f"Removed archive path verification dir: {archive_path_verification_dir}")


if __name__ == "__main__":
    fire.Fire(verify)
