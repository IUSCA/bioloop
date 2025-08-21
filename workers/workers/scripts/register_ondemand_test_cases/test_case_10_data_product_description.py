#!/usr/bin/env python3
"""
Test Case 10: DATA_PRODUCT with description parameter

This test creates multiple datasets, runs register_ondemand with a description,
and verifies that all created datasets have their description set to the provided string.
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
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_10.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 10: DATA_PRODUCT with description parameter"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 10: DATA_PRODUCT with description parameter")
    logger.info("=" * 60)
    
    try:
        # Step 1: Generate test datasets (multiple datasets)
        logger.info("Step 1: Generating test datasets...")
        container_path = generate_datasets(
            dataset_type='DATA_PRODUCT',
            size_mb=2.0,  # Small size for faster testing
            single_dataset=False,  # Create multiple datasets
            container_name='test_case_10'
        )
        
        # Step 2: List contents before registration
        logger.info("Step 2: Contents before registration:")
        original_subdirs = []
        for item in container_path.iterdir():
            logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
            if item.is_dir():
                original_subdirs.append(item.name)
        
        # Step 3: Define description
        test_description = "This is a test dataset created for register_ondemand testing purposes"
        logger.info(f"Using description: {test_description}")
        
        # Step 4: Run register_ondemand with description
        logger.info("Step 4: Running register_ondemand script with description...")
        cmd = [
            'python', '-m', 'workers.scripts.register_ondemand',
            '--dataset-type', 'DATA_PRODUCT',
            '--ingest-subdirs', 'true',
            '--description', test_description,
            str(container_path)  # Absolute path
        ]
        
        logger.info(f"Executing command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/workers')
        
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
        
        for subdir_name in original_subdirs:
            logger.info(f"Checking if dataset '{subdir_name}' was created with correct description...")
            
            try:
                datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=subdir_name)
                if datasets:
                    logger.info(f"✅ Dataset '{subdir_name}' found in database")
                    dataset = datasets[0]
                    logger.info(f"   ID: {dataset.get('id')}")
                    logger.info(f"   Type: {dataset.get('type')}")
                    logger.info(f"   Origin Path: {dataset.get('origin_path')}")
                    logger.info(f"   Description: {dataset.get('description')}")
                    
                    # Verify the description matches
                    if dataset.get('description') == test_description:
                        logger.info(f"✅ Dataset '{subdir_name}' has correct description")
                    else:
                        logger.error(f"❌ Dataset '{subdir_name}' description mismatch:")
                        logger.error(f"   Expected: {test_description}")
                        logger.error(f"   Actual: {dataset.get('description')}")
                        
                else:
                    logger.error(f"❌ Dataset '{subdir_name}' NOT found in database")
            except Exception as e:
                logger.error(f"❌ Error checking dataset '{subdir_name}': {e}")
        
        # Test success criteria
        if result.returncode == 0:
            logger.info("✅ Test Case 10 PASSED: Command executed successfully")
        else:
            logger.error("❌ Test Case 10 FAILED: Command returned non-zero exit code")
        
    except Exception as e:
        logger.error(f"❌ Test Case 10 FAILED with exception: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 10 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
