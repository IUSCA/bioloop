#!/usr/bin/env python3
"""
Test Case 3: DATA_PRODUCT with absolute path and ingest_subdirs=True

This test creates multiple datasets, then runs register_ondemand with 
an absolute path and ingest_subdirs=True.
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
from workers.scripts.register_ondemand_test_cases.generate_test_datasets import generate_datasets

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_03.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 3: DATA_PRODUCT with absolute path and ingest_subdirs=True"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 3: DATA_PRODUCT with absolute path and ingest_subdirs=True")
    logger.info("=" * 60)
    
    try:
        # Step 1: Generate test datasets (multiple datasets)
        logger.info("Step 1: Generating test datasets...")
        container_path = generate_datasets(
            dataset_type='DATA_PRODUCT',
            size_mb=2.0,  # Small size for faster testing
            container_name='test_case_03'
        )
        
        # Step 2: List contents before registration
        logger.info("Step 2: Contents before registration:")
        subdirs = []
        for item in container_path.iterdir():
            logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
            if item.is_dir():
                subdirs.append(item.name)
        
        # Step 3: Run register_ondemand with absolute path
        logger.info("Step 3: Running register_ondemand script...")
        cmd = [
            'python', '-m', 'workers.scripts.register_ondemand',
            '--dataset-type', 'DATA_PRODUCT',
            '--ingest-subdirs',
            str(container_path)
        ]
        
        logger.info(f"Executing command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/app')
        
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
        
        for subdir_name in subdirs:
            logger.info(f"Checking if dataset '{subdir_name}' was created...")
            
            try:
                datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=subdir_name)
                if datasets:
                    logger.info(f"✅ Dataset '{subdir_name}' found in database")
                    dataset = datasets[0]
                    logger.info(f"   ID: {dataset.get('id')}")
                    logger.info(f"   Type: {dataset.get('type')}")
                    logger.info(f"   Origin Path: {dataset.get('origin_path')}")
                else:
                    logger.error(f"❌ Dataset '{subdir_name}' NOT found in database")
            except Exception as e:
                logger.error(f"❌ Error checking dataset '{subdir_name}': {e}")
        
        # Verify that the parent directory was NOT registered as a dataset
        parent_name = container_path.name
        logger.info(f"Checking that parent directory '{parent_name}' was NOT registered...")
        try:
            parent_datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=parent_name)
            if parent_datasets:
                logger.warning(f"⚠️ Unexpected: Parent directory '{parent_name}' was registered as a dataset")
            else:
                logger.info(f"✅ Correct: Parent directory '{parent_name}' was NOT registered as a dataset")
        except Exception as e:
            logger.error(f"❌ Error checking parent directory '{parent_name}': {e}")
        
        # Test success criteria
        if result.returncode == 0:
            logger.info("✅ Test Case 3 PASSED: Command executed successfully")
        else:
            logger.error("❌ Test Case 3 FAILED: Command returned non-zero exit code")
        
    except Exception as e:
        logger.error(f"❌ Test Case 3 FAILED with exception: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 3 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
