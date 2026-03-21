#!/usr/bin/env python3
"""
Test Case 5: DATA_PRODUCT with prefix parameter

This test creates multiple datasets, runs register_ondemand with a prefix,
and verifies that all created datasets have the prefix at the beginning of their names.
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
test_prefix = "PREFIX"
    

def run_test():
    """Run test case 5: DATA_PRODUCT with prefix parameter"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 5: DATA_PRODUCT with prefix parameter")
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
    
    # Expected dataset names
    expected_registered_names = [f"{test_prefix}-{name}" for name in subdirs_to_register]
    logger.info(f"Expected names of datasets to be created: {expected_registered_names}")
    
    # Run register_ondemand with prefix
    logger.info("Running register_ondemand script with prefix...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', test_dataset_type,
        '--ingest-subdirs',
        '--prefix', test_prefix,
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
    
    for expected_name in expected_registered_names:
        logger.info(f"Checking if dataset '{expected_name}' was created...")        
        datasets_matching_name = api.get_all_datasets(dataset_type=test_dataset_type, name=expected_name, match_name_exact=True)
        if datasets_matching_name:
            created_dataset = datasets_matching_name[0]
            logger.info(f"✅ Dataset '{expected_name}' found in database")
            logger.info(f"   ID: {created_dataset.get('id')}")
            logger.info(f"   Type: {created_dataset.get('type')}")
            logger.info(f"   Origin Path: {created_dataset.get('origin_path')}")
            # Verify the name has the correct prefix
            if created_dataset['name'].startswith(test_prefix):
                logger.info(f"✅ Dataset '{created_dataset['name']}' correctly has prefix '{test_prefix}'")
            else:
                logger.error(f"❌ Dataset '{created_dataset['name']}' does NOT have expected prefix '{test_prefix}'")    
        else:
            logger.error(f"❌ Dataset '{expected_name}' NOT found in database")
    
    # Verify that original names (without prefix) are NOT in database
    logger.info("Verifying that unprefixed names are NOT in database...")
    for original_name in subdirs_to_register:
        logger.info(f"Checking that dataset named '{original_name}' (without prefix) was NOT created...")
        datasets_matching_name = api.get_all_datasets(dataset_type=test_dataset_type, name=original_name, match_name_exact=True)
        if datasets_matching_name:
            logger.warning(f"⚠️ Unexpected: Dataset named '{original_name}' (without prefix) found in database")
        else:
            logger.info(f"✅ Correct: No dataset named '{original_name}' (without prefix) found")
    
    logger.info("=" * 60)
    logger.info("Test Case 5 completed")
    logger.info("=" * 60)


if __name__ == "__main__":    
    run_test()
