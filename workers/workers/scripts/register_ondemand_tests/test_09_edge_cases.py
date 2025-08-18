#!/usr/bin/env python3
"""
Test Case 09: Edge Cases

Purpose: Test various edge cases including non-directory files
Data: 3 subdirectories with various edge case scenarios (~3MB total)
Expected: No hard linking needed, no verification needed, non-directory files logged

This test verifies:
- Non-directory files are properly logged (limited to first 10)
- Edge case directory structures are handled
- No renaming functionality needed
- Direct path usage
- Proper logging of edge case scenarios

Usage:
    python test_09_edge_cases.py [--dry-run] [--skip-checksum]
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

class TestCase09:
    """Test Case 09: Edge Cases - Testing various edge cases including non-directory files"""
    
    def __init__(self, dry_run: bool = True, skip_checksum: bool = False):
        self.test_name = "Edge Cases"
        self.test_id = "09"
        self.description = "Testing various edge cases including non-directory files"
        self.data_dir = "test_09_edge_cases"
        self.subdirs = ["subdir_edge_1", "subdir_edge_2", "subdir_edge_3"]
        self.dataset_type = "DATA_PRODUCT"
        self.ingest_subdirs = True
        self.prefix = None
        self.suffix = None
        self.expected_hard_links = 0
        self.expected_verification = False
        
        self.dry_run = dry_run
        self.skip_checksum = skip_checksum
        self.test_data_base = Path("/opt/sca/data/scratch")
        self.script_path = "/opt/sca/app/workers/scripts/register_ondemand.py"
        
        # Test data configuration
        self.file_sizes_mb = [1, 1, 1]  # 3 files of 1MB each per subdirectory
        self.total_size_mb = sum(self.file_sizes_mb) * len(self.subdirs)
        
        # Non-directory files to test the logging limit
        self.non_dir_files = 15  # More than 10 to test the limit
        self.expected_logged_files = 10  # Script should only log first 10
    
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
            print(f"    ❌ Error checking dataset existence: {e}")
            return False
    
    def create_test_data(self) -> bool:
        """Create test data for this test case"""
        data_dir = self.test_data_base / self.data_dir
        
        print(f"    📁 Creating test data in {data_dir}")
        
        try:
            # Create the main data directory
            data_dir.mkdir(parents=True, exist_ok=True)
            
            # Create subdirectories with test files
            for subdir_name in self.subdirs:
                subdir_path = data_dir / subdir_name
                subdir_path.mkdir(exist_ok=True)
                
                # Create test files with specified sizes
                for i, size_mb in enumerate(self.file_sizes_mb):
                    file_path = subdir_path / f"test_file_{i+1}.dat"
                    content = b'0' * (size_mb * 1024 * 1024)  # Create file with specified size
                    
                    with open(file_path, 'wb') as f:
                        f.write(content)
                    
                    print(f"      📄 Created {file_path} ({size_mb}MB)")
            
            # Create non-directory files to test the logging limit
            print(f"    📄 Creating {self.non_dir_files} non-directory files...")
            for i in range(self.non_dir_files):
                file_path = data_dir / f"non_dir_file_{i+1}.txt"
                with open(file_path, 'w') as f:
                    f.write(f"Non-directory file {i+1} - This should be logged by the script")
                print(f"      📄 Created non-directory file {file_path}")
            
            # Create some additional edge case files
            edge_case_files = [
                "hidden_file.txt",  # Hidden file
                "file.with.dots.txt",  # File with dots
                "file with spaces.txt",  # File with spaces
                "file_123_numbers.txt",  # File with numbers
                "UPPERCASE_FILE.TXT",  # Uppercase file
                "mixed_case_File.txt",  # Mixed case file
            ]
            
            for edge_file in edge_case_files:
                file_path = data_dir / edge_file
                with open(file_path, 'w') as f:
                    f.write(f"Edge case file: {edge_file}")
                print(f"      📄 Created edge case file {file_path}")
            
            print(f"    ✅ Test data created successfully")
            print(f"    📊 Total size: {self.total_size_mb}MB")
            print(f"    📊 Non-directory files: {self.non_dir_files + len(edge_case_files)}")
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
        print(f"Expected Hard Links: {self.expected_hard_links}")
        print(f"Expected Verification: {self.expected_verification}")
        print(f"Total Test Data Size: {self.total_size_mb}MB")
        print(f"Non-Directory Files: {self.non_dir_files}")
        print(f"Expected Logged Files: {self.expected_logged_files}")
        print(f"Dry Run: {self.dry_run}")
        print(f"Skip Checksum: {self.skip_checksum}")
        
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
        for subdir_name in self.subdirs:
            dataset_name = subdir_name  # No renaming in this test
            exists = self.check_dataset_exists(dataset_name)
            if exists:
                existing_datasets.append(dataset_name)
        
        # Build the command
        cmd = [
            "python", "-m", "workers.scripts.register_ondemand",
            str(data_dir),
            f"--dataset-type={self.dataset_type}",
            f"--ingest-subdirs={self.ingest_subdirs}",
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
                timeout=300  # 5 minute timeout
            )
            execution_time = time.time() - start_time
            
            # Parse the output
            success = result.returncode == 0
            output = result.stdout
            error = result.stderr
            
            # Check for expected patterns in output
            hard_links_created = "Successfully created with hard-links" in output
            verification_executed = "verification completed" in output or "No hard-links to verify" in output
            cleanup_executed = "Cleaned up test hard-links" in output or "DRY RUN: Would clean up" in output
            subdirs_processed = "DRY RUN - Would register" in output or "Successfully processed" in output
            
            # Check for non-directory files logging
            non_dir_files_logged = "Non-directory files found" in output
            showing_first_10 = "showing first 10 files" in output
            more_files_exist = "more files not shown" in output
            
            # Determine test result based on expectations
            test_success = success
            test_success = test_success and subdirs_processed  # Should process subdirectories
            test_success = test_success and not hard_links_created  # Should NOT create hard links (no renaming needed)
            test_success = test_success and verification_executed  # Should have verification (even if no hard-links)
            test_success = test_success and non_dir_files_logged  # Should log non-directory files
            test_success = test_success and showing_first_10  # Should show first 10 limit
            test_success = test_success and more_files_exist  # Should indicate more files exist
            
            # Print results
            print(f"    📊 Test Results:")
            print(f"      Return Code: {result.returncode}")
            print(f"      Execution Time: {execution_time:.2f}s")
            print(f"      Subdirectories Processed: {'✅' if subdirs_processed else '❌'}")
            print(f"      Hard Links Created: {'✅' if hard_links_created else '❌'} (expected: False)")
            print(f"      Verification Executed: {'✅' if verification_executed else '❌'} (expected: False)")
            print(f"      Non-Directory Files Logged: {'✅' if non_dir_files_logged else '❌'} (expected: True)")
            print(f"      First 10 Limit Applied: {'✅' if showing_first_10 else '❌'} (expected: True)")
            print(f"      More Files Indicated: {'✅' if more_files_exist else '❌'} (expected: True)")
            print(f"      Cleanup Executed: {'✅' if cleanup_executed else '❌'}")
            
            # Show non-directory files logging details
            if non_dir_files_logged:
                print(f"    🔍 Non-Directory Files Logging Details:")
                lines = output.split('\n')
                logged_count = 0
                for line in lines:
                    if "Skipping non-directory file" in line:
                        logged_count += 1
                        if logged_count <= 5:  # Show first 5 for brevity
                            print(f"      {line.strip()}")
                        elif logged_count == 6:
                            print(f"      ... (showing first 5 of {logged_count} logged files)")
                
                if "showing first 10 files" in output:
                    for line in lines:
                        if "showing first 10 files" in line:
                            print(f"      {line.strip()}")
                            break
                
                if "more files not shown" in output:
                    for line in lines:
                        if "more files not shown" in line:
                            print(f"      {line.strip()}")
                            break
            
            if test_success:
                print(f"    ✅ Test PASSED in {execution_time:.2f}s")
            else:
                print(f"    ❌ Test FAILED in {execution_time:.2f}s")
                if error:
                    print(f"    Error output: {error}")
            
            return test_success
            
        except subprocess.TimeoutExpired:
            print(f"    ⏰ Test TIMEOUT after 5 minutes")
            return False
        except Exception as e:
            print(f"    ❌ Test execution error: {e}")
            return False

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Test Case 09: Edge Cases")
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
    test = TestCase09(dry_run=dry_run, skip_checksum=args.skip_checksum)
    success = test.run_test()
    
    if success:
        print(f"\n🎉 Test Case {test.test_id} completed successfully!")
        sys.exit(0)
    else:
        print(f"\n❌ Test Case {test.test_id} failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
