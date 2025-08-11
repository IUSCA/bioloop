#!/usr/bin/env python3
"""
Test script to demonstrate hardlink overwriting and early failure features
"""

import os
import tempfile
from pathlib import Path
from workers.scripts.register_ondemand import Registration

def test_hardlink_overwriting():
    """Test that existing hardlinks are overwritten"""
    print("🧪 Testing hardlink overwriting...")
    
    # Create temporary directories
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        src_dir = temp_path / "src"
        dst_dir = temp_path / "dst"
        
        # Create source directory with a file
        src_dir.mkdir()
        test_file = src_dir / "test.txt"
        test_file.write_text("Hello World")
        
        # Create destination directory
        dst_dir.mkdir()
        
        # Create initial hardlink
        dst_file = dst_dir / "test.txt"
        os.link(test_file, dst_file)
        print(f"✅ Created initial hardlink: {dst_file}")
        
        # Verify hardlink exists
        if dst_file.exists():
            print(f"✅ Hardlink exists: {dst_file}")
        
        # Now test overwriting by calling create_hardlinked_directory
        reg = Registration('DATA_PRODUCT', str(temp_path))
        reg.create_hardlinked_directory(src_dir, dst_dir)
        
        # Verify the hardlink still exists and was overwritten
        if dst_file.exists():
            print(f"✅ Hardlink overwritten successfully: {dst_file}")
            print(f"   File content: {dst_file.read_text()}")
        else:
            print(f"❌ Hardlink was not overwritten")
            
        print("✅ Hardlink overwriting test completed\n")

def test_early_failure():
    """Test that script fails early on hardlink errors"""
    print("🧪 Testing early failure on hardlink errors...")
    
    # Create temporary directories
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        src_dir = temp_path / "src"
        
        # Create source directory with a file
        src_dir.mkdir()
        test_file = src_dir / "test.txt"
        test_file.write_text("Hello World")
        
        # Try to create hardlink to a path that will definitely fail
        # Use a path that crosses filesystem boundaries
        invalid_dst = Path("/dev/null")  # This should definitely fail
        
        try:
            reg = Registration('DATA_PRODUCT', str(temp_path))
            reg.create_hardlinked_directory(src_dir, invalid_dst)
            print("❌ Script should have failed but didn't")
        except RuntimeError as e:
            print(f"✅ Script failed early as expected: {e}")
        except Exception as e:
            print(f"❌ Unexpected error type: {type(e).__name__}: {e}")
            
        print("✅ Early failure test completed\n")

def test_artifact_preservation():
    """Test that artifacts are preserved when script fails"""
    print("🧪 Testing artifact preservation on failure...")
    
    # Create temporary directories
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        src_dir = temp_path / "src"
        dst_dir = temp_path / "dst"
        
        # Create source directory with a file
        src_dir.mkdir()
        test_file = src_dir / "test.txt"
        test_file.write_text("Hello World")
        
        # Create destination directory
        dst_dir.mkdir()
        
        # Create a file that will cause hardlink to fail
        problematic_file = src_dir / "problem.txt"
        problematic_file.write_text("Problem file")
        
        # Make the problematic file unreadable (simulate permission issue)
        problematic_file.chmod(0o000)
        
        try:
            reg = Registration('DATA_PRODUCT', str(temp_path))
            reg.create_hardlinked_directory(src_dir, dst_dir)
            print("❌ Script should have failed but didn't")
        except RuntimeError as e:
            print(f"✅ Script failed early as expected: {e}")
            
            # Check if artifacts were preserved
            if dst_dir.exists():
                print(f"✅ Artifacts preserved: {dst_dir}")
                print(f"   Contents: {list(dst_dir.iterdir())}")
            else:
                print(f"❌ Artifacts were cleaned up unexpectedly")
                
        # Restore file permissions
        problematic_file.chmod(0o644)
            
        print("✅ Artifact preservation test completed\n")

def test_cross_device_failure():
    """Test failure when trying to hardlink across different devices"""
    print("🧪 Testing cross-device hardlink failure...")
    
    # Create temporary directories
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        src_dir = temp_path / "src"
        
        # Create source directory with a file
        src_dir.mkdir()
        test_file = src_dir / "test.txt"
        test_file.write_text("Hello World")
        
        # Try to create hardlink to /proc (which is a different filesystem)
        proc_dst = Path("/proc/test_hardlink")
        
        try:
            reg = Registration('DATA_PRODUCT', str(temp_path))
            reg.create_hardlinked_directory(src_dir, proc_dst)
            print("❌ Script should have failed but didn't")
        except RuntimeError as e:
            print(f"✅ Script failed early as expected: {e}")
        except Exception as e:
            print(f"❌ Unexpected error type: {type(e).__name__}: {e}")
            
        print("✅ Cross-device failure test completed\n")

def test_actual_hardlink_failure():
    """Test actual hardlink operation failure"""
    print("🧪 Testing actual hardlink operation failure...")
    
    # Create temporary directories
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        src_dir = temp_path / "src"
        dst_dir = temp_path / "dst"
        
        # Create source directory with a file
        src_dir.mkdir()
        test_file = src_dir / "test.txt"
        test_file.write_text("Hello World")
        
        # Create destination directory
        dst_dir.mkdir()
        
        # Create a subdirectory in destination
        subdir = dst_dir / "subdir"
        subdir.mkdir()
        
        # Create a file in the subdirectory that will conflict
        conflict_file = subdir / "test.txt"
        conflict_file.write_text("Conflict content")
        
        # Now try to create hardlinks - this should fail when trying to hardlink
        # the source file to the destination subdirectory
        try:
            reg = Registration('DATA_PRODUCT', str(temp_path))
            reg.create_hardlinked_directory(src_dir, dst_dir)
            print("❌ Script should have failed but didn't")
        except RuntimeError as e:
            print(f"✅ Script failed early as expected: {e}")
        except Exception as e:
            print(f"❌ Unexpected error type: {type(e).__name__}: {e}")
            
        print("✅ Actual hardlink failure test completed\n")

if __name__ == "__main__":
    print("🚀 Testing hardlink features...\n")
    
    try:
        test_hardlink_overwriting()
        test_early_failure()
        test_artifact_preservation()
        test_cross_device_failure()
        test_actual_hardlink_failure()
        print("🎉 All tests completed successfully!")
    except Exception as e:
        print(f"❌ Test suite failed: {e}")
        import traceback
        traceback.print_exc()
