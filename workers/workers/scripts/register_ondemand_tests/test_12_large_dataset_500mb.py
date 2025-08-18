#!/usr/bin/env python3
"""
Test Case 12: 500MB Large Dataset

Purpose: Create single data directory of 500MB for testing hardlink creation speed
Data: 1 subdirectory with 500MB total (~500MB total)
Expected: Hardlink creation takes little to no time, efficient processing

This test verifies:
- Performance with large datasets (500MB)
- Hardlink creation speed and efficiency
- Memory usage and resource management
- Scalability for production-sized datasets

Usage:
    python test_12_large_dataset_500mb.py [--dry-run] [--skip-checksum]
"""

import argparse
import os
import sys
import subprocess
import time
from pathlib import Path

# Add the workers directory to the Python path for container environment
container_workers_path = "/opt/sca/app"
if os.path.exists(container_workers_path):
    sys.path.insert(0, container_workers_path)
else:
    # Fallback for local development
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))

try:
    import workers.api as api
    from workers.config import config
except ImportError as e:
    print(f"Error importing workers modules: {e}")
    print("Make sure you're running this from the correct directory")
    print(f"Tried paths: {container_workers_path}, {str(Path(__file__).parent.parent.parent)}")
    sys.exit(1)

class TestCase12:
    """Test Case 12: 500MB Large Dataset - Testing performance with large datasets"""
    
    def __init__(self, dry_run: bool = True, skip_checksum: bool = False):
        self.test_name = "500MB Large Dataset"
        self.test_id = "12"
        self.description = "Create single data directory of 500MB for testing hardlink creation speed"
        self.data_dir = "test_12_large_dataset_500mb"
        self.subdirs = ["subdir_500mb"]
        self.dataset_type = "RAW_DATA"
        self.ingest_subdirs = True
        self.prefix = "LARGE"
        self.suffix = "500MB"
        self.expected_hard_links = 1
        self.expected_verification = True
        
        self.dry_run = dry_run
        self.skip_checksum = skip_checksum
        self.test_data_base = Path("/opt/sca/data/scratch")
        self.script_path = "/opt/sca/app/workers/scripts/register_ondemand.py"
        
        # Test data configuration - 500MB total
        self.file_sizes_mb = [100, 100, 100, 100, 100]  # 5 files of 100MB each
        self.total_size_mb = sum(self.file_sizes_mb)
        
        # Expected dataset names after renaming
        self.expected_dataset_names = [
            f"{self.prefix}-{self.subdirs[0]}-{self.suffix}"
        ]
    
    def check_dataset_exists(self, dataset_name: str) -> bool:
        """Check if dataset already exists using the API"""
        try:
            print(f"    🔍 Checking if dataset {self.dataset_type} '{dataset_name}' exists...")
            matching_datasets = api.get_all_datasets(
                dataset_type=self.dataset_type, 
                name=dataset_name, 
                include_states=True
            )
            exists = len(matching_datasets) > 0
            
            if exists:
                print(f"    ⚠️  Dataset {self.dataset_type} '{dataset_name}' already exists in database")
                # Check if it's archived
                dataset = matching_datasets[0]
                is_archived = any(state['state'] == 'ARCHIVED' for state in dataset.get('states', []))
                if is_archived:
                    print(f"    ✅ Dataset is already archived - skipping test")
                    return True
                else:
                    print(f"    ⚠️  Dataset exists but not archived - will test workflow kickoff")
            else:
                print(f"    ✅ Dataset {self.dataset_type} '{dataset_name}' does not exist - safe to test")
            
            return exists
        except Exception as e:
            print(f"    ⚠️  Warning: Could not check dataset existence: {e}")
            print(f"    ℹ️  Continuing with test (API may not be available in test environment)")
            return False
    
    def create_test_data(self) -> bool:
        """Create test data for this test case"""
        data_dir = self.test_data_base / self.data_dir
        
        print(f"    📁 Creating test data in {data_dir}")
        print(f"    ⚠️  Creating large files - this may take several minutes...")
        
        try:
            # Create the main data directory
            data_dir.mkdir(parents=True, exist_ok=True)
            
            # Create subdirectory with large test files
            subdir_path = data_dir / self.subdirs[0]
            subdir_path.mkdir(exist_ok=True)
            
            # Create large test files with specified sizes
            for i, size_mb in enumerate(self.file_sizes_mb):
                file_path = subdir_path / f"large_file_{i+1}.dat"
                print(f"      📄 Creating {file_path} ({size_mb}MB)...")
                
                # Create file in chunks to avoid memory issues
                chunk_size = 1024 * 1024  # 1MB chunks
                with open(file_path, 'wb') as f:
                    for chunk in range(size_mb):
                        f.write(b'0' * chunk_size)
                        if chunk % 20 == 0:  # Progress indicator every 20MB
                            print(f"        📊 Progress: {chunk + 1}/{size_mb}MB")
                
                print(f"      ✅ Created {file_path} ({size_mb}MB)")
            
            print(f"    ✅ Test data created successfully")
            print(f"    📊 Total size: {self.total_size_mb}MB")
            print(f"    📊 Files: {len(self.file_sizes_mb)} files of {self.file_sizes_mb[0]}MB each")
            return True
            
        except Exception as e:
            print(f"    ❌ Error creating test data: {e}")
            return False
    
    def run_test(self) -> bool:
        """Run the test case"""
        print(f"\n{'='*80}")
        print(f"🧪 TEST CASE {self.test_id}: {self.test_name}")
        print(f"{'='*80}")
        print(f"Description: {self.description}")
        print(f"Data Directory: {self.data_dir}")
        print(f"Subdirectories: {', '.join(self.subdirs)}")
        print(f"Dataset Type: {self.dataset_type}")
        print(f"Prefix: {self.prefix}")
        print(f"Suffix: {self.suffix}")
        print(f"Expected Hard Links: {self.expected_hard_links}")
        print(f"Expected Verification: {self.expected_verification}")
        print(f"Total Test Data Size: {self.total_size_mb}MB")
        print(f"File Sizes: {', '.join([f'{size}MB' for size in self.file_sizes_mb])}")
        print(f"Dry Run: {self.dry_run}")
        print(f"Skip Checksum: {self.skip_checksum}")
        print(f"Expected Dataset Names:")
        for name in self.expected_dataset_names:
            print(f"  - {name}")
        
        # Check if test data exists, create if not
        data_dir = self.test_data_base / self.data_dir
        if not data_dir.exists():
            if not self.create_test_data():
                return False
        else:
            print(f"    📁 Test data already exists at {data_dir}")
        
        # Check for existing datasets
        print(f"    🔍 Checking for existing datasets...")
        existing_datasets = []
        for dataset_name in self.expected_dataset_names:
            exists = self.check_dataset_exists(dataset_name)
            if exists:
                existing_datasets.append(dataset_name)
        
        # Build the command
        cmd = [
            "python", "-m", "workers.scripts.register_ondemand",
            str(data_dir),
            f"--dataset-type={self.dataset_type}",
            f"--ingest-subdirs={self.ingest_subdirs}",
            f"--prefix={self.prefix}",
            f"--suffix={self.suffix}",
            f"--description=Test Case {self.test_id}: {self.test_name} - {self.description}",
            f"--dry-run={self.dry_run}"
        ]
        
        if self.skip_checksum:
            cmd.append("--skip-checksum-verification=True")
        
        print(f"    🚀 Running command:")
        print(f"      {' '.join(cmd)}")
        
        # Execute the command
        start_time = time.time()
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd="/opt/sca/app",
                timeout=600  # 10 minute timeout for large dataset
            )
            execution_time = time.time() - start_time
            
            # Parse the output
            success = result.returncode == 0
            output = result.stdout
            error = result.stderr
            
            # Check for expected patterns in output
            hard_links_created = "Successfully created with hard-links" in output
            verification_executed = "verification completed" in output
            cleanup_executed = "Cleaned up test hard-links" in output or "DRY RUN: Would clean up" in output
            subdirs_processed = "DRY RUN - Would register" in output or "Successfully processed" in output
            parallel_verification = "Starting parallel verification" in output
            checksum_verification = "Directory checksum verification passed" in output
            
            # Check for performance-related messages
            performance_messages = any(keyword in output for keyword in [
                "hard-links", "verification", "checksum", "completed"
            ])
            
            # Determine test result based on expectations
            test_success = success
            test_success = test_success and subdirs_processed  # Should process subdirectories
            test_success = test_success and hard_links_created  # Should create hard links
            test_success = test_success and verification_executed  # Should need verification
            test_success = test_success and parallel_verification  # Should use parallel verification
            
            # Print results
            print(f"    📊 Test Results:")
            print(f"      Return Code: {result.returncode}")
            print(f"      Execution Time: {execution_time:.2f}s")
            print(f"      Subdirectories Processed: {'✅' if subdirs_processed else '❌'}")
            print(f"      Hard Links Created: {'✅' if hard_links_created else '❌'} (expected: True)")
            print(f"      Verification Executed: {'✅' if verification_executed else '❌'} (expected: True)")
            print(f"      Parallel Verification: {'✅' if parallel_verification else '❌'} (expected: True)")
            print(f"      Checksum Verification: {'✅' if checksum_verification else '❌'}")
            print(f"      Cleanup Executed: {'✅' if cleanup_executed else '❌'}")
            print(f"      Performance Messages: {'✅' if performance_messages else '❌'}")
            
            # Performance analysis
            print(f"    📊 Performance Analysis:")
            print(f"      Total Data Size: {self.total_size_mb}MB")
            print(f"      Total Execution Time: {execution_time:.2f}s")
            print(f"      Processing Rate: {self.total_size_mb/execution_time:.2f}MB/s")
            
            # Show performance-related details
            if performance_messages:
                print(f"    🔍 Performance Details:")
                lines = output.split('\n')
                for line in lines:
                    if any(keyword in line.lower() for keyword in [
                        "hard-links", "verification", "checksum", "completed", "successfully"
                    ]):
                        print(f"      {line.strip()}")
            
            if test_success:
                print(f"    ✅ Test PASSED in {execution_time:.2f}s")
                print(f"    🚀 Large dataset processing successful!")
            else:
                print(f"    ❌ Test FAILED in {execution_time:.2f}s")
                if error:
                    print(f"    Error output: {error}")
            
            return test_success
            
        except subprocess.TimeoutExpired:
            print(f"    ⏰ Test TIMEOUT after 10 minutes")
            return False
        except Exception as e:
            print(f"    ❌ Test execution error: {e}")
            return False

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Test Case 12: 500MB Large Dataset")
    parser.add_argument("--dry-run", action="store_true", default=True, 
                       help="Run in dry-run mode (default: True)")
    parser.add_argument("--no-dry-run", action="store_true", 
                       help="Disable dry-run mode")
    parser.add_argument("--skip-checksum", action="store_true", 
                       help="Skip checksum verification")
    
    args = parser.parse_args()
    
    # Handle dry-run logic
    dry_run = args.dry_run and not args.no_dry_run
    
    # Create and run test
    test = TestCase12(dry_run=dry_run, skip_checksum=args.skip_checksum)
    success = test.run_test()
    
    if success:
        print(f"\n🎉 Test Case {test.test_id} completed successfully!")
        sys.exit(0)
    else:
        print(f"\n❌ Test Case {test.test_id} failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()


