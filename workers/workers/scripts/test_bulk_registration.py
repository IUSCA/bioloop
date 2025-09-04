#!/usr/bin/env python3
"""
Test script for bulk dataset registration API.
Tests registration of datasets that don't exist and some that do exist.
"""

import argparse
import logging
import sys
import os
import json
from datetime import datetime
from pathlib import Path

# Add the workers directory to the path so we can import api
# sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import workers.api as api


logger = logging.getLogger(__name__)


def get_log_file_path() -> Path:
    """Get log file path for this test"""
    log_dir = "/opt/sca/logs/register_ondemand"
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = Path(log_dir) / f'test_bulk_registration_{datetime.now().strftime("%Y-%m-%d_%H-%M-%S")}.log'
    return log_file_path

def setup_logging(log_level: str = "INFO") -> None:
    """
    Setup logging configuration with the specified log level.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    # Convert string to logging level constant
    numeric_level = getattr(logging, log_level.upper(), None)
    if not isinstance(numeric_level, int):
        raise ValueError(f"Invalid log level: {log_level}")
    
    # Get the root logger and set its level
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Clear existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Add new handlers
    log_file_path = get_log_file_path()
    root_logger.addHandler(logging.FileHandler(str(log_file_path)))
    root_logger.addHandler(logging.StreamHandler())
    
    # Set format for all handlers
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    for handler in root_logger.handlers:
        handler.setFormatter(formatter)
    
    logger.info(f"Log file: {log_file_path}")

def check_dataset_exists(dataset_name: str, dataset_type: str) -> bool:
    """
    Check if a dataset already exists in the database.
    
    Args:
        dataset_name: Name of the dataset to check
        dataset_type: Type of dataset (RAW_DATA or DATA_PRODUCT)
    
    Returns:
        bool: True if dataset exists, False otherwise
    """
    try:
        datasets = api.get_all_datasets(dataset_type=dataset_type, name=dataset_name)
        return len(datasets) > 0
    except Exception as e:
        logger.warning(f"Error checking if dataset '{dataset_name}' exists: {e}")
        return False

def get_existing_datasets(dataset_type: str, limit: int = 3) -> list:
    """
    Get some existing datasets from the system to use in our test.
    
    Args:
        dataset_type: Type of dataset to query
        limit: Maximum number of existing datasets to return
    
    Returns:
        list: List of existing dataset names
    """
    try:
        existing_datasets = api.get_all_datasets(dataset_type=dataset_type)
        # Take up to 'limit' existing datasets
        return [ds['name'] for ds in existing_datasets[:limit]]
    except Exception as e:
        logger.warning(f"Error fetching existing datasets: {e}")
        return []

def generate_test_datasets(dataset_type: str) -> list:
    """
    Generate a list of test datasets to register.
    Mix of existing and non-existing datasets.
    
    Args:
        dataset_type: Type of dataset to generate
    
    Returns:
        list: List of dataset dictionaries
    """
    # Get some existing dataset names from the system
    existing_names = get_existing_datasets(dataset_type, limit=2)
    
    # Generate test datasets with mix of existing and new names
    test_datasets = []
    
    # Add some new datasets (should be created)
    for i in range(1, 4):
        test_datasets.append({
            'name': f'test_{dataset_type.lower()}_new_{i:03d}',
            'type': dataset_type,
            'origin_path': f'/opt/sca/data/test/{dataset_type.lower()}/new_{i:03d}'
        })
    
    # Add some existing datasets (should conflict)
    for i, existing_name in enumerate(existing_names):
        test_datasets.append({
            'name': existing_name,  # Use real existing name
            'type': dataset_type,
            'origin_path': f'/opt/sca/data/test/{dataset_type.lower()}/existing_{i+1}'
        })
    
    # Add one more new dataset
    test_datasets.append({
        'name': f'test_{dataset_type.lower()}_final_001',
        'type': dataset_type,
        'origin_path': f'/opt/sca/data/test/{dataset_type.lower()}/final_001'
    })
    
    return test_datasets

def test_bulk_registration(dataset_type: str):
    """
    Test bulk dataset registration API.
    
    Args:
        dataset_type: Type of dataset to test (RAW_DATA or DATA_PRODUCT)
    """
    logger.info("🧪 Starting Bulk Dataset Registration Test")
    logger.info("=" * 60)
    logger.info(f"Dataset Type: {dataset_type}")
    
    # Generate test datasets
    test_datasets = generate_test_datasets(dataset_type)
    
    # Log datasets to be registered
    logger.info("📝 Datasets to be registered:")
    for dataset in test_datasets:
        logger.info(f"  - Name: {dataset['name']}")
        logger.info(f"    Type: {dataset['type']}")
        logger.info(f"    Origin Path: {dataset['origin_path']}")
        logger.info("")
    
    # Check which datasets already exist
    logger.info("🔍 Checking which datasets already exist in database:")
    existing_datasets = []
    new_datasets = []
    
    for dataset in test_datasets:
        exists = check_dataset_exists(dataset['name'], dataset['type'])
        if exists:
            existing_datasets.append(dataset['name'])
            logger.info(f"  ✅ {dataset['name']} - EXISTS")
        else:
            new_datasets.append(dataset['name'])
            logger.info(f"  ❌ {dataset['name']} - DOES NOT EXIST")
    
    logger.info("")
    logger.info(f"Summary: {len(existing_datasets)} existing, {len(new_datasets)} new datasets")
    logger.info("")
    
    # Call bulk registration API
    logger.info("🚀 Calling bulk registration API...")
    try:
        response = api.bulk_create_datasets(test_datasets)
        logger.info("✅ Bulk registration API call successful")
        
        # Log response details
        logger.info("")
        logger.info("📊 Registration Results:")
        
        # Created datasets
        created_datasets = response.get('created', [])
        logger.info(f"✅ CREATED ({len(created_datasets)}):")
        for dataset in created_datasets:
            logger.info(f"  - {dataset['name']} (ID: {dataset.get('id', 'N/A')})")
        
        # Conflicted datasets
        conflicted_datasets = response.get('conflicted', [])
        logger.info(f"✋ CONFLICTED ({len(conflicted_datasets)}):")
        for dataset in conflicted_datasets:
            logger.info(f"  - {dataset['name']} (ID: {dataset.get('id', 'N/A')})")
        
        # Errored datasets
        errored_datasets = response.get('errored', [])
        logger.info(f"❌ ERRORED ({len(errored_datasets)}):")
        for dataset in errored_datasets:
            logger.info(f"  - {dataset['name']}")
            if 'error' in dataset:
                logger.info(f"    Error: {dataset['error']}")
        
        # Summary
        logger.info("")
        logger.info("📈 Summary:")
        logger.info(f"  Total requested: {len(test_datasets)}")
        logger.info(f"  Created: {len(created_datasets)}")
        logger.info(f"  Conflicted: {len(conflicted_datasets)}")
        logger.info(f"  Errored: {len(errored_datasets)}")
        
        # Full response body
        logger.info("")
        logger.info("🔍 Full API Response Body:")
        try:
            # Pretty print the JSON response with proper indentation
            formatted_response = json.dumps(response, indent=2, sort_keys=True)
            logger.info(formatted_response)
        except Exception as json_error:
            logger.warning(f"Could not format response as JSON: {json_error}")
            logger.info(f"Raw response: {response}")
        
    except Exception as e:
        logger.error(f"❌ Error calling bulk registration API: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        if hasattr(e, 'response'):
            logger.error(f"Response status: {e.response.status_code}")
            logger.error(f"Response body: {e.response.text}")
    
    logger.info("")
    logger.info("🎯 Bulk Registration Test Complete!")

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description="Test bulk dataset registration API")
    parser.add_argument("--dataset-type", dest="dataset_type", required=True, 
                       choices=["DATA_PRODUCT", "RAW_DATA"], 
                       help="Dataset type to test")
    parser.add_argument("--log-level", dest="log_level", default="INFO", 
                       choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"], 
                       help="Set the logging level")
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.log_level)
        
    # Run the test
    test_bulk_registration(args.dataset_type)

if __name__ == "__main__":
    main()
