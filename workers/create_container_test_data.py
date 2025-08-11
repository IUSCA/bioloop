#!/usr/bin/env python3
"""
Script to create test data directly inside the Docker container
"""

import os
import random
import string
from pathlib import Path

def create_test_file(file_path: Path, size_mb: int = 1):
    """Create a test file with random content of specified size."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    content = ''.join(random.choices(string.ascii_letters + string.digits, k=size_mb * 1024 * 1024))
    with open(file_path, 'w') as f:
        f.write(content)
    print(f"Created test file: {file_path} ({size_mb}MB)")

def create_test_case_01():
    """Create test data for Test Case 01: Basic Registration"""
    base_path = Path("/opt/sca/data/test_01_basic_registration/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 01: Basic Registration")
    
    # Create 3 test files
    files = [
        ("sample_data_1.txt", 1),
        ("sample_data_2.txt", 1),
        ("sample_data_3.txt", 1)
    ]
    
    for filename, size_mb in files:
        file_path = base_path / filename
        create_test_file(file_path, size_mb)
    
    print(f"Test data created in {base_path}")
    print("Total size: ~3MB")

def create_test_case_02():
    """Create test data for Test Case 02: Renaming with Prefix/Suffix"""
    base_path = Path("/opt/sca/data/test_02_renaming_with_prefix_suffix/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 02: Renaming with Prefix/Suffix")
    
    # Create subdirectories with unique names
    subdirs = [
        ("subdir_alpha", 2),
        ("subdir_beta", 2)
    ]
    
    for subdir_name, num_files in subdirs:
        subdir_path = base_path / subdir_name
        subdir_path.mkdir(exist_ok=True)
        
        for i in range(num_files):
            filename = f"data_file_{i+1}.txt"
            file_path = subdir_path / filename
            create_test_file(file_path, 1)
        
        print(f"Created subdirectory: {subdir_path}")
    
    print(f"Test data created in {base_path}")
    print("Expected renamed names: TEST_PRE-subdir_alpha-TEST_SUF, TEST_PRE-subdir_beta-TEST_SUF")

def create_test_case_03():
    """Create test data for Test Case 03: Hard Linking"""
    base_path = Path("/opt/sca/data/test_03_hard_linking/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 03: Hard Linking")
    
    # Create subdirectories with varying file sizes
    subdirs = [
        ("subdir_gamma", 2, 1),
        ("subdir_delta", 1, 2),
        ("subdir_epsilon", 3, 1)
    ]
    
    for subdir_name, num_files, file_size_mb in subdirs:
        subdir_path = base_path / subdir_name
        subdir_path.mkdir(exist_ok=True)
        
        for i in range(num_files):
            filename = f"hardlink_test_{i+1}.txt"
            file_path = subdir_path / filename
            create_test_file(file_path, file_size_mb)
        
        print(f"Created subdirectory: {subdir_path} with {num_files} files of {file_size_mb}MB each")
    
    print(f"Test data created in {base_path}")

def create_test_case_04():
    """Create test data for Test Case 04: Idempotency"""
    base_path = Path("/opt/sca/data/test_04_idempotency/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 04: Idempotency")
    
    subdirs = [
        ("subdir_zeta", 2),
        ("subdir_eta", 2)
    ]
    
    for subdir_name, num_files in subdirs:
        subdir_path = base_path / subdir_name
        subdir_path.mkdir(exist_ok=True)
        
        for i in range(num_files):
            filename = f"idempotency_test_{i+1}.txt"
            file_path = subdir_path / filename
            create_test_file(file_path, 1)
        
        print(f"Created subdirectory: {subdir_path}")
    
    print(f"Test data created in {base_path}")

def create_test_case_05():
    """Create test data for Test Case 05: Large Dataset"""
    base_path = Path("/opt/sca/data/test_05_large_dataset/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 05: Large Dataset")
    
    subdirs = [
        ("subdir_theta", 2, 5),
        ("subdir_iota", 2, 5)
    ]
    
    for subdir_name, num_files, file_size_mb in subdirs:
        subdir_path = base_path / subdir_name
        subdir_path.mkdir(exist_ok=True)
        
        for i in range(num_files):
            filename = f"large_file_{i+1}.txt"
            file_path = subdir_path / filename
            create_test_file(file_path, file_size_mb)
        
        print(f"Created subdirectory: {subdir_path} with {num_files} files of {file_size_mb}MB each")
    
    print(f"Test data created in {base_path}")

def create_test_case_06():
    """Create test data for Test Case 06: Mixed Content"""
    base_path = Path("/opt/sca/data/test_06_mixed_content/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 06: Mixed Content")
    
    subdirs = [
        ("subdir_kappa", 2, 1),
        ("subdir_lambda", 1, 2),
        ("subdir_mu", 3, 1)
    ]
    
    for subdir_name, num_files, file_size_mb in subdirs:
        subdir_path = base_path / subdir_name
        subdir_path.mkdir(exist_ok=True)
        
        if subdir_name == "subdir_lambda":
            nested_path = subdir_path / "nested"
            nested_path.mkdir(exist_ok=True)
            for i in range(num_files):
                filename = f"nested_file_{i+1}.txt"
                file_path = nested_path / filename
                create_test_file(file_path, file_size_mb)
        else:
            for i in range(num_files):
                filename = f"mixed_content_{i+1}.txt"
                file_path = subdir_path / filename
                create_test_file(file_path, file_size_mb)
        
        print(f"Created subdirectory: {subdir_path}")
    
    print(f"Test data created in {base_path}")

def create_test_case_07():
    """Create test data for Test Case 07: Error Handling"""
    base_path = Path("/opt/sca/data/test_07_error_handling/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 07: Error Handling")
    
    subdirs = [
        ("subdir_nu", 2),
        ("subdir_xi", 2)
    ]
    
    for subdir_name, num_files in subdirs:
        subdir_path = base_path / subdir_name
        subdir_path.mkdir(exist_ok=True)
        
        for i in range(num_files):
            filename = f"error_test_{i+1}.txt"
            file_path = subdir_path / filename
            create_test_file(file_path, 1)
        
        print(f"Created subdirectory: {subdir_path}")
    
    print(f"Test data created in {base_path}")

def create_test_case_08():
    """Create test data for Test Case 08: Cleanup"""
    base_path = Path("/opt/sca/data/test_08_cleanup/data")
    base_path.mkdir(parents=True, exist_ok=True)
    
    print("Creating test data for Test Case 08: Cleanup")
    
    subdirs = [
        ("subdir_omicron", 2),
        ("subdir_pi", 2)
    ]
    
    for subdir_name, num_files in subdirs:
        subdir_path = base_path / subdir_name
        subdir_path.mkdir(exist_ok=True)
        
        for i in range(num_files):
            filename = f"cleanup_test_{i+1}.txt"
            file_path = subdir_path / filename
            create_test_file(file_path, 1)
        
        print(f"Created subdirectory: {subdir_path}")
    
    print(f"Test data created in {base_path}")

def main():
    """Create all test data"""
    print("Creating test data for all test cases...")
    
    create_test_case_01()
    create_test_case_02()
    create_test_case_03()
    create_test_case_04()
    create_test_case_05()
    create_test_case_06()
    create_test_case_07()
    create_test_case_08()
    
    print("\nAll test data created successfully!")
    print("Test directories are available at /opt/sca/data/test_*")

if __name__ == "__main__":
    main()
