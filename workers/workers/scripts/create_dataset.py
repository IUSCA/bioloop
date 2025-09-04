#!/usr/bin/env python3
"""
Script to create test datasets for testing the register_ondemand script.
This creates test directory structures with sample files.
"""

import os
import shutil
from pathlib import Path
import hashlib
import random
import string

def create_test_file(file_path: Path, size_mb: int = 1):
    """Create a test file with random content of specified size."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Create random content
    content = ''.join(random.choices(string.ascii_letters + string.digits, k=size_mb * 1024 * 1024))
    
    with open(file_path, 'w') as f:
        f.write(content)
    
    print(f"Created test file: {file_path} ({size_mb}MB)")

def create_test_dataset(base_path: Path, dataset_name: str, num_files: int = 5, file_size_mb: int = 1):
    """Create a test dataset with the specified number of files."""
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    print(f"Creating test dataset: {dataset_name}")
    
    # Create some subdirectories
    subdirs = ['data', 'metadata', 'logs']
    for subdir in subdirs:
        subdir_path = dataset_path / subdir
        subdir_path.mkdir(exist_ok=True)
        
        # Create files in subdirectories
        for i in range(num_files // len(subdirs)):
            filename = f"file_{i:03d}.txt"
            file_path = subdir_path / filename
            create_test_file(file_path, file_size_mb)
    
    # Create a few files in the root of the dataset
    for i in range(3):
        filename = f"root_file_{i:03d}.txt"
        file_path = dataset_path / filename
        create_test_file(file_path, file_size_mb)
    
    print(f"Created dataset {dataset_name} with {num_files} files at {dataset_path}")
    return dataset_path

def create_test_datasets(base_path: str, num_datasets: int = 3):
    """Create multiple test datasets."""
    base_path = Path(base_path)
    base_path.mkdir(parents=True, exist_ok=True)
    
    print(f"Creating {num_datasets} test datasets in {base_path}")
    
    datasets = []
    for i in range(num_datasets):
        dataset_name = f"test_dataset_{i:03d}"
        dataset_path = create_test_dataset(base_path, dataset_name, num_files=10, file_size_mb=2)
        datasets.append(dataset_path)
    
    print(f"Created {len(datasets)} test datasets:")
    for dataset in datasets:
        print(f"  - {dataset.name}")
    
    return datasets

def main():
    """Main function to create test datasets."""
    import fire
    
    def create_datasets(base_path: str = "/opt/sca/data/test_datasets", 
                       num_datasets: int = 3):
        """
        Create test datasets for testing.
        
        Args:
            base_path: Base path where datasets will be created
            num_datasets: Number of datasets to create
        """
        try:
            datasets = create_test_datasets(base_path, num_datasets)
            print(f"\nSuccessfully created {len(datasets)} test datasets in {base_path}")
            print("You can now use these datasets to test the register_ondemand script.")
            return datasets
        except Exception as e:
            print(f"Error creating test datasets: {e}")
            raise
    
    fire.Fire(create_datasets)

if __name__ == "__main__":
    main()
