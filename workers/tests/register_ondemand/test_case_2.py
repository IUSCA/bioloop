"""
Test Case 4: DATA_PRODUCT with absolute path and ingest_subdirs=False

This test creates datasets, then runs register_ondemand with 
an absolute path and ingest_subdirs=False (parent directory should be registered, 
subdirectories should not be registered as separate datasets).
"""

from pathlib import Path
import shutil
import subprocess
import os
import logging
from dotenv import load_dotenv

import workers.api as api

from tests.register_ondemand.setup.generate_test_datasets import create_dataset_directory, generate_datasets
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


def run_test():
    """Run test case 2: DATA_PRODUCT with absolute path and ingest_subdirs=False"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 2: DATA_PRODUCT with absolute path and ingest_subdirs=False")
    logger.info("=" * 60)
    
    
    # Generate test datasets (multiple datasets within container)
    logger.info("Generating test datasets...")
    # Generate a single dataset directory
    created_dataset_dir =create_dataset_directory(
        container=test_container_dir,
        type=test_dataset_type,
    )
    # Generate a few datasets as subdirectories inside the created dataset directory
    num_subdirs = 2
    for i in range(num_subdirs):
        create_dataset_directory(
            container=created_dataset_dir,
            type=test_dataset_type,
        )
    
    # List contents before registration
    logger.info(f"Contents before registration at path: {created_dataset_dir}")
    subdirs = []
    for item in created_dataset_dir.iterdir():
        logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        if item.is_dir():
            subdirs.append(item.name)
    
    # Expected dataset name should be the container directory name
    expected_dataset_name = created_dataset_dir.name
    logger.info(f"Expected dataset name: {expected_dataset_name}")
    
    # Run register_ondemand with absolute path
    logger.info("Running register_ondemand script...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', test_dataset_type,
        str(created_dataset_dir)  # Absolute path
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
    logger.info("Verifying results")
    
    # Check that the parent directory was registered
    logger.info(f"Checking if dataset '{expected_dataset_name}' was created...")
    
    datasets_matching_name = api.get_all_datasets(dataset_type=test_dataset_type, 
                                    name=expected_dataset_name,
                                    match_name_exact=True)
    if datasets_matching_name:
        logger.info(f"✅ Dataset '{expected_dataset_name}' found in database")
        created_dataset = datasets_matching_name[0]
        logger.info(f"   ID: {created_dataset.get('id')}")
        logger.info(f"   Type: {created_dataset.get('type')}")
        logger.info(f"   Origin Path: {created_dataset.get('origin_path')}")
    else:
        logger.error(f"❌ Dataset '{expected_dataset_name}' NOT found in database")
    
    # Verify that subdirectories were NOT registered as separate datasets
    for subdir_name in subdirs:
        logger.info(f"Checking that subdirectory '{subdir_name}' was NOT registered...")
        subdir_datasets = api.get_all_datasets(dataset_type=test_dataset_type, 
                                               name=subdir_name,
                                               match_name_exact=True)
        if subdir_datasets:
            logger.warning(f"⚠️ Unexpected: Subdirectory '{subdir_name}' was registered as a dataset")
        else:
            logger.info(f"✅ Correct: Subdirectory '{subdir_name}' was NOT registered as a separate dataset")
    
        
    logger.info("=" * 60)
    logger.info("ℹ️ Test Case 2 COMPLETED")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_test()
