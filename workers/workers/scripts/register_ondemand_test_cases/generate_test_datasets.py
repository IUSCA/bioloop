#!/usr/bin/env python3
"""
Script to generate test datasets for register_ondemand test cases.
Creates datasets with configurable size and type in the appropriate directories.
"""

import os
import shutil
import sys
import logging
import random
import string
import time
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

sys.path.append('/opt/sca/app')
import workers.api as api
from workers.config import config

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/sca/logs/register_ondemand/dataset_generator.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def generate_random_name(prefix: str = "test") -> str:
    """Generate a random dataset name that doesn't exist."""
    while True:
        # Use timestamp for uniqueness + larger random suffix for more entropy
        timestamp = int(time.time() * 1000) % 10000000  # Last 7 digits of timestamp in ms
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))
        name = f"{prefix}_{timestamp}_{suffix}"
        
        # Check if dataset exists for both types using exact name matching
        logger.debug(f"Checking if dataset exists: {name}")
        # try:
        raw_exists = api.get_all_datasets(dataset_type='RAW_DATA', name=name, match_name_exact=True)
        product_exists = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=name, match_name_exact=True)
        logger.debug(f"raw_exists: {raw_exists}")
        logger.debug(f"product_exits: {product_exists}")
        if not raw_exists and not product_exists:
            return name
        # except Exception as e:
        #     logger.warning(f"Error checking dataset existence: {e}")
        #     # Continue with this name if API call fails
        #     return name


def create_file_with_size(file_path: Path, size_mb: float):
    """Create a file with specified size in MB."""
    size_bytes = int(size_mb * 1024 * 1024)
    
    with open(file_path, 'wb') as f:
        # Write in chunks to avoid memory issues
        chunk_size = 1024 * 1024  # 1MB chunks
        remaining = size_bytes
        
        while remaining > 0:
            write_size = min(chunk_size, remaining)
            # Create random data to avoid sparse files
            data = bytearray(random.getrandbits(8) for _ in range(write_size))
            f.write(data)
            remaining -= write_size
    
    logger.info(f"Created file {file_path} with size {size_mb:.2f} MB")


def create_dataset_directory(base_path: Path,
                             dataset_name: str,
                             size_mb: float,
                             num_files: int = 1,
                             delete_existing: bool = True,
                             ) -> Path:
    """Create a dataset directory with files of specified total size."""
    dataset_path = base_path / dataset_name
    if delete_existing and dataset_path.exists():
        logger.info(f"Deleting existing dataset directory: {dataset_path}")
        shutil.rmtree(dataset_path)
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create a few files to reach the target size
    # num_files = random.randint(1, 5)
    size_per_file = size_mb / num_files
    
    for i in range(num_files):
        file_name = f"data_{i:03d}.dat"
        file_path = dataset_path / file_name
        create_file_with_size(file_path, size_per_file)
    
    # Add a small metadata file
    metadata_file = dataset_path / "metadata.txt"
    with open(metadata_file, 'w') as f:
        f.write(f"Dataset: {dataset_name}\n")
        f.write(f"Generated for testing register_ondemand.py\n")
        f.write(f"Total size: {size_mb:.2f} MB\n")
    
    logger.info(f"Created dataset directory: {dataset_path}")
    return dataset_path


def generate_datasets(dataset_type: str, 
                     size_mb: float = 5.0, 
                     container_name: str = None,
                     num_datasets: int = 2,
                     delete_existing: bool = True,
                     base_dir: Path = None,
                     ) -> Path:
    """
    Generate test datasets in the appropriate register_ondemand directory.
    
    Args:
        dataset_type: 'RAW_DATA' or 'DATA_PRODUCT'
        size_mb: Size of each dataset in MB
        single_dataset: If True, create one dataset. If False, create multiple datasets
        container_name: Optional name for the container directory
        
    Returns:
        Path to the created container directory
    """
    
    if dataset_type not in ['RAW_DATA', 'DATA_PRODUCT']:
        raise ValueError("dataset_type must be 'RAW_DATA' or 'DATA_PRODUCT'")
    
    if base_dir is None:
        # Get the appropriate base directory
        base_dir = Path(config['register_ondemand'][dataset_type]['source_dir'])
        base_dir.mkdir(parents=True, exist_ok=True)
    
    # Create container directory
    if container_name is None:
        container_name = generate_random_name("testcase")
    
    container_path = base_dir / container_name

    if delete_existing and container_path.exists():
        logger.info(f"Deleting existing datasets in {container_path}")
        shutil.rmtree(container_path)

    container_path.mkdir(parents=True, exist_ok=True)
    
    if num_datasets == 1:
        # Create a single dataset directory
        dataset_name = generate_random_name("dataset")
        create_dataset_directory(container_path, dataset_name, size_mb)
    else:
        # Create multiple dataset directories
        for i in range(num_datasets):
            dataset_name = generate_random_name(f"dataset_{i}")
            create_dataset_directory(container_path, dataset_name, size_mb)
    
    logger.info(f"Generated test datasets in: {container_path}")
    return container_path


def get_random_project_id() -> str:
    """Get a random project ID from the API."""
    project_ids = api.get_all_project_ids()
    if not project_ids:
        logger.error("No projects found")
        return None
    return random.choice(project_ids)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate test datasets for register_ondemand testing")
    parser.add_argument("--dataset-type", choices=['RAW_DATA', 'DATA_PRODUCT'], 
                       required=True, help="Type of dataset to create")
    parser.add_argument("--size-mb", type=float, default=5.0, 
                       help="Size of each dataset in MB (default: 5.0)")
    parser.add_argument("--multiple", action="store_true", 
                       help="Create multiple datasets instead of a single one")
    parser.add_argument("--container-name", type=str, 
                       help="Name for the container directory")
    
    args = parser.parse_args()
    
    try:
        # Ensure log directory exists
        log_dir = Path('/opt/sca/logs/register_ondemand')
        log_dir.mkdir(parents=True, exist_ok=True)
        
        container_path = generate_datasets(
            dataset_type=args.dataset_type,
            size_mb=args.size_mb,
            num_datasets=1 if args.multiple else 2,
            container_name=args.container_name
        )
        
        print(f"SUCCESS: Generated test datasets in {container_path}")
        
    except Exception as e:
        logger.error(f"Failed to generate test datasets: {e}")
        sys.exit(1)
