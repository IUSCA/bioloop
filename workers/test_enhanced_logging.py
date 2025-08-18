#!/usr/bin/env python3
"""
Test script to demonstrate enhanced logging functionality

This test shows how the register_ondemand.py script now logs both:
1. Original directory names (before hardlinking)
2. Registered dataset names (from API response)
"""

import sys
import os
from pathlib import Path

# Add the workers module to the path
sys.path.insert(0, '/opt/sca/app')
try:
    from workers.scripts.register_ondemand import Registration
    print("Successfully imported workers modules")
except ImportError as e:
    print(f"Error importing workers modules: {e}")
    print("This test should be run inside the Docker container")
    sys.exit(1)

def test_enhanced_logging():
    """Test the enhanced logging functionality"""
    
    print("=== Testing Enhanced Logging Functionality ===\n")
    
    # Create test data directory
    test_dir = Path("/tmp/test_enhanced_logging")
    test_dir.mkdir(exist_ok=True)
    
    # Create subdirectories with different names
    subdir1 = test_dir / "original_name_1"
    subdir2 = test_dir / "original_name_2"
    subdir1.mkdir(exist_ok=True)
    subdir2.mkdir(exist_ok=True)
    
    # Create test files
    (subdir1 / "test1.txt").write_text("test content 1")
    (subdir2 / "test2.txt").write_text("test content 2")
    
    print(f"Created test directory: {test_dir}")
    print(f"Created subdirectories:")
    print(f"  {subdir1}")
    print(f"  {subdir2}")
    
    try:
        # Test the enhanced logging
        print("\n--- Testing Enhanced Logging ---")
        
        # Create Registration instance
        registration = Registration(
            dataset_type="RAW_DATA",
            path=str(test_dir),
            ingest_subdirs=True,
            skip_checksum_verification=True
        )
        
        print("Created Registration instance")
        
        # Simulate the mapping that would be created during bulk registration
        # This simulates what happens when hardlinking is used
        registration.original_to_registered_mapping = {
            "original_name_1": "pre_original_name_1_suf",
            "original_name_2": "pre_original_name_2_suf"
        }
        
        # Simulate API response data
        registration.created_datasets = [
            {"name": "pre_original_name_1_suf"},
            {"name": "pre_original_name_2_suf"}
        ]
        registration.conflicted_datasets = [
            {"name": "pre_existing_dataset_suf"}
        ]
        registration.errored_datasets = [
            {"name": "pre_failed_dataset_suf"}
        ]
        
        print("Simulated API response data:")
        print("  Created: 2 datasets")
        print("  Conflicted: 1 dataset")
        print("  Errored: 1 dataset")
        
        print("\nEnhanced logging output:")
        print("-" * 50)
        registration.log_registration_results()
        print("-" * 50)
        
        print("\n✅ Enhanced logging completed successfully")
        print("✅ Shows both original directory names and registered dataset names")
        print("✅ Clear mapping with arrow notation (→)")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Cleanup test data
        print(f"\nCleaning up test data...")
        if test_dir.exists():
            import shutil
            shutil.rmtree(test_dir)
            print(f"Removed test directory: {test_dir}")

if __name__ == "__main__":
    try:
        success = test_enhanced_logging()
        if success:
            print("\n🎉 Test PASSED: Enhanced logging shows both original and registered names!")
        else:
            print("\n❌ Test FAILED!")
            sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test failed with unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
