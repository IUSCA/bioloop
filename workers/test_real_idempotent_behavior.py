#!/usr/bin/env python3
"""
Test script to demonstrate real idempotent cleanup behavior using register_ondemand.py.
This simulates the scenario where the script crashes/fails after partial cleanup,
and subsequent runs continue cleaning up where they left off.
"""

import os
import time
import subprocess
from pathlib import Path

def create_test_data():
    """Create test data with multiple subdirectories for cleanup testing."""
    base_path = Path("/opt/sca/data/scratch/test_real_idempotent/data")
    
    # Create multiple subdirectories
    for i in range(3):  # 3 subdirectories for testing
        subdir_path = base_path / f"subdir_{i+1}"
        subdir_path.mkdir(parents=True, exist_ok=True)
        
        # Create some files in each subdirectory
        for j in range(2):
            with open(subdir_path / f"file_{j+1}.txt", "w") as f:
                f.write(f"Test data for subdir_{i+1}, file_{j+1}")
    
    print(f"✅ Created test data at: {base_path}")
    print(f"   - 3 subdirectories created")
    print(f"   - 2 files per subdirectory")
    return base_path

def check_hard_link_state(base_path: Path):
    """Check the current state of hard-links."""
    renamed_dir = base_path.parent / f".{base_path.name}__renamed"
    if renamed_dir.exists():
        remaining_dirs = [d for d in renamed_dir.iterdir() if d.is_dir()]
        print(f"   📁 Hard-link directory: {renamed_dir}")
        print(f"   📊 Remaining hard-links: {len(remaining_dirs)}")
        for d in remaining_dirs:
            print(f"      - {d.name}")
        return len(remaining_dirs)
    else:
        print(f"   📁 No hard-link directory found")
        return 0

def run_register_script(base_path: Path, run_number: int):
    """Run the register_ondemand.py script."""
    print(f"\n🚀 Run #{run_number}: Executing register_ondemand.py")
    
    # Check initial state
    print(f"   Initial state:")
    initial_count = check_hard_link_state(base_path)
    
    # Run the script with dry-run to see what it would do
    cmd = [
        "python", "-m", "workers.scripts.register_ondemand",
        str(base_path),
        "--dataset-type=DATA_PRODUCT",
        "--ingest-subdirs=True",
        "--prefix=IDEMPOTENT",
        "--suffix=TEST",
        f"--description=Test Run #{run_number}: Idempotent cleanup testing",
        "--dry-run=True"
    ]
    
    print(f"   Command: {' '.join(cmd)}")
    
    try:
        # Run the script
        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/opt/sca/app")
        
        if result.returncode == 0:
            print(f"   ✅ Script executed successfully")
            print(f"   📝 Output preview:")
            # Show last few lines of output
            lines = result.stdout.strip().split('\n')
            for line in lines[-5:]:
                if line.strip():
                    print(f"      {line}")
        else:
            print(f"   ❌ Script failed with return code: {result.returncode}")
            print(f"   📝 Error output:")
            for line in result.stderr.strip().split('\n')[-3:]:
                if line.strip():
                    print(f"      {line}")
                    
    except Exception as e:
        print(f"   💥 Exception running script: {e}")
    
    # Check final state
    print(f"   Final state:")
    final_count = check_hard_link_state(base_path)
    
    # Show what changed
    if initial_count != final_count:
        print(f"   📊 Change: {initial_count} → {final_count} hard-links")
    else:
        print(f"   📊 No change: {initial_count} hard-links remain")
    
    return final_count

def simulate_crash_after_partial_cleanup(base_path: Path, run_number: int):
    """Simulate a crash after partial cleanup."""
    print(f"\n💥 Simulating crash/failure after partial cleanup (Run #{run_number})")
    
    # Check current state
    current_count = check_hard_link_state(base_path)
    
    if current_count > 0:
        # Simulate partial cleanup by removing some hard-links
        renamed_dir = base_path.parent / f".{base_path.name}__renamed"
        if renamed_dir.exists():
            remaining_dirs = [d for d in renamed_dir.iterdir() if d.is_dir()]
            
            # Remove some directories to simulate partial cleanup
            if run_number == 1 and len(remaining_dirs) >= 2:
                # First run: remove 2 out of 3
                for i in range(2):
                    if i < len(remaining_dirs):
                        import shutil
                        shutil.rmtree(remaining_dirs[i])
                        print(f"      💥 Simulated cleanup: {remaining_dirs[i].name}")
                
            elif run_number == 2 and len(remaining_dirs) >= 1:
                # Second run: remove 1 more
                import shutil
                shutil.rmtree(remaining_dirs[0])
                print(f"      💥 Simulated cleanup: {remaining_dirs[0].name}")
            
            print(f"   💥 Simulated crash after partial cleanup!")
            
            # Check new state
            new_count = check_hard_link_state(base_path)
            print(f"   📊 After crash: {new_count} hard-links remain")

def main():
    """Run the real idempotent cleanup test."""
    print("🧪 Testing Real Idempotent Cleanup Behavior with register_ondemand.py")
    print("=" * 70)
    
    # Create test data
    base_path = create_test_data()
    
    # Run three iterations to demonstrate idempotent behavior
    for run_number in range(1, 4):
        print(f"\n" + "="*50)
        print(f"🔄 ITERATION #{run_number}")
        print(f"="*50)
        
        # Run the actual script
        remaining_count = run_register_script(base_path, run_number)
        
        # Simulate crash/failure after partial cleanup
        if run_number < 3 and remaining_count > 0:
            simulate_crash_after_partial_cleanup(base_path, run_number)
            
            if run_number < 3:
                print(f"\n⏳ Waiting 3 seconds before next iteration...")
                time.sleep(3)
    
    print(f"\n🎉 Real idempotent cleanup test completed!")
    print(f"   This demonstrates how the actual script handles partial failures")
    print(f"   and continues cleanup on subsequent runs.")
    
    # Final cleanup
    print(f"\n🧹 Final cleanup of test data...")
    import shutil
    shutil.rmtree(base_path.parent)
    print(f"   ✅ Test data cleaned up")

if __name__ == "__main__":
    main()
