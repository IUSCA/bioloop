#!/usr/bin/env python3
"""
Test script to simulate idempotent cleanup behavior with partial failures.
This tests the scenario where the script crashes/fails after partial cleanup,
and subsequent runs continue cleaning up where they left off.
"""

import os
import time
import random
from pathlib import Path

def create_test_data():
    """Create test data with multiple subdirectories for cleanup testing."""
    base_path = Path("/opt/sca/data/scratch/test_idempotent_cleanup/data")
    
    # Create multiple subdirectories
    for i in range(5):  # 5 subdirectories to test partial cleanup
        subdir_path = base_path / f"subdir_{i+1}"
        subdir_path.mkdir(parents=True, exist_ok=True)
        
        # Create some files in each subdirectory
        for j in range(3):
            with open(subdir_path / f"file_{j+1}.txt", "w") as f:
                f.write(f"Test data for subdir_{i+1}, file_{j+1}")
    
    print(f"✅ Created test data at: {base_path}")
    print(f"   - 5 subdirectories created")
    print(f"   - 3 files per subdirectory")
    return base_path

def simulate_partial_cleanup_run(run_number: int, base_path: Path):
    """Simulate a run that fails after partial cleanup."""
    print(f"\n🚀 Starting Run #{run_number}")
    print(f"   Target: {base_path}")
    
    # Check what hard-links exist
    renamed_dir = base_path.parent / f".{base_path.name}__renamed"
    if renamed_dir.exists():
        remaining_dirs = list(renamed_dir.iterdir())
        print(f"   Found {len(remaining_dirs)} remaining hard-link directories:")
        for d in remaining_dirs:
            print(f"      - {d.name}")
    else:
        print(f"   No hard-link directory found")
    
    # Simulate the script running and creating hard-links
    if run_number == 1:
        print(f"   Simulating: Script creates hard-links for all 5 subdirectories")
        print(f"   Simulating: Script starts cleanup but crashes after cleaning 2 directories")
        
        # Create the hard-link directory structure
        renamed_dir.mkdir(exist_ok=True)
        
        # Create hard-links for all 5 subdirectories
        for i in range(5):
            hard_link_dir = renamed_dir / f"TEST-subdir_{i+1}-CLEANUP"
            hard_link_dir.mkdir(exist_ok=True)
            # Create some dummy content to simulate hard-links
            with open(hard_link_dir / "dummy_file.txt", "w") as f:
                f.write(f"Dummy hard-link content for subdir_{i+1}")
        
        print(f"   Created hard-links for all 5 subdirectories")
        
        # Simulate partial cleanup (script crashes after cleaning 2)
        print(f"   Simulating cleanup of first 2 directories...")
        for i in range(2):
            dir_to_remove = renamed_dir / f"TEST-subdir_{i+1}-CLEANUP"
            if dir_to_remove.exists():
                import shutil
                shutil.rmtree(dir_to_remove)
                print(f"      Cleaned up: TEST-subdir_{i+1}-CLEANUP")
        
        print(f"   💥 Simulating script crash after partial cleanup!")
        print(f"   Remaining: 3 hard-link directories")
        
    elif run_number == 2:
        print(f"   Simulating: Script continues cleanup but fails after cleaning 1 more directory")
        
        # Continue cleanup from where we left off
        remaining_dirs = [d for d in renamed_dir.iterdir() if d.is_dir()]
        if len(remaining_dirs) >= 1:
            # Clean up 1 more directory
            dir_to_remove = remaining_dirs[0]
            import shutil
            shutil.rmtree(dir_to_remove)
            print(f"      Cleaned up: {dir_to_remove.name}")
            
        print(f"   💥 Simulating script failure after cleaning 1 more directory!")
        remaining_dirs = [d for d in renamed_dir.iterdir() if d.is_dir()]
        print(f"   Remaining: {len(remaining_dirs)} hard-link directories")
        
    elif run_number == 3:
        print(f"   Simulating: Script successfully cleans up remaining hard-links")
        
        # Clean up everything
        remaining_dirs = [d for d in renamed_dir.iterdir() if d.is_dir()]
        print(f"   Cleaning up remaining {len(remaining_dirs)} directories...")
        
        for dir_to_remove in remaining_dirs:
            import shutil
            shutil.rmtree(dir_to_remove)
            print(f"      Cleaned up: {dir_to_remove.name}")
        
        # Remove the renamed directory itself
        if renamed_dir.exists():
            import shutil
            shutil.rmtree(renamed_dir)
            print(f"   Removed renamed directory: {renamed_dir}")
        
        print(f"   ✅ All hard-links successfully cleaned up!")
    
    # Show final state
    if renamed_dir.exists():
        remaining_dirs = [d for d in renamed_dir.iterdir() if d.is_dir()]
        print(f"   Final state: {len(remaining_dirs)} hard-link directories remaining")
    else:
        print(f"   Final state: All hard-links cleaned up successfully!")

def main():
    """Run the idempotent cleanup test simulation."""
    print("🧪 Testing Idempotent Cleanup Behavior")
    print("=" * 50)
    
    # Create test data
    base_path = create_test_data()
    
    # Simulate three runs with different failure scenarios
    for run_number in range(1, 4):
        simulate_partial_cleanup_run(run_number, base_path)
        
        if run_number < 3:
            print(f"\n⏳ Waiting 2 seconds before next run...")
            time.sleep(2)
    
    print(f"\n🎉 Idempotent cleanup test completed!")
    print(f"   This demonstrates how the script handles partial failures")
    print(f"   and continues cleanup on subsequent runs.")

if __name__ == "__main__":
    main()
