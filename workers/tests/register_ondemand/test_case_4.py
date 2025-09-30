#!/usr/bin/env python3
"""
Test Case 4: RAW_DATA with project_id assignment

This test creates multiple datasets, runs register_ondemand with a project_id,
and verifies that the created datasets are linked to the selected project.
"""

import os
import shutil
import sys
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

import workers.api as api

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


test_dataset_type = 'RAW_DATA'


def run_test():
    """Run test case 4: RAW_DATA with project_id assignment"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 4: RAW_DATA with project_id assignment")
    logger.info("=" * 60)
    
    # Get a random project ID
    logger.info("Getting random project ID...")
    test_project_id = api.get_all_projects()[0]['id']
    if not test_project_id:
        logger.error("❌ Test Case 4 SKIPPED: No projects available for testing")
        return
    
    logger.info(f"Using project ID: {test_project_id}")
    
    # Generate test datasets (multiple datasets)
    logger.info("Generating test datasets...")
    created_dataset_path = create_dataset_directory(
        container=test_container_dir,
        type=test_dataset_type,
    )
    # Generate a few datasets as subdirectories inside the created dataset directory
    num_subdirs = 2
    for i in range(num_subdirs):
        create_dataset_directory(
            container=created_dataset_path,
            type=test_dataset_type,
        )
    
    # List contents before registration
    logger.info(f"Contents before registration at path: {created_dataset_path}")
    subdirs = []
    for item in created_dataset_path.iterdir():
        logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        if item.is_dir():
            subdirs.append(item.name)
    
    # Run register_ondemand with project_id
    logger.info("Running register_ondemand script with project_id...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', test_dataset_type,
        '--ingest-subdirs',
        '--project-id', test_project_id,
        str(created_dataset_path)
    ]
    
    logger.info(f"Executing command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/app')
    
    # Log results
    logger.info("Command output:")
    logger.info("STDOUT:")
    logger.info(result.stdout)
    if result.stderr:
        logger.warning("STDERR:")
        logger.warning(result.stderr)
    
    logger.info(f"Return code: {result.returncode}")
    
    # Verify results
    logger.info("Verifying results...")
    
    # First, verify that the datasets were created
    created_datasets = []
    for subdir_name in subdirs:
        logger.info(f"Checking if dataset '{subdir_name}' was created...")        
        datasets_matching_name = api.get_all_datasets(dataset_type=test_dataset_type, name=subdir_name, match_name_exact=True)
        if datasets_matching_name:
            created_dataset = datasets_matching_name[0]
            logger.info(f"✅ Dataset '{subdir_name}' found in database")
            logger.info(f"   ID: {created_dataset.get('id')}")
            logger.info(f"   Type: {created_dataset.get('type')}")
            logger.info(f"   Origin Path: {created_dataset.get('origin_path')}")
            created_datasets.append(created_dataset)
        else:
            logger.error(f"❌ Dataset '{subdir_name}' NOT found in database")
        
    # Verify that the created datasets are linked to the project
    logger.info("Verifying that the datasets are linked to the project...")
    project = api.get_project(test_project_id, include_datasets=True)
    project_dataset_ids = [dataset['dataset']['id'] for dataset in project['datasets']]
    for dataset in created_datasets:
        logger.info(f"Checking if dataset '{dataset['name']}' is linked to project '{test_project_id}'...")
        if dataset['id'] in project_dataset_ids:
            logger.info(f"✅ Dataset '{dataset['name']}' is linked to project '{test_project_id}'")
        else:
            logger.error(f"❌ Dataset '{dataset['name']}' is not linked to project '{test_project_id}'")


    logger.info("=" * 60)
    logger.info("ℹ️ Test Case 4 COMPLETED")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_test()
