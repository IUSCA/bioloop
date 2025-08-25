#!/usr/bin/env python3
"""
Master script to run all register_ondemand test cases.

This script executes all 10 test cases in sequence and logs the results.
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/sca/logs/register_ondemand/run_all_test_cases.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def run_test_case(test_case_number: int, description: str) -> bool:
    """Run a specific test case and return success status."""
    logger.info("=" * 80)
    logger.info(f"RUNNING TEST CASE {test_case_number:02d}: {description}")
    logger.info("=" * 80)
    
    script_name = f"test_case_{test_case_number:02d}_{description.lower().replace(' ', '_').replace('-', '_')}.py"
    script_path = Path(__file__).parent / script_name
    
    if not script_path.exists():
        logger.error(f"❌ Test script not found: {script_path}")
        return False
    
    try:
        result = subprocess.run([
            'python', str(script_path)
        ], capture_output=True, text=True, cwd='/opt/sca/app')
        
        # Log the output
        if result.stdout:
            logger.info("Test output:")
            for line in result.stdout.splitlines():
                logger.info(f"  {line}")
        
        if result.stderr:
            logger.warning("Test errors:")
            for line in result.stderr.splitlines():
                logger.warning(f"  {line}")
        
        success = result.returncode == 0
        if success:
            logger.info(f"✅ TEST CASE {test_case_number:02d} PASSED")
        else:
            logger.error(f"❌ TEST CASE {test_case_number:02d} FAILED (exit code: {result.returncode})")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ TEST CASE {test_case_number:02d} FAILED with exception: {e}")
        return False


def main():
    """Run all test cases."""
    logger.info("🚀 Starting register_ondemand test suite")
    logger.info("=" * 80)
    
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Define all test cases
    test_cases = [
        (1, "raw_data_current_dir"),
        (2, "data_product_current_dir"),
        (3, "data_product_absolute_path_subdirs"),
        (4, "data_product_absolute_path_no_subdirs"),
        (5, "missing_dataset_type"),
        (6, "raw_data_with_project"),
        (7, "data_product_prefix"),
        (8, "data_product_suffix"),
        (9, "data_product_prefix_suffix"),
        (10, "data_product_description"),
        (11, "naming_conflicts"),
        (12, "invalid_dataset_type"),
        (13, "crash_recovery"),
    ]
    
    # Run all test cases
    results = []
    for test_number, test_description in test_cases:
        try:
            success = run_test_case(test_number, test_description)
            results.append((test_number, test_description, success))
        except Exception as e:
            logger.error(f"Failed to run test case {test_number}: {e}")
            results.append((test_number, test_description, False))
    
    # Summary
    logger.info("=" * 80)
    logger.info("TEST SUITE SUMMARY")
    logger.info("=" * 80)
    
    passed = 0
    failed = 0
    
    for test_number, test_description, success in results:
        status = "✅ PASSED" if success else "❌ FAILED"
        logger.info(f"Test Case {test_number:02d} - {test_description}: {status}")
        if success:
            passed += 1
        else:
            failed += 1
    
    logger.info("=" * 80)
    logger.info(f"TOTAL: {len(results)} tests")
    logger.info(f"PASSED: {passed}")
    logger.info(f"FAILED: {failed}")
    
    if failed == 0:
        logger.info("🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        logger.error(f"💥 {failed} TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
