#!/usr/bin/env python3
"""
Test Case 7: DATA_PRODUCT with prefix parameter

This test creates multiple datasets, runs register_ondemand with a prefix,
and verifies that all created datasets have the prefix at the beginning of their names.
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
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_07.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 7: DATA_PRODUCT with prefix parameter"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 7: DATA_PRODUCT with prefix parameter")
    logger.info("=" * 60)
    
    try:
        # Step 1: Generate test datasets (multiple datasets)
        logger.info("Step 1: Generating test datasets...")
        container_path = generate_datasets(
            dataset_type='DATA_PRODUCT',
            size_mb=2.0,  # Small size for faster testing
            single_dataset=False,  # Create multiple datasets
            container_name='test_case_07'
        )
        
        # Step 2: List contents before registration
        logger.info("Step 2: Contents before registration:")
        original_subdirs = []
        for item in container_path.iterdir():
            logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
            if item.is_dir():
                original_subdirs.append(item.name)
        
        # Step 3: Define prefix and expected dataset names
        test_prefix = "PREFIX123"
        expected_names = [f"{test_prefix}-{name}" for name in original_subdirs]
        logger.info(f"Using prefix: {test_prefix}")
        logger.info(f"Expected dataset names: {expected_names}")
        
        # Step 4: Run register_ondemand with prefix
        logger.info("Step 4: Running register_ondemand script with prefix...")
        cmd = [
            'python', '-m', 'workers.scripts.register_ondemand',
            '--dataset-type', 'DATA_PRODUCT',
            '--ingest-subdirs', 'true',
            '--prefix', test_prefix,
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
        
        for expected_name in expected_names:
            logger.info(f"Checking if dataset '{expected_name}' was created...")
            
            try:
                datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=expected_name)
                if datasets:
                    logger.info(f"✅ Dataset '{expected_name}' found in database")
                    dataset = datasets[0]
                    logger.info(f"   ID: {dataset.get('id')}")
                    logger.info(f"   Type: {dataset.get('type')}")
                    logger.info(f"   Origin Path: {dataset.get('origin_path')}")
                    
                    # Verify the name has the correct prefix
                    if dataset['name'].startswith(test_prefix):
                        logger.info(f"✅ Dataset '{dataset['name']}' correctly has prefix '{test_prefix}'")
                    else:
                        logger.error(f"❌ Dataset '{dataset['name']}' does NOT have expected prefix '{test_prefix}'")
                        
                else:
                    logger.error(f"❌ Dataset '{expected_name}' NOT found in database")
            except Exception as e:
                logger.error(f"❌ Error checking dataset '{expected_name}': {e}")
        
        # Step 7: Verify that original names (without prefix) are NOT in database
        logger.info("Step 7: Verifying that unprefixed names are NOT in database...")
        for original_name in original_subdirs:
            try:
                datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=original_name)
                if datasets:
                    logger.warning(f"⚠️ Unexpected: Dataset with original name '{original_name}' found in database")
                else:
                    logger.info(f"✅ Correct: No dataset with original name '{original_name}' found")
            except Exception as e:
                logger.error(f"❌ Error checking original name '{original_name}': {e}")
        
        # Test success criteria
        if result.returncode == 0:
            logger.info("✅ Test Case 7 PASSED: Command executed successfully")
        else:
            logger.error("❌ Test Case 7 FAILED: Command returned non-zero exit code")
        
    except Exception as e:
        logger.error(f"❌ Test Case 7 FAILED with exception: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 7 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
