#!/usr/bin/env python3
"""
Test Case 6: DATA_PRODUCT with suffix parameter

This test creates a single dataset directory, runs register_ondemand with a suffix,
and verifies that the created dataset has the suffix at the end of its name.
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
test_suffix = "SUFFIX"


def run_test():
    """Run test case 6: DATA_PRODUCT with suffix parameter"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 6: DATA_PRODUCT with suffix parameter")
    logger.info("=" * 60)
    
    # Generate test dataset directory
    logger.info("Generating test dataset directory...")
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
    
    subdirs_to_register = [created_dataset_path.name]

    # List contents before registration
    logger.info(f"Contents before registration at path: {created_dataset_path}")
    for item in created_dataset_path.iterdir():
        logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        # if item.is_dir():
        #     subdirs_to_register.append(item.name)
    
    # Define suffix and expected dataset names
    expected_registered_names = [f"{name}-{test_suffix}" for name in subdirs_to_register]
    logger.info(f"Using suffix: {test_suffix}")
    logger.info(f"Expected dataset names: {expected_registered_names}")
    
    # Run register_ondemand with suffix
    logger.info("Running register_ondemand script with suffix...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', test_dataset_type,
        '--suffix', test_suffix,
        str(created_dataset_path)  # Absolute path
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
    
    for expected_name in expected_registered_names:
        logger.info(f"Checking if dataset '{expected_name}' was created...")
        
        datasets = api.get_all_datasets(dataset_type=test_dataset_type, name=expected_name, match_name_exact=True)
        if datasets:
            logger.info(f"✅ Dataset '{expected_name}' found in database")
            dataset = datasets[0]
            logger.info(f"   ID: {dataset.get('id')}")
            logger.info(f"   Type: {dataset.get('type')}")
            logger.info(f"   Origin Path: {dataset.get('origin_path')}")
            
            # Verify the name has the correct suffix
            if dataset['name'].endswith(test_suffix):
                logger.info(f"✅ Dataset '{dataset['name']}' correctly has suffix '{test_suffix}'")
            else:
                logger.error(f"❌ Dataset '{dataset['name']}' does NOT have expected suffix '{test_suffix}'")   
        else:
            logger.error(f"❌ Dataset '{expected_name}' NOT found in database")
        
    # Verify that original names (without suffix) are NOT in database
    logger.info("Verifying that un-suffixed names are NOT in database...")
    for original_name in subdirs_to_register:
        datasets = api.get_all_datasets(dataset_type=test_dataset_type, name=original_name, match_name_exact=True)
        if datasets:
            logger.warning(f"⚠️ Unexpected: Dataset with original name '{original_name}' found in database")
        else:
            logger.info(f"✅ Correct: No dataset with original name '{original_name}' found")

    logger.info("=" * 60)
    logger.info("Test Case 6 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_test()
