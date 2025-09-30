#!/usr/bin/env python3
"""
Test Case 8: DATA_PRODUCT with description parameter

This test creates multiple datasets, runs register_ondemand with a description,
and verifies that all created datasets have their description set to the provided string.
"""

import os
import shutil
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

import workers.api as api

from tests.register_ondemand.setup.generate_test_datasets import create_dataset_directory
from tests.register_ondemand.setup import logs_dir, data_dir


load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(
            f'{logs_dir}/{os.path.basename(__file__).replace(".py", ".log")}',
            mode='w'
        ),
        logging.StreamHandler()
    ],
)
logger = logging.getLogger(__name__)


test_container_dir = Path(data_dir) / os.path.basename(__file__).replace('.py', '')
if test_container_dir.exists():
    shutil.rmtree(test_container_dir)
test_container_dir.mkdir(parents=True, exist_ok=True)


test_dataset_type = 'DATA_PRODUCT'
test_description = "This is a test dataset created for register_ondemand testing purposes"


def run_test():
    """Run test case 8: DATA_PRODUCT with description parameter"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 8: DATA_PRODUCT with description parameter")
    logger.info("=" * 60)
    
    # Generate test datasets (multiple datasets)
    logger.info("Generating test datasets...")
    created_dataset_path = create_dataset_directory(
        container=test_container_dir,
        type=test_dataset_type,
    )
    # Generate a few datasets as subdirectories inside the created dataset directory
    num_subdirs = 2
    for i in range(num_subdirs):
        create_dataset_directory(
            container=created_dataset_path,
            type=test_dataset_type,
        )
    
    # List contents before registration
    logger.info(f"Contents before registration at path: {created_dataset_path}")
    subdirs_to_register = []
    for item in created_dataset_path.iterdir():
        logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        if item.is_dir():
            subdirs_to_register.append(item.name)
    
    # Define description
    test_description = "This is a test dataset created for register_ondemand testing purposes"
    logger.info(f"Using description: {test_description}")
    
    # Run register_ondemand with description
    logger.info("Running register_ondemand script with description...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', test_dataset_type,
        '--ingest-subdirs',
        '--description', test_description,
        str(created_dataset_path)
    ]
    
    logger.info(f"Executing command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/app')
    
    # Log results
    logger.info("Command output:")
    logger.info("STDOUT:")
    logger.info(result.stdout)
    if result.stderr:
        logger.warning("STDERR:")
        logger.warning(result.stderr)
    
    # Verify results
    logger.info("Verifying results...")
    
    for subdir_name in subdirs_to_register:
        logger.info(f"Checking if dataset '{subdir_name}' was created with correct description...")
        
        matching_datasets = api.get_all_datasets(dataset_type=test_dataset_type, name=subdir_name, match_name_exact=True)
        if matching_datasets:
            logger.info(f"✅ Dataset '{subdir_name}' found in database")
            created_dataset = matching_datasets[0]
            logger.info(f"   ID: {created_dataset.get('id')}")
            logger.info(f"   Type: {created_dataset.get('type')}")
            logger.info(f"   Origin Path: {created_dataset.get('origin_path')}")
            logger.info(f"   Description: {created_dataset.get('description')}")
            
            # Verify the description matches
            if created_dataset.get('description') == test_description:
                logger.info(f"✅ Dataset '{subdir_name}' has correct description")
            else:
                logger.error(f"❌ Dataset '{subdir_name}' description mismatch:")
                logger.error(f"   Expected: {test_description}")
                logger.error(f"   Actual: {created_dataset.get('description')}")
        else:
            logger.error(f"❌ Dataset '{subdir_name}' NOT found in database")
    
    logger.info("=" * 60)
    logger.info("Test Case 8 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_test()
