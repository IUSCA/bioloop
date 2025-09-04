#!/usr/bin/env python3
"""
Simple test data creation script to test the new cleanup logic.
"""

import os
from pathlib import Path

def create_test_data():
    """Create simple test data for cleanup testing."""
    base_path = Path("/opt/sca/data/scratch/test_cleanup_new_logic/data")
    
    # Create subdirectories
    for i in range(2):
        subdir_path = base_path / f"subdir_{i+1}"
        subdir_path.mkdir(parents=True, exist_ok=True)
        
        # Create a simple file
        with open(subdir_path / "test.txt", "w") as f:
            f.write(f"Test data for subdir_{i+1}")
    
    print(f"✅ Created test data at: {base_path}")

if __name__ == "__main__":
    create_test_data()
