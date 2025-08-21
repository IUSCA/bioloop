#!/usr/bin/env python3
"""
Test Case 1: RAW_DATA with current directory (.) and ingest_subdirs=True

This test creates multiple datasets, then runs register_ondemand from 
within the created directory using '.' as the path.
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
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_01.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 1: RAW_DATA with current directory and ingest_subdirs=True"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 1: RAW_DATA with current directory (.)")
    logger.info("=" * 60)
    
    try:
        # Step 1: Generate test datasets (multiple datasets)
        logger.info("Step 1: Generating test datasets...")
        container_path = generate_datasets(
            dataset_type='RAW_DATA',
            size_mb=2.0,  # Small size for faster testing
            single_dataset=False,  # Create multiple datasets
            container_name='test_case_01'
        )
        
        # Step 2: Change to the container directory
        logger.info(f"Step 2: Changing to directory: {container_path}")
        original_cwd = os.getcwd()
        os.chdir(container_path)
        
        # Step 3: List contents before registration
        logger.info("Step 3: Contents before registration:")
        for item in Path('.').iterdir():
            logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        
        # Step 4: Run register_ondemand with current directory
        logger.info("Step 4: Running register_ondemand script...")
        cmd = [
            'python', '-m', 'workers.scripts.register_ondemand',
            '--dataset-type', 'RAW_DATA',
            '--ingest-subdirs', 'true',
            '.'  # Current directory
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
        subdirs = [item for item in Path('.').iterdir() if item.is_dir()]
        
        for subdir in subdirs:
            dataset_name = subdir.name
            logger.info(f"Checking if dataset '{dataset_name}' was created...")
            
            try:
                datasets = api.get_all_datasets(dataset_type='RAW_DATA', name=dataset_name)
                if datasets:
                    logger.info(f"✅ Dataset '{dataset_name}' found in database")
                    dataset = datasets[0]
                    logger.info(f"   ID: {dataset.get('id')}")
                    logger.info(f"   Type: {dataset.get('type')}")
                    logger.info(f"   Origin Path: {dataset.get('origin_path')}")
                else:
                    logger.error(f"❌ Dataset '{dataset_name}' NOT found in database")
            except Exception as e:
                logger.error(f"❌ Error checking dataset '{dataset_name}': {e}")
        
        # Test success criteria
        if result.returncode == 0:
            logger.info("✅ Test Case 1 PASSED: Command executed successfully")
        else:
            logger.error("❌ Test Case 1 FAILED: Command returned non-zero exit code")
        
    except Exception as e:
        logger.error(f"❌ Test Case 1 FAILED with exception: {e}")
        
    finally:
        # Step 7: Cleanup - return to original directory
        try:
            os.chdir(original_cwd)
            logger.info(f"Returned to original directory: {original_cwd}")
        except Exception as e:
            logger.warning(f"Could not return to original directory: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 1 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
