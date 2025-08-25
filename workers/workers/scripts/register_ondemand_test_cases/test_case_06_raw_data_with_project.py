#!/usr/bin/env python3
"""
Test Case 6: RAW_DATA with project_id assignment

This test creates multiple datasets, runs register_ondemand with a project_id,
and verifies that the created datasets are linked to the selected project.
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import workers.api as api
from workers.scripts.register_ondemand_test_cases.generate_test_datasets import generate_datasets

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
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_06.log'),
        logging.StreamHandler()
    ],
    force=True  # Force reconfiguration
)
logger = logging.getLogger(__name__)


def run_test():
    """Run test case 6: RAW_DATA with project_id assignment"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 6: RAW_DATA with project_id assignment")
    logger.info("=" * 60)
    
    # try:
    # Step 1: Get a random project ID
    logger.info("Step 1: Getting random project ID...")
    project_id = api.get_all_project_ids()[0]
    if not project_id:
        logger.error("❌ Test Case 6 SKIPPED: No projects available for testing")
        return
    
    logger.info(f"Using project ID: {project_id}")
    
    # Step 2: Generate test datasets (multiple datasets)
    logger.info("Step 2: Generating test datasets...")
    container_path = generate_datasets(
        dataset_type='RAW_DATA',
        size_mb=2.0,  # Small size for faster testing
        single_dataset=False,  # Create multiple datasets
        container_name='test_case_06'
    )
    
    # Step 3: List contents before registration
    logger.info("Step 3: Contents before registration:")
    subdirs = []
    for item in container_path.iterdir():
        logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        if item.is_dir():
            subdirs.append(item.name)
    
    # Step 4: Run register_ondemand with project_id
    logger.info("Step 4: Running register_ondemand script with project_id...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', 'RAW_DATA',
        '--ingest-subdirs',
        '--project-id', project_id,
        str(container_path)
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
    
    # First, verify that datasets were created
    created_dataset_ids = []
    datasets = []
    for subdir_name in subdirs:
        logger.info(f"Checking if dataset '{subdir_name}' was created...")
        
        try:
            datasets = api.get_all_datasets(dataset_type='RAW_DATA', name=subdir_name)
            if datasets:
                logger.info(f"✅ Dataset '{subdir_name}' found in database")
                dataset = datasets[0]
                logger.info(f"   ID: {dataset.get('id')}")
                logger.info(f"   Type: {dataset.get('type')}")
                logger.info(f"   Origin Path: {dataset.get('origin_path')}")
                created_dataset_ids.append(dataset['id'])
            else:
                logger.error(f"❌ Dataset '{subdir_name}' NOT found in database")
        except Exception as e:
            logger.error(f"❌ Error checking dataset '{subdir_name}': {e}")
    
    # Step 7: Verify that the datasets are linked to the project
    logger.info("Step 7: Verifying that the datasets are linked to the project...")
    project = api.get_project(project_id, include_datasets=True)
    project_dataset_ids = [dataset['dataset']['id'] for dataset in project['datasets']]
    for dataset in datasets:
        if dataset['id'] in project_dataset_ids:
            logger.info(f"✅ Dataset '{dataset['name']}' is linked to project '{project_id}'")
        else:
            logger.error(f"❌ Dataset '{dataset['name']}' is not linked to project '{project_id}'")


    # Test success criteria
    if result.returncode == 0:
        logger.info("✅ Test Case 6 PASSED: Command executed successfully")
    else:
        logger.error("❌ Test Case 6 FAILED: Command returned non-zero exit code")
    
    # except Exception as e:
    #     logger.error(f"❌ Test Case 6 FAILED with exception: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 6 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
