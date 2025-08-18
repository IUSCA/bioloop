#!/usr/bin/env python3
"""
Test script to demonstrate production-like idempotent cleanup behavior.
This creates hard-links manually, then runs the script to show how it handles
existing artifacts from previous runs.
"""

import os
import time
import subprocess
import shutil
from pathlib import Path

def create_test_data():
    """Create test data with multiple subdirectories."""
    base_path = Path("/opt/sca/data/scratch/test_production_idempotent/data")
    
    # Create multiple subdirectories
    for i in range(3):
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

def create_manual_hard_links(base_path: Path, scenario: str):
    """Manually create hard-links to simulate artifacts from previous runs."""
    renamed_dir = base_path.parent / f".{base_path.name}__renamed"
    
    if scenario == "all_clean":
        print(f"   🧹 Scenario: All hard-links already cleaned up")
        if renamed_dir.exists():
            shutil.rmtree(renamed_dir)
        return 0
        
    elif scenario == "partial_cleanup":
        print(f"   🧹 Scenario: Partial cleanup from previous run (2 out of 3 cleaned)")
        renamed_dir.mkdir(exist_ok=True)
        
        # Create only 1 hard-link (simulating 2 were already cleaned up)
        hard_link_dir = renamed_dir / "IDEMPOTENT-subdir_3-TEST"
        hard_link_dir.mkdir(exist_ok=True)
        with open(hard_link_dir / "dummy_file.txt", "w") as f:
            f.write("Dummy hard-link content")
        
        return 1
        
    elif scenario == "no_cleanup":
        print(f"   🧹 Scenario: No cleanup from previous run (all 3 hard-links remain)")
        renamed_dir.mkdir(exist_ok=True)
        
        # Create all 3 hard-links
        for i in range(1, 4):
            hard_link_dir = renamed_dir / f"IDEMPOTENT-subdir_{i}-TEST"
            hard_link_dir.mkdir(exist_ok=True)
            with open(hard_link_dir / "dummy_file.txt", "w") as f:
                f.write(f"Dummy hard-link content for subdir_{i}")
        
        return 3
    
    return 0

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

def run_register_script(base_path: Path, scenario: str, run_number: int):
    """Run the register_ondemand.py script."""
    print(f"\n🚀 Run #{run_number}: {scenario.replace('_', ' ').title()}")
    
    # Create manual hard-links based on scenario
    initial_count = create_manual_hard_links(base_path, scenario)
    
    # Check initial state
    print(f"   Initial state:")
    check_hard_link_state(base_path)
    
    # Run the script with dry-run to see what it would do
    cmd = [
        "python", "-m", "workers.scripts.register_ondemand",
        str(base_path),
        "--dataset-type=DATA_PRODUCT",
        "--ingest-subdirs=True",
        "--prefix=IDEMPOTENT",
        "--suffix=TEST",
        f"--description=Test Run #{run_number}: {scenario} scenario",
        "--dry-run=True"
    ]
    
    print(f"   Command: {' '.join(cmd)}")
    
    try:
        # Run the script
        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/opt/sca/app")
        
        if result.returncode == 0:
            print(f"   ✅ Script executed successfully")
            print(f"   📝 Key output:")
            # Show relevant lines about cleanup
            lines = result.stdout.strip().split('\n')
            for line in lines:
                if any(keyword in line.lower() for keyword in ['clean', 'hard-link', 'renamed', 'directory']):
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

def main():
    """Run the production-like idempotent cleanup test."""
    print("🧪 Testing Production-Like Idempotent Cleanup Behavior")
    print("=" * 65)
    
    # Create test data
    base_path = create_test_data()
    
    # Test different scenarios
    scenarios = [
        "all_clean",           # No artifacts from previous run
        "partial_cleanup",     # Some artifacts remain from previous run
        "no_cleanup"           # All artifacts remain from previous run
    ]
    
    for i, scenario in enumerate(scenarios, 1):
        print(f"\n" + "="*60)
        print(f"🔄 SCENARIO #{i}: {scenario.replace('_', ' ').title()}")
        print(f"="*60)
        
        # Run the script for this scenario
        remaining_count = run_register_script(base_path, scenario, i)
        
        if i < len(scenarios):
            print(f"\n⏳ Waiting 2 seconds before next scenario...")
            time.sleep(2)
    
    print(f"\n🎉 Production-like idempotent cleanup test completed!")
    print(f"   This demonstrates how the script handles different artifact states")
    print(f"   from previous runs and continues cleanup where it left off.")
    
    # Final cleanup
    print(f"\n🧹 Final cleanup of test data...")
    shutil.rmtree(base_path.parent)
    print(f"   ✅ Test data cleaned up")

if __name__ == "__main__":
    main()
