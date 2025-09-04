#!/usr/bin/env python3
"""
Test Case 11: Naming conflicts with ingest_subdirs=true

This test creates datasets with some names that already exist in the database,
runs register_ondemand with ingest_subdirs=true, and verifies the behavior
when some subdirectory names conflict with existing datasets.
"""

import os
import random
import shutil
import subprocess
import logging
from pathlib import Path
from dotenv import load_dotenv

import workers.api as api

from tests.register_ondemand.setup.generate_test_datasets import create_dataset_directory, random_string
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


def prepare_datasets_for_conflict_test(num_datasets: int = 2) -> list[str]:
    """Create some datasets in the database that will cause naming conflicts."""
    logger.info(f"Registering {num_datasets} datasets of type {test_dataset_type}...")
    
    datasets_expected_to_conflict = []
    for i in range(num_datasets):
        # Generate a uniquely-named dataset name, and create a dataset
        name = random_string(prefix="conflict")

        logger.info(f"will register dataset with name: {name}")
        
        # Create a temporary dataset directory to register
        created_dataset = create_dataset_directory(
            container=test_container_dir / 'datasets_expected_to_conflict',
            type=test_dataset_type,
            dataset_name=name,
        )
        
        api.create_dataset({
            "type": test_dataset_type,
            "name": name,
            "origin_path": str(created_dataset),
        })


        datasets_expected_to_conflict.append(name)
        logger.info(f"✅ Registered dataset: {name}")

    logger.info(f"Registered {len(datasets_expected_to_conflict)} datasets to cause conflicts")
    return datasets_expected_to_conflict


def run_test():
    """Run test case 11: Naming conflicts with ingest_subdirs=true"""
    logger.info("=" * 60)
    logger.info("Starting Test Case 11: Naming conflicts with ingest_subdirs=true")
    logger.info("=" * 60)
    
    # Create some existing datasets that will cause conflicts
    logger.info("Registering datasets to later create conflicts during registration of other datasets...")
    datasets_expected_to_conflict = prepare_datasets_for_conflict_test()

    if not datasets_expected_to_conflict:
        logger.error("❌ Test Case 11 SKIPPED: Could not create datasets to cause conflicts")
        return

    # Generate dataset directories whose names will conflict with existing datasets during registration
    logger.info("Generating dataset directories whose names will conflict with existing datasets during registration...")
    
    registered_datasets_container_path = test_container_dir / "datasets_to_register"
    if registered_datasets_container_path.exists():
        logger.info(f"Deleting existing container directory: {registered_datasets_container_path}")
        shutil.rmtree(registered_datasets_container_path)
    registered_datasets_container_path.mkdir(parents=True, exist_ok=True)
    
    # Create datasets, some with names the same as names of existing datasets, and others with unique names
    all_dataset_names = []
    
    # Add names expected to conflict
    for name in datasets_expected_to_conflict:
        created_dir = create_dataset_directory(container=registered_datasets_container_path,
                                               dataset_name=name,
                                               type=test_dataset_type)
        all_dataset_names.append(created_dir.name)
        logger.info(f"Created dataset directory with conflicting name {created_dir.name} at {created_dir}")
    
    # Add unique names
    num_uniquely_named_datasets = random.randint(2, 3)
    for i in range(num_uniquely_named_datasets):
        created_dir = create_dataset_directory(container=registered_datasets_container_path,
                                               type=test_dataset_type)
        all_dataset_names.append(created_dir.name)
        logger.info(f"Created dataset directory with unique name: {created_dir.name} at {created_dir}")
    
    # List contents before registration
    logger.info("Contents before registration:")
    subdirs_in_target_dir = []
    for item in registered_datasets_container_path.iterdir():
        logger.info(f"  - {item.name} ({'directory' if item.is_dir() else 'file'})")
        if item.is_dir():
            subdirs_in_target_dir.append(item.name)
    
    # Run register_ondemand with ingest_subdirs=true
    logger.info("Running register_ondemand script with ingest_subdirs=true...")
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', test_dataset_type,
        '--ingest-subdirs',
        str(registered_datasets_container_path)
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
        
    # Verify results
    logger.info("Verifying results...")
    
    successful_registrations = []
    conflicted_registrations = []
    
    for subdir_name in subdirs_in_target_dir:
        logger.info(f"Checking dataset '{subdir_name}'...")
        
        datasets_matching_name = api.get_all_datasets(dataset_type=test_dataset_type, name=subdir_name, match_name_exact=True)
        
        if subdir_name in datasets_expected_to_conflict:
            # This was a conflicting name
            if len(datasets_matching_name) == 1:
                logger.info(f"✅ Conflicting dataset '{subdir_name}' exists (original dataset)")
                conflicted_registrations.append(subdir_name)
            elif len(datasets_matching_name) > 1:
                logger.warning(f"❌ Multiple datasets found for conflicting name '{subdir_name}'")
            else:
                logger.error(f"❌ Unexpected: No datasets found for conflicting name '{subdir_name}'")
        else:
            # This was a uniquely-named dataset
            if datasets_matching_name:
                logger.info(f"✅ Uniquely-named dataset '{subdir_name}' was successfully registered")
                successful_registrations.append(subdir_name)
                dataset = datasets_matching_name[0]
                logger.info(f"   ID: {dataset.get('id')}")
                logger.info(f"   Type: {dataset.get('type')}")
                logger.info(f"   Origin Path: {dataset.get('origin_path')}")
            else:
                logger.error(f"❌ Uniquely-named dataset '{subdir_name}' was NOT registered")
                    
    # Analyze results
    logger.info("Test results analysis:")
    logger.info(f"Total subdirectories: {len(subdirs_in_target_dir)}")
    logger.info(f"Existing names (conflicts): {datasets_expected_to_conflict}")
    logger.info(f"Successful registrations: {successful_registrations}")
    logger.info(f"Failed/skipped registrations: {conflicted_registrations}")
    
    # Test success criteria:
    # - Uniquely-named datasets should be registered successfully
    # - Conflicting names should either be skipped or handled appropriately
    datasets_expected_to_be_registered = [name for name in all_dataset_names if name not in datasets_expected_to_conflict]
    all_expected_datasets_registered = all(name in successful_registrations for name in datasets_expected_to_be_registered)
    
    if all_expected_datasets_registered:
        logger.info("✅ All uniquely-named datasets were registered successfully")
    else:
        logger.error("❌ Some uniquely-named datasets were not registered")
    
    # Log the behavior with conflicts
    if any(name in successful_registrations for name in datasets_expected_to_conflict):
        logger.info("❌ Note: Some conflicting names were still registered (system allows duplicates)")
    else:
        logger.info("✅ Note: All conflicting names were skipped (system prevents duplicates)")
    
    logger.info("=" * 60)
    logger.info("Test Case 11 completed")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_test()
