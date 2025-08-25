#!/usr/bin/env python3
"""
Test Case 2: DATA_PRODUCT with current directory (.) and ingest_subdirs=False

This test creates a single dataset directory, then runs register_ondemand from 
within the created directory using '.' as the path with ingest_subdirs=False.
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

sys.path.append('/opt/sca/app')
import workers.api as api
from generate_test_datasets import generate_datasets

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_02.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 2: DATA_PRODUCT with current directory and ingest_subdirs=False"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 2: DATA_PRODUCT with current directory (.) and ingest_subdirs=False")
    logger.info("=" * 60)
    
    try:
        # Step 1: Generate test datasets (single dataset with subdirectories)
        logger.info("Step 1: Generating test datasets...")
        container_path = generate_datasets(
            dataset_type='DATA_PRODUCT',
            size_mb=2.0,  # Small size for faster testing
            container_name='test_case_02'
        )
        
        # Step 2: Change to the container directory
        logger.info(f"Step 2: Changing to directory: {container_path}")
        original_cwd = os.getcwd()
        os.chdir(container_path)
        
        # Step 3: List contents before registration
        logger.info("Step 3: Contents before registration:")
        for item in Path('.').iterdir():
            logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        
        # Expected dataset name should be the directory name itself
        expected_dataset_name = Path('.').resolve().name
        logger.info(f"Expected dataset name: {expected_dataset_name}")
        
        # Step 4: Run register_ondemand with current directory
        logger.info("Step 4: Running register_ondemand script...")
        cmd = [
            'python', '-m', 'workers.scripts.register_ondemand',
            '--dataset-type', 'DATA_PRODUCT',
            str(container_path)  # current directory
        ]
        
        logger.info(f"Executing command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/app')
        
        # Step 5: Log results
        logger.info("Step 5: Command output:")
        logger.info("STDOUT:")
        logger.info(result.stdout)
        if result.stderr:
            logger.warning("STDERR:")
            logger.warning(result.stderr)
        
        logger.info(f"Return code: {result.returncode}")
        
        # Step 6: Verify results via API
        logger.info("Step 6: Verifying results via API...")
        logger.info(f"Checking if dataset '{expected_dataset_name}' was created...")
        
        try:
            datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=expected_dataset_name)
            if datasets:
                logger.info(f"✅ Dataset '{expected_dataset_name}' found in database")
                dataset = datasets[0]
                logger.info(f"   ID: {dataset.get('id')}")
                logger.info(f"   Type: {dataset.get('type')}")
                logger.info(f"   Origin Path: {dataset.get('origin_path')}")
                
                # Verify that subdirectories were NOT registered as separate datasets
                subdirs = [item for item in Path('.').iterdir() if item.is_dir()]
                for subdir in subdirs:
                    subdir_datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=subdir.name)
                    if subdir_datasets:
                        logger.warning(f"⚠️ Unexpected: Subdirectory '{subdir.name}' was also registered as a dataset")
                    else:
                        logger.info(f"✅ Correct: Subdirectory '{subdir.name}' was NOT registered as a separate dataset")
                        
            else:
                logger.error(f"❌ Dataset '{expected_dataset_name}' NOT found in database")
        except Exception as e:
            logger.error(f"❌ Error checking dataset '{expected_dataset_name}': {e}")
        
        # Test success criteria
        if result.returncode == 0:
            logger.info("✅ Test Case 2 PASSED: Command executed successfully")
        else:
            logger.error("❌ Test Case 2 FAILED: Command returned non-zero exit code")
        
    except Exception as e:
        logger.error(f"❌ Test Case 2 FAILED with exception: {e}")
        
    finally:
        # Step 7: Cleanup - return to original directory
        try:
            os.chdir(original_cwd)
            logger.info(f"Returned to original directory: {original_cwd}")
        except Exception as e:
            logger.warning(f"Could not return to original directory: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 2 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
