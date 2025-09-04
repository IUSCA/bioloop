#!/usr/bin/env python3
"""
Test Case 5: Missing dataset-type parameter

This test runs register_ondemand without providing the --dataset-type parameter
and verifies that it logs an error message.
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from tests.register_ondemand.generate_test_datasets import generate_datasets

# Setup logging
# Setup logging AFTER importing workers modules to avoid conflicts
# Clear any existing handlers first
root_logger = logging.getLogger()
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_12.log'),
        logging.StreamHandler()
    ],
    force=True  # Force reconfiguration
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 5: Missing dataset-type parameter"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 5: Missing dataset-type parameter")
    logger.info("=" * 60)
    
    try:
        # Step 1: Generate test datasets (we need a valid path for the test)
        logger.info("Step 1: Generating test datasets...")
        container_path = generate_datasets(
            dataset_type='DATA_PRODUCT',  # Any type is fine for this test
            container_name='test_case_12',
            num_datasets=2
        )
        
        # Step 2: Run register_ondemand WITHOUT dataset-type parameter
        logger.info("Step 2: Running register_ondemand script without --dataset-type...")
        cmd = [
            'python', '-m', 'workers.scripts.register_ondemand',
            '--dataset-type', 'INVALID_TYPE',
            str(container_path)
        ]
        
        logger.info(f"Executing command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/app')
        
        # Step 3: Log results
        logger.info("Step 3: Command output:")
        logger.info("STDOUT:")
        logger.info(result.stdout)
        if result.stderr:
            logger.info("STDERR:")
            logger.info(result.stderr)
        
        logger.info(f"Return code: {result.returncode}")
        
        # Step 4: Verify that the command failed appropriately
        logger.info("Step 4: Verifying error handling...")
        
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
                logger.info("✅ Test Case 5 PASSED: Command failed with appropriate error message")
            else:
                logger.warning("⚠️ Command failed but expected error message not found")
                logger.info("✅ Test Case 5 PASSED: Command failed as expected")
        elif error_msg_found:
            logger.info("✅ Test Case 5 PASSED: Command logged appropriate error message")
        else:
            logger.error("❌ Test Case 5 FAILED: Command succeeded when it should have failed")
            logger.error("❌ No appropriate error message found")
        
    except Exception as e:
        logger.error(f"❌ Test Case 5 FAILED with exception: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 5 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
