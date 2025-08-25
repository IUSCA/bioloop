#!/usr/bin/env python3
"""
Test Case 11: Naming conflicts with ingest_subdirs=true

This test creates datasets with some names that already exist in the database,
runs register_ondemand with ingest_subdirs=true, and verifies the behavior
when some subdirectory names conflict with existing datasets.
"""

import os
import shutil
import sys
import subprocess
import logging
import random
from pathlib import Path

from celery.app import base
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import workers.api as api
from workers.config import config
from workers.scripts.register_ondemand_test_cases.generate_test_datasets import generate_random_name, create_dataset_directory

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
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_11.log'),
        logging.StreamHandler()
    ],
    force=True  # Force reconfiguration
)
logger = logging.getLogger(__name__)


base_dir = Path(config['register_ondemand']['DATA_PRODUCT']['source_dir']) / 'test_case_11'


def prepare_datasets_for_conflict_test(dataset_type: str, num_datasets: int = 2) -> list:
    """Create some datasets in the database that will cause naming conflicts."""
    logger.info(f"Creating {num_datasets} existing datasets of type {dataset_type}...")
    
    existing_names = []
    for i in range(num_datasets):
        # Generate a unique name and create a dataset
        name = generate_random_name("conflict")

        logger.info(f"will create existing dataset with name: {name}")
        
        # Create a temporary dataset directory to register
        temp_container = create_dataset_directory(
            base_path=base_dir / 'expected_to_conflict',
            dataset_name=name,
            size_mb=1.0,  # Small size
            num_files=1,
        )
        
        api.create_dataset({
            "type": dataset_type,
            "name": name,
            "origin_path": str(temp_container),
        })


        existing_names.append(name)
        logger.info(f"✅ Created existing dataset: {name}")

    return existing_names


def run_test():
    """Run test case 11: Naming conflicts with ingest_subdirs=true"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 11: Naming conflicts with ingest_subdirs=true")
    logger.info("=" * 60)
    
    # try:
    # Step 1: Create some existing datasets that will cause conflicts
    logger.info("Step 1: Creating datasets that will cause conflicts...")
    existing_names = prepare_datasets_for_conflict_test('DATA_PRODUCT', num_datasets=2)
    
    if not existing_names:
        logger.error("❌ Test Case 11 SKIPPED: Could not create existing datasets")
        return
    
    logger.info(f"Existing dataset names: {existing_names}")
    
    # Step 2: Generate test datasets with some conflicting names
    logger.info("Step 2: Generating test dataset directories with some conflicting names...")
    
    container_path = base_dir / "conflict_test"
    if container_path.exists():
        logger.info(f"Deleting existing container directory: {container_path}")
        shutil.rmtree(container_path)
    container_path.mkdir(parents=True, exist_ok=True)
    
    # Create datasets: some with conflicting names, some with unique names
    all_dataset_names = []
    
    # Add conflicting names (use existing names)
    for name in existing_names:
        created_dir = create_dataset_directory(container_path, name, 1.5)
        all_dataset_names.append(name)
        logger.info(f"Created dataset directory with conflicting name {name} at {created_dir}")
    
    # Add unique names
    num_unique = random.randint(2, 3)
    for i in range(num_unique):
        unique_name = generate_random_name("unique")
        created_dir = create_dataset_directory(container_path, unique_name, 1.5)
        all_dataset_names.append(unique_name)
        logger.info(f"Created dataset directory with unique name: {unique_name} at {created_dir}")
    
    # Step 3: List contents before registration
    logger.info("Step 3: Contents before registration:")
    subdirs = []
    for item in container_path.iterdir():
        logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        if item.is_dir():
            subdirs.append(item.name)
    
    # Step 4: Run register_ondemand with ingest_subdirs=true
    logger.info("Step 4: Running register_ondemand script with ingest_subdirs=true...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', 'DATA_PRODUCT',
        '--ingest-subdirs',
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
    
    successful_registrations = []
    failed_registrations = []
    
    for subdir_name in subdirs:
        logger.info(f"Checking dataset '{subdir_name}'...")
        
        try:
            datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=subdir_name, match_name_exact=True)
            
            if subdir_name in existing_names:
                # This was a conflicting name
                if len(datasets) == 1:
                    logger.info(f"✅ Conflicting dataset '{subdir_name}' exists (original dataset)")
                    failed_registrations.append(subdir_name)
                elif len(datasets) > 1:
                    logger.warning(f"⚠️ Multiple datasets found for conflicting name '{subdir_name}'")
                    # Check if any have the new origin path
                    new_registrations = [d for d in datasets if str(container_path) in d.get('origin_path', '')]
                    if new_registrations:
                        successful_registrations.append(subdir_name)
                        logger.info(f"✅ Conflicting dataset '{subdir_name}' was successfully registered despite conflict")
                    else:
                        failed_registrations.append(subdir_name)
                        logger.info(f"❌ Conflicting dataset '{subdir_name}' was not registered (expected)")
                else:
                    logger.error(f"❌ Unexpected: No datasets found for conflicting name '{subdir_name}'")
                    failed_registrations.append(subdir_name)
            else:
                # This was a unique name
                if datasets:
                    logger.info(f"✅ Unique dataset '{subdir_name}' was successfully registered")
                    successful_registrations.append(subdir_name)
                    dataset = datasets[0]
                    logger.info(f"   ID: {dataset.get('id')}")
                    logger.info(f"   Type: {dataset.get('type')}")
                    logger.info(f"   Origin Path: {dataset.get('origin_path')}")
                else:
                    logger.error(f"❌ Unique dataset '{subdir_name}' was NOT registered")
                    failed_registrations.append(subdir_name)
                    
        except Exception as e:
            logger.error(f"❌ Error checking dataset '{subdir_name}': {e}")
            failed_registrations.append(subdir_name)
    
    # Step 7: Analyze results
    logger.info("Step 7: Test results analysis:")
    logger.info(f"Total subdirectories: {len(subdirs)}")
    logger.info(f"Existing names (conflicts): {existing_names}")
    logger.info(f"Successful registrations: {successful_registrations}")
    logger.info(f"Failed/skipped registrations: {failed_registrations}")
    
    # Test success criteria:
    # - Command should handle conflicts gracefully (return code 0 or partial success)
    # - Unique names should be registered successfully
    # - Conflicting names should either be skipped or handled appropriately
    unique_names = [name for name in all_dataset_names if name not in existing_names]
    unique_success = all(name in successful_registrations for name in unique_names)
    
    if unique_success:
        logger.info("✅ Test Case 11 PASSED: All unique datasets were registered successfully")
    else:
        logger.error("❌ Test Case 11 FAILED: Some unique datasets were not registered")
    
    # Log the behavior with conflicts
    if any(name in successful_registrations for name in existing_names):
        logger.info("ℹ️ Note: Some conflicting names were still registered (system allows duplicates)")
    else:
        logger.info("ℹ️ Note: All conflicting names were skipped (system prevents duplicates)")
    
    # except Exception as e:
    #     logger.error(f"❌ Test Case 11 FAILED with exception: {e}")
    
    logger.info("=" * 60)
    logger.info("Test Case 11 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Ensure log directory exists
    log_dir = Path('/opt/sca/logs/register_ondemand')
    log_dir.mkdir(parents=True, exist_ok=True)
    
    run_test()
