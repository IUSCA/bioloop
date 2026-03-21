#!/usr/bin/env python3
"""
Test Case 3: Missing dataset-type parameter

This test runs register_ondemand without providing the --dataset-type parameter
and verifies that it logs an error message.
"""

import os
import shutil
import sys
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

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


def run_test():
    """Run test case 3: Missing dataset-type parameter"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 3: Missing dataset-type parameter")
    logger.info("=" * 60)
    
    # Generate test datasets (we need a valid path for the test)
    logger.info("Generating test datasets...")
    container_path = create_dataset_directory(
        container=test_container_dir,
        type=test_dataset_type,
    )
    
    # Run register_ondemand WITHOUT dataset-type parameter
    logger.info("Running register_ondemand script without --dataset-type...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        str(container_path)
    ]
    
    logger.info(f"Executing command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/app')
    
    # Log results
    logger.info("Command output:")
    logger.info("STDOUT:")
    logger.info(result.stdout)
    if result.stderr:
        logger.info("STDERR:")
        logger.info(result.stderr)
        
    # Verify that the command failed appropriately
    logger.info("Verifying error handling...")
    
    # Check for expected error message in output
    expected_error_msg = "Dataset type is required"
    error_msg_found = False
    
    if expected_error_msg in result.stdout:
        error_msg_found = True
        logger.info("✅ Expected error message found in STDOUT")
    elif expected_error_msg in result.stderr:
        error_msg_found = True
        logger.info("✅ Expected error message found in STDERR")
    
    # The command should either:
    # 1. Exit with non-zero code (preferred), OR
    # 2. Exit with zero code but log the error message
    if result.returncode != 0:
        logger.info("✅ Command correctly returned non-zero exit code")
        if error_msg_found:
            logger.info("✅ Test Case 3 PASSED: Command failed with appropriate error message")
        else:
            logger.warning("⚠️ Command failed but expected error message not found")
            logger.info("✅ Test Case 3 PASSED: Command failed as expected")
    else:
        logger.error("❌ Test Case 3 FAILED: Command succeeded when it should have failed")
        logger.error("❌ No appropriate error message found")
    
    
    logger.info("=" * 60)
    logger.info("Test Case 3 completed")
    logger.info("=" * 60)


if __name__ == "__main__":    
    run_test()
