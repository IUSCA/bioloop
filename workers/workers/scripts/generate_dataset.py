#!/usr/bin/env python3
"""
Script to generate dummy datasets for testing purposes.

This script creates dummy dataset directories with configurable size and type.
It checks if a dataset with the given name already exists using the API
before creating the directory structure.

Usage:
    python generate_dataset.py --size 5 --type "DATA_PRODUCT"  # Random name, specific type
    python generate_dataset.py --name "test_dataset" --size 5  # Specific name, random type
    python generate_dataset.py --name "raw_test" --size 10 --type "RAW_DATA"  # Specific name and type
    python generate_dataset.py --size 5  # Random name and type

Arguments:
    --name: Dataset name (if not provided, a random unique name will be generated)
    --size: Size in MB (default: 5)
    --type: Dataset type - "RAW_DATA" or "DATA_PRODUCT" (if not provided, type is chosen randomly)
"""

import argparse
import os
import random
import string
import sys
from pathlib import Path
import time

# Add the app directory to the path so we can import workers modules
current_dir = Path(__file__).parent
app_dir = current_dir.parent.parent.parent / "app"  # Go up to /opt/sca/app
sys.path.insert(0, str(app_dir))

# Import from the workers directory
import workers.api as api
from workers.config import config


def random_string(length):
    """Generate a random string of specified length."""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


def create_dummy_file(file_path, size_mb):
    """Create a dummy file with the specified size in MB."""
    with open(file_path, 'wb') as f:
        f.write(os.urandom(size_mb * 1024 * 1024))


def generate_random_dataset_name():
    """Generate a random dataset name that doesn't already exist."""
    max_attempts = 100
    for attempt in range(max_attempts):
        # Generate a random name
        name = f"dataset_{random_string(8)}"
        
        # Check both types to ensure uniqueness
        exists_raw = check_dataset_exists(name, 'RAW_DATA')
        exists_product = check_dataset_exists(name, 'DATA_PRODUCT')
        
        if not exists_raw and not exists_product:
            return name
    
    # If we can't find a unique name after max attempts, use timestamp
    timestamp = int(time.time())
    return f"dataset_{timestamp}_{random_string(4)}"


def check_dataset_exists(name, dataset_type):
    """
    Check if a dataset with the given name and type already exists.
    
    Args:
        name (str): Dataset name
        dataset_type (str): Dataset type ("RAW_DATA" or "DATA_PRODUCT")
    
    Returns:
        bool: True if dataset exists, False otherwise
    """
    try:
        # Use the API to check if dataset exists
        # The endpoint format is /datasets/{type}/{name}/exists
        with api.APIServerSession() as s:
            r = s.get(f'datasets/{dataset_type}/{name}/exists')
            r.raise_for_status()
            return r.json().get('exists', False)
    except Exception as e:
        print(f"Warning: Could not check if dataset exists: {e}")
        print("Proceeding with dataset creation...")
        return False


def generate_dataset_structure(base_dir, name, size_mb, dataset_type):
    """
    Generate a dummy dataset directory structure.
    
    Args:
        base_dir (str): Base directory path
        name (str): Dataset name
        size_mb (int): Target size in MB
        dataset_type (str): Dataset type
    
    Returns:
        str: Path to the created dataset directory
    """
    # Create the dataset directory path
    dataset_dir = Path(base_dir) / name
    dataset_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Creating dataset directory: {dataset_dir}")
    
    # Create some subdirectories for structure
    subdirs = ['data', 'metadata', 'logs']
    for subdir in subdirs:
        (dataset_dir / subdir).mkdir(exist_ok=True)
    
    # Calculate how many files we need to create
    # Each file will be between 1-10 MB
    remaining_size = size_mb
    file_count = 0
    
    while remaining_size > 0:
        # Random file size between 1-10 MB, but don't exceed remaining size
        file_size = min(random.randint(1, 10), remaining_size)
        
        # Generate a random filename
        filename = f"file_{file_count:04d}_{random_string(8)}.bin"
        
        # Randomly choose a subdirectory
        subdir = random.choice(subdirs)
        file_path = dataset_dir / subdir / filename
        
        # Create the dummy file
        create_dummy_file(file_path, file_size)
        
        remaining_size -= file_size
        file_count += 1
        
        print(f"  Created file: {file_path} ({file_size} MB)")
    
    # Create a README file with dataset information
    readme_content = f"""# Dataset: {name}

Type: {dataset_type}
Generated Size: {size_mb} MB
File Count: {file_count}
Generated: {__import__('datetime').datetime.now().isoformat()}

This is a dummy dataset generated for testing purposes.
"""
    
    readme_path = dataset_dir / "README.md"
    with open(readme_path, 'w') as f:
        f.write(readme_content)
    
    print(f"  Created README: {readme_path}")
    print(f"Dataset generation complete: {dataset_dir}")
    print(f"Total files created: {file_count}")
    
    return str(dataset_dir)


def main():
    """Main function to parse arguments and generate dataset."""
    parser = argparse.ArgumentParser(
        description="Generate dummy datasets for testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_dataset.py --size 5 --type "DATA_PRODUCT"  # Random name, specific type
  python generate_dataset.py --name "test_dataset" --size 5  # Specific name, random type
  python generate_dataset.py --name "raw_test" --size 10 --type "RAW_DATA"  # Specific name and type
  python generate_dataset.py --size 5  # Random name and type
        """
    )
    
    parser.add_argument(
        '--name',
        help='Dataset name (if not provided, a random unique name will be generated)'
    )
    
    parser.add_argument(
        '--size',
        type=int,
        default=5,
        help='Size in MB (default: 5)'
    )
    
    parser.add_argument(
        '--type',
        choices=['RAW_DATA', 'DATA_PRODUCT'],
        help='Dataset type: RAW_DATA or DATA_PRODUCT (if not provided, type is chosen randomly)'
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.size <= 0:
        print("Error: Size must be greater than 0")
        sys.exit(1)
    
    # Generate random name if none provided
    if not args.name or len(args.name.strip()) == 0:
        print("No dataset name specified. Generating random unique name...")
        dataset_name = generate_random_dataset_name()
        print(f"Generated name: {dataset_name}")
    else:
        dataset_name = args.name.strip()
    
    # If no type specified, choose randomly
    if args.type is None:
        dataset_type = random.choice(['RAW_DATA', 'DATA_PRODUCT'])
        print(f"No dataset type specified. Randomly chosen: {dataset_type}")
    else:
        dataset_type = args.type
    
    print(f"Generating dataset:")
    print(f"  Name: {dataset_name}")
    print(f"  Type: {dataset_type}")
    print(f"  Size: {args.size} MB")
    print()
    
    # Determine the base directory based on dataset type
    origin_dir = config['registration'][dataset_type]['source_dir']
    
    # Only create archive paths when running in Docker
    if config.get('mode') == 'docker':
        # Ensure the base directory exists
        Path(origin_dir).mkdir(parents=True, exist_ok=True)
        print(f"Created archive directory: {origin_dir}")
    else:
        print(f"Running outside Docker - archive directory creation skipped: {origin_dir}")
    
    try:
        # Generate the dataset structure
        dataset_path = generate_dataset_structure(
            base_dir=origin_dir,
            name=dataset_name,
            size_mb=args.size,
            dataset_type=dataset_type
        )
        
        print()
        print("=" * 60)
        print(f"SUCCESS: Dataset '{dataset_name}' created successfully!")
        print(f"Location: {dataset_path}")
        print(f"Type: {dataset_type}")
        print(f"Size: {args.size} MB")
        print("=" * 60)
        
    except Exception as e:
        print(f"Error creating dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
