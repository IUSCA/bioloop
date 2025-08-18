#!/usr/bin/env python3
"""
Comprehensive test data generation script for register_ondemand.py testing.
Creates test data for all test cases including edge cases and error scenarios.
"""

import os
import random
import string
from pathlib import Path

def create_file_with_content(file_path, size_mb=1, content_type="random"):
    """Create a file with specified size and content type."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    if content_type == "random":
        # Generate random content
        content = ''.join(random.choices(string.ascii_letters + string.digits, k=int(size_mb * 1024 * 1024)))
    elif content_type == "zeros":
        content = '\x00' * int(size_mb * 1024 * 1024)
    elif content_type == "pattern":
        # Create a repeating pattern
        pattern = "TEST_DATA_" + str(random.randint(1000, 9999)) + "_"
        content = (pattern * (int(size_mb * 1024 * 1024) // len(pattern)))[:int(size_mb * 1024 * 1024)]
    
    with open(file_path, 'w') as f:
        f.write(content)

def create_test_case_01_basic():
    """Test Case 01: Basic Registration - No renaming, subdirectory ingestion"""
    base_path = Path("/opt/sca/data/scratch/test_01_basic_registration/data")
    
    # Create subdirectory with basic files
    subdir_path = base_path / "subdir_basic"
    create_file_with_content(subdir_path / "file1.txt", 1, "pattern")
    create_file_with_content(subdir_path / "file2.txt", 1, "pattern")
    create_file_with_content(subdir_path / "file3.txt", 1, "pattern")
    
    print(f"✅ Created Test Case 01: {base_path}")

def create_test_case_02_renaming():
    """Test Case 02: Renaming with Prefix/Suffix - Multiple subdirectories with renaming"""
    base_path = Path("/opt/sca/data/scratch/test_02_renaming_with_prefix_suffix/data")
    
    # Create multiple subdirectories
    for i, name in enumerate(["subdir_alpha", "subdir_beta"]):
        subdir_path = base_path / name
        create_file_with_content(subdir_path / f"data_{i+1}.txt", 1, "pattern")
        create_file_with_content(subdir_path / f"metadata_{i+1}.json", 1, "pattern")
    
    print(f"✅ Created Test Case 02: {base_path}")

def create_test_case_03_hard_linking():
    """Test Case 03: Hard Linking - Multiple subdirectories with varying file sizes"""
    base_path = Path("/opt/sca/data/scratch/test_03_hard_linking/data")
    
    # Create subdirectories with varying file counts and sizes
    subdirs = [
        ("subdir_small", 1, 1),      # 1 file, 1MB
        ("subdir_medium", 2, 2),     # 2 files, 2MB each
        ("subdir_large", 1, 3)       # 1 file, 3MB
    ]
    
    for name, file_count, size_mb in subdirs:
        subdir_path = base_path / name
        for j in range(file_count):
            create_file_with_content(subdir_path / f"file_{j+1}.dat", size_mb, "pattern")
    
    print(f"✅ Created Test Case 03: {base_path}")

def create_test_case_04_idempotency():
    """Test Case 04: Idempotency - Testing duplicate execution prevention"""
    base_path = Path("/opt/sca/data/scratch/test_04_idempotency/data")
    
    # Create subdirectories for idempotency testing
    for name in ["subdir_zeta", "subdir_eta"]:
        subdir_path = base_path / name
        create_file_with_content(subdir_path / "data.txt", 1, "pattern")
        create_file_with_content(subdir_path / "metadata.json", 1, "pattern")
    
    print(f"✅ Created Test Case 04: {base_path}")

def create_test_case_05_large_dataset():
    """Test Case 05: Large Dataset - Testing with larger file sizes"""
    base_path = Path("/opt/sca/data/scratch/test_05_large_dataset/data")
    
    # Create subdirectories with larger files
    for i, name in enumerate(["subdir_large1", "subdir_large2"]):
        subdir_path = base_path / name
        create_file_with_content(subdir_path / f"large_file_{i+1}.dat", 5, "pattern")
        create_file_with_content(subdir_path / f"large_file_{i+1}_backup.dat", 5, "pattern")
    
    print(f"✅ Created Test Case 05: {base_path}")

def create_test_case_06_mixed_content():
    """Test Case 06: Mixed Content - Testing with nested directories and varying structures"""
    base_path = Path("/opt/sca/data/scratch/test_06_mixed_content/data")
    
    # Create complex directory structure
    subdirs = [
        ("subdir_simple", 1, 1),           # Simple structure
        ("subdir_nested", 2, 1, True),     # Nested directories
        ("subdir_mixed", 1, 2)             # Mixed file types
    ]
    
    for subdir_info in subdirs:
        name, file_count, size_mb = subdir_info[:3]
        has_nested = len(subdir_info) > 3 and subdir_info[3]
        
        subdir_path = base_path / name
        for j in range(file_count):
            create_file_with_content(subdir_path / f"file_{j+1}.txt", size_mb, "pattern")
        
        if has_nested:
            nested_path = subdir_path / "nested"
            create_file_with_content(nested_path / "nested_file.txt", 1, "pattern")
    
    print(f"✅ Created Test Case 06: {base_path}")

def create_test_case_07_error_handling():
    """Test Case 07: Error Handling - Testing error scenarios and edge cases"""
    base_path = Path("/opt/sca/data/scratch/test_07_error_handling/data")
    
    # Create subdirectories for error handling tests
    for name in ["subdir_nu", "subdir_xi"]:
        subdir_path = base_path / name
        create_file_with_content(subdir_path / "data.txt", 1, "pattern")
        create_file_with_content(subdir_path / "config.json", 1, "pattern")
    
    print(f"✅ Created Test Case 07: {base_path}")

def create_test_case_08_cleanup():
    """Test Case 08: Cleanup - Testing cleanup functionality"""
    base_path = Path("/opt/sca/data/scratch/test_08_cleanup/data")
    
    # Create subdirectories for cleanup testing
    for name in ["subdir_omicron", "subdir_pi"]:
        subdir_path = base_path / name
        create_file_with_content(subdir_path / "main_data.txt", 1, "pattern")
        create_file_with_content(subdir_path / "auxiliary_data.txt", 1, "pattern")
    
    print(f"✅ Created Test Case 08: {base_path}")

def create_test_case_09_edge_cases():
    """Test Case 09: Edge Cases - Testing various edge cases"""
    base_path = Path("/opt/sca/data/scratch/test_09_edge_cases/data")
    
    # Create edge case scenarios
    # Empty subdirectory
    (base_path / "subdir_empty").mkdir(parents=True, exist_ok=True)
    
    # Subdirectory with many small files
    subdir_many_files = base_path / "subdir_many_files"
    for i in range(15):  # More than 10 to test the "first 10" limit
        create_file_with_content(subdir_many_files / f"tiny_file_{i+1}.txt", 0.1, "pattern")
    
    # Subdirectory with hidden files
    subdir_hidden = base_path / "subdir_hidden"
    create_file_with_content(subdir_hidden / ".hidden_file.txt", 1, "pattern")
    create_file_with_content(subdir_hidden / "visible_file.txt", 1, "pattern")
    
    print(f"✅ Created Test Case 09: {base_path}")

def create_test_case_10_concurrent():
    """Test Case 10: Concurrent Execution - Testing parallel operations"""
    base_path = Path("/opt/sca/data/scratch/test_10_concurrent/data")
    
    # Create multiple subdirectories for parallel processing
    for i in range(5):  # More than default worker count to test parallelization
        subdir_path = base_path / f"subdir_parallel_{i+1}"
        create_file_with_content(subdir_path / f"data_{i+1}.txt", 1, "pattern")
        create_file_with_content(subdir_path / f"metadata_{i+1}.json", 1, "pattern")
    
    print(f"✅ Created Test Case 10: {base_path}")

def create_test_case_11_large_files():
    """Test Case 11: Large Files - Testing with multi-GB files"""
    base_path = Path("/opt/sca/data/scratch/test_11_large_files/data")
    
    # Create subdirectory with large files (simulated for testing)
    subdir_path = base_path / "subdir_large_files"
    
    # For testing purposes, create smaller files but simulate large file behavior
    # In real testing, you might want to create actual large files
    create_file_with_content(subdir_path / "large_file_1.dat", 10, "zeros")  # 10MB
    create_file_with_content(subdir_path / "large_file_2.dat", 10, "zeros")  # 10MB
    
    print(f"✅ Created Test Case 11: {base_path}")

def create_test_case_12_special_chars():
    """Test Case 12: Special Characters - Testing with special characters in names"""
    base_path = Path("/opt/sca/data/scratch/test_12_special_chars/data")
    
    # Create subdirectories with special characters
    special_names = [
        "subdir_with-spaces",
        "subdir_with_underscores",
        "subdir.with.dots",
        "subdir_with_numbers_123"
    ]
    
    for name in special_names:
        subdir_path = base_path / name
        create_file_with_content(subdir_path / "data.txt", 1, "pattern")
    
    print(f"✅ Created Test Case 12: {base_path}")

def main():
    """Create all test cases."""
    print("🚀 Creating comprehensive test data for register_ondemand.py...")
    print()
    
    try:
        # Create all test cases
        create_test_case_01_basic()
        create_test_case_02_renaming()
        create_test_case_03_hard_linking()
        create_test_case_04_idempotency()
        create_test_case_05_large_dataset()
        create_test_case_06_mixed_content()
        create_test_case_07_error_handling()
        create_test_case_08_cleanup()
        create_test_case_09_edge_cases()
        create_test_case_10_concurrent()
        create_test_case_11_large_files()
        create_test_case_12_special_chars()
        
        print()
        print("🎉 All test cases created successfully!")
        print()
        print("📊 Test Data Summary:")
        print("   - 12 test cases created")
        print("   - Various file sizes (0.1MB to 10MB)")
        print("   - Different directory structures")
        print("   - Edge cases and special scenarios")
        print("   - Ready for comprehensive testing")
        
    except Exception as e:
        print(f"❌ Error creating test data: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
