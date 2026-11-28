"""
Script to generate test datasets for register_ondemand test cases.
Creates datasets with configurable size and type in the appropriate directories.
"""

import shutil
import logging
import random
import string
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import workers.api as api

logger = logging.getLogger()


def random_string(length: int = 12,
                  prefix: str = None,
                  suffix: str = None,
) -> str:
    """Generate a random string of lowercase letters and digits."""        
    
    random_string = ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
    if prefix is not None:
        random_string = f"{prefix}_{random_string}"
    if suffix is not None:
        random_string = f"{random_string}_{suffix}"
    return random_string


def dataset_exists(name: str, type: str = None) -> bool:
    """Check if a dataset exists."""

    if type is None:
        raise ValueError("type is required")

    if type not in ['RAW_DATA', 'DATA_PRODUCT']:
        raise ValueError("type must be 'RAW_DATA' or 'DATA_PRODUCT'")

    dataset_exists = api.get_all_datasets(dataset_type=type, name=name, match_name_exact=True)
    logger.debug(f"{type} exists: {dataset_exists}")
    return dataset_exists


def generate_random_dataset_name(prefix: str = "dataset",
                                 type: str = None) -> str:
    """Generate a random dataset name that doesn't exist."""
    
    while True:
        name = random_string(prefix=prefix)
        logger.debug(f"Checking if dataset exists: {name}")
        if not dataset_exists(name, type):
            return name


def create_file(file_path: Path, size_mb: float = 1.0):
    """Create a file with specified size in MB."""
    
    size_bytes = int(size_mb * 1024 * 1024)
    
    with open(file_path, 'wb') as f:
        chunk_size = 1024 * 1024  # 1MB chunks
        remaining = size_bytes
        
        while remaining > 0:
            write_size = min(chunk_size, remaining)
            # Create random data
            data = bytearray(random.getrandbits(8) for _ in range(write_size))
            f.write(data)
            remaining -= write_size
    
    logger.debug(f"Created file {file_path} with size {size_mb:.2f} MB")


def create_dataset_directory(container: Path,
                             dataset_name: str = None,
                             type: str = None,
                             delete_existing: bool = True,
                             num_files: int = 1,
                             num_subdirs: int = 0,
                             create_subdirs_only: bool = False,
                             validate_dataset_name: bool = True,
                             validate_subdir_names: bool = False,) -> Path:
    """Create a dataset directory with files of specified total size."""
    
    if dataset_name is None:
        dataset_name = generate_random_dataset_name(type=type)
    
    if validate_dataset_name and dataset_exists(dataset_name, type):
        raise ValueError(f"Dataset {dataset_name} already exists")

    dataset_path = container / dataset_name
    
    if delete_existing and dataset_path.exists():
        logger.debug(f"Deleting existing dataset directory: {dataset_path}")
        shutil.rmtree(dataset_path)
    dataset_path.mkdir(parents=True, exist_ok=True)

    if create_subdirs_only and num_subdirs == 0:
        raise ValueError("num_subdirs must be greater than 0 if create_subdirs_only is True")
    
    # Create subdirectories if specified
    if num_subdirs > 0:
        for i in range(num_subdirs):
            # Generate subdirectory name
            if validate_subdir_names:
                # Generate unique dataset name for subdirectory
                subdir_name = generate_random_dataset_name(prefix=f"subdir_{i}", type=type)
                logger.debug(f"Generated unique subdirectory name: '{subdir_name}'")
            else:
                subdir_name = f"{random_string(prefix='subdir')}"
                logger.debug(f"Using random subdirectory name: '{subdir_name}'")
            
            subdir_path = dataset_path / subdir_name
            subdir_path.mkdir(exist_ok=True)
            logger.debug(f"Created subdirectory: '{subdir_name}'")
    
    # If create_subdirs_only is True, only create subdirectories and return
    if create_subdirs_only:
        logger.info(f"Created dataset directory with {num_subdirs} subdirectories only: {dataset_path}")
        return dataset_path
    
    for i in range(num_files):
        file_name = f"{random_string(prefix='file')}.dat"
        file_path = dataset_path / file_name        
        create_file(file_path)
    
    # Add a small metadata file
    metadata_file = dataset_path / "metadata.txt"
    with open(metadata_file, 'w') as f:
        f.write(f"Dataset: {dataset_path.name}\n")
        f.write(f"Generated for testing register_ondemand.py\n")
        f.write(f"Number of subdirectories: {num_subdirs}\n")
    
    logger.info(f"Created dataset directory: {dataset_path}")
    return dataset_path


def generate_datasets(dataset_type: str = None, 
                      num_datasets: int = 1,
                      delete_existing: bool = True,
                      directory: Path = None,
                      create_subdirs_only: bool = False,
                      num_subdirs: int = 0,
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
    
    if delete_existing and directory.exists():
        logger.info(f"Deleting existing datasets in {directory}")
        shutil.rmtree(directory)

    directory.mkdir(parents=True, exist_ok=True)
    
    if num_datasets == 1:
        # Create a single dataset directory
        dataset_name = generate_random_dataset_name(type=dataset_type)
        create_dataset_directory(dataset_path=directory / dataset_name,
                                 type=dataset_type,
                                 num_subdirs=num_subdirs,
                                 create_subdirs_only=create_subdirs_only)
    else:
        # Create multiple dataset directories
        for i in range(num_datasets):
            dataset_name = generate_random_dataset_name(prefix=f"dataset_{i}", type=dataset_type)
            create_dataset_directory(dataset_path=directory / dataset_name,
                                     num_subdirs=num_subdirs,
                                     type=dataset_type,
                                     create_subdirs_only=create_subdirs_only)
    
    logger.info(f"Generated test datasets in: {directory}")
    

# def get_random_project_id() -> str:
#     """Get a random project ID from the API."""
#     project_ids = api.get_all_project_ids()
#     if not project_ids:
#         logger.error("No projects found")
#         return None
#     return random.choice(project_ids)


# if __name__ == "__main__":
#     import argparse
    
#     parser = argparse.ArgumentParser(description="Generate test datasets for register_ondemand testing")
#     parser.add_argument("--dataset-type", choices=['RAW_DATA', 'DATA_PRODUCT'], 
#                        required=True, help="Type of dataset to create")
#     parser.add_argument("--size-mb", type=float, default=5.0, 
#                        help="Size of each dataset in MB (default: 5.0)")
#     parser.add_argument("--multiple", action="store_true", 
#                        help="Create multiple datasets instead of a single one")
#     parser.add_argument("--container-name", type=str, 
#                        help="Name for the container directory")
    
#     args = parser.parse_args()
    
#     container_path = generate_datasets(
#         dataset_type=args.dataset_type,
#         size_mb=args.size_mb,
#         num_datasets=1 if args.multiple else 2,
#         container_name=args.container_name
#     )
    
#     print(f"SUCCESS: Generated test datasets in {container_path}")
    
