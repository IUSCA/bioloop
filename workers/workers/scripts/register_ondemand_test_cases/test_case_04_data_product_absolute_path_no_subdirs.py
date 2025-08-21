#!/usr/bin/env python3
"""
Test Case 4: DATA_PRODUCT with absolute path and ingest_subdirs=False

This test creates datasets, then runs register_ondemand with 
an absolute path and ingest_subdirs=False (parent directory should be registered).
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

sys.path.append('/opt/sca/workers')
import workers.api as api
from generate_test_datasets import generate_datasets

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_04.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 4: DATA_PRODUCT with absolute path and ingest_subdirs=False"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 4: DATA_PRODUCT with absolute path and ingest_subdirs=False")
    logger.info("=" * 60)
    
    try:
        # Step 1: Generate test datasets (multiple datasets within container)
        logger.info("Step 1: Generating test datasets...")
        container_path = generate_datasets(
            dataset_type='DATA_PRODUCT',
            size_mb=2.0,  # Small size for faster testing
            single_dataset=False,  # Create multiple subdirectories
            container_name='test_case_04'
        )
        
        # Step 2: List contents before registration
        logger.info("Step 2: Contents before registration:")
        subdirs = []
        for item in container_path.iterdir():
            logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
            if item.is_dir():
                subdirs.append(item.name)
        
        # Expected dataset name should be the container directory name
        expected_dataset_name = container_path.name
        logger.info(f"Expected dataset name: {expected_dataset_name}")
        
        # Step 3: Run register_ondemand with absolute path
        logger.info("Step 3: Running register_ondemand script...")
        cmd = [
            'python', '-m', 'workers.scripts.register_ondemand',
            '--dataset-type', 'DATA_PRODUCT',
            '--ingest-subdirs', 'false',
            str(container_path)  # Absolute path
        ]
        
        logger.info(f"Executing command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/workers')
        
        # Step 4: Log results
        logger.info("Step 4: Command output:")
        logger.info("STDOUT:")
        logger.info(result.stdout)
        if result.stderr:
            logger.warning("STDERR:")
            logger.warning(result.stderr)
        
        logger.info(f"Return code: {result.returncode}")
        
        # Step 5: Verify results via API
        logger.info("Step 5: Verifying results via API...")
        
        # Check that the parent directory was registered
        logger.info(f"Checking if dataset '{expected_dataset_name}' was created...")
        try:
            datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=expected_dataset_name)
            if datasets:
                logger.info(f"✅ Dataset '{expected_dataset_name}' found in database")
                dataset = datasets[0]
                logger.info(f"   ID: {dataset.get('id')}")
                logger.info(f"   Type: {dataset.get('type')}")
                logger.info(f"   Origin Path: {dataset.get('origin_path')}")
            else:
                logger.error(f"❌ Dataset '{expected_dataset_name}' NOT found in database")
        except Exception as e:
            logger.error(f"❌ Error checking dataset '{expected_dataset_name}': {e}")
        
        # Verify that subdirectories were NOT registered as separate datasets
        for subdir_name in subdirs:
            logger.info(f"Checking that subdirectory '{subdir_name}' was NOT registered...")
            try:
                subdir_datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=subdir_name)
                if subdir_datasets:
                    logger.warning(f"⚠️ Unexpected: Subdirectory '{subdir_name}' was registered as a dataset")
                else:
                    logger.info(f"✅ Correct: Subdirectory '{subdir_name}' was NOT registered as a separate dataset")
            except Exception as e:
                logger.error(f"❌ Error checking subdirectory '{subdir_name}': {e}")
        
        # Test success criteria
        if result.returncode == 0:
            logger.info("✅ Test Case 4 PASSED: Command executed successfully")
        else:
            logger.error("❌ Test Case 4 FAILED: Command returned non-zero exit code")
        
    except Exception as e:
        logger.error(f"❌ Test Case 4 FAILED with exception: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 4 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
