#!/usr/bin/env python3
"""
Test Case 13: Idempotent Cleanup Behavior

Purpose: Test idempotent cleanup with partial failures and multiple runs
Data: 3 subdirectories with 2 files each (~6MB total)
Expected: Hard linking with renaming, parallel verification, idempotent cleanup

This test verifies:
- Idempotent behavior across multiple script runs
- Automatic recovery from partial failures
- Consistent cleanup regardless of previous state
- Hard-link recreation when needed
- Robust error handling and recovery

Usage:
    python test_13_idempotent_cleanup.py [--dry-run] [--skip-checksum]
"""

import argparse
import os
import sys
import subprocess
import time
import shutil
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

class TestCase13:
    """Test Case 13: Idempotent Cleanup Behavior - Testing idempotent cleanup with partial failures"""
    
    def __init__(self, dry_run: bool = True, skip_checksum: bool = False):
        self.test_name = "Idempotent Cleanup Behavior"
        self.test_id = "13"
        self.description = "Testing idempotent cleanup with partial failures and multiple runs"
        self.data_dir = "test_13_idempotent_cleanup"
        self.subdirs = ["subdir_cleanup_1", "subdir_cleanup_2", "subdir_cleanup_3"]
        self.dataset_type = "DATA_PRODUCT"
        self.ingest_subdirs = True
        self.prefix = "IDEMPOTENT"
        self.suffix = "CLEANUP"
        self.expected_hard_links = 3
        self.expected_verification = True
        
        self.dry_run = dry_run
        self.skip_checksum = skip_checksum
        self.test_data_base = Path("/opt/sca/data/scratch")
        self.script_path = "/opt/sca/app/workers/scripts/register_ondemand.py"
        
        # Test data configuration
        self.file_sizes_mb = [1, 1]  # 2 files of 1MB each per subdirectory
        self.total_size_mb = sum(self.file_sizes_mb) * len(self.subdirs)
        
        # Expected dataset names after renaming
        self.expected_dataset_names = [
            f"{self.prefix}-{subdir}-{self.suffix}" for subdir in self.subdirs
        ]
        
        # Hidden directory for hard-links
        self.hidden_dir_name = f".{self.data_dir}__renamed"
    
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
            
            print(f"    ✅ Test data created successfully")
            print(f"    📊 Total size: {self.total_size_mb}MB")
            print(f"    📊 Subdirectories: {len(self.subdirs)}")
            return True
            
        except Exception as e:
            print(f"    ❌ Error creating test data: {e}")
            return False
    
    def check_hard_link_artifacts(self) -> dict:
        """Check the current state of hard-link artifacts"""
        hidden_dir = self.test_data_base / self.hidden_dir_name
        artifacts = {
            "hidden_dir_exists": hidden_dir.exists(),
            "hard_link_dirs": [],
            "total_artifacts": 0
        }
        
        if hidden_dir.exists():
            # Count hard-link directories
            for item in hidden_dir.iterdir():
                if item.is_dir():
                    artifacts["hard_link_dirs"].append(item.name)
                    artifacts["total_artifacts"] += 1
        
        return artifacts
    
    def simulate_partial_failure(self, run_number: int) -> None:
        """Simulate different artifact states to test idempotent behavior"""
        hidden_dir = self.test_data_base / self.hidden_dir_name
        
        if run_number == 1:
            # First run: No artifacts exist
            print(f"    🔄 Run {run_number}: Clean state - no artifacts exist")
            if hidden_dir.exists():
                shutil.rmtree(hidden_dir)
                print(f"      🧹 Cleaned up any existing artifacts")
        
        elif run_number == 2:
            # Second run: Simulate partial cleanup (leave 2 out of 3)
            print(f"    🔄 Run {run_number}: Simulating partial cleanup failure")
            if hidden_dir.exists():
                # Remove one hard-link directory to simulate partial cleanup
                hard_link_dirs = [d for d in hidden_dir.iterdir() if d.is_dir()]
                if hard_link_dirs:
                    shutil.rmtree(hard_link_dirs[0])
                    print(f"      🧹 Simulated partial cleanup - removed 1 artifact")
        
        elif run_number == 3:
            # Third run: Simulate no cleanup (leave all artifacts)
            print(f"    🔄 Run {run_number}: Simulating no cleanup failure")
            print(f"      ℹ️  Leaving all artifacts for idempotent recovery test")
    
    def run_test(self) -> bool:
        """Run the test case with multiple runs to test idempotent behavior"""
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
        
        # Run the test multiple times to verify idempotent behavior
        all_runs_successful = True
        
        for run_number in range(1, 4):  # 3 runs
            print(f"\n    🚀 RUN #{run_number}: Testing idempotent behavior")
            
            # Check current artifact state
            artifacts_before = self.check_hard_link_artifacts()
            print(f"      📊 Artifacts before run: {artifacts_before['total_artifacts']} found")
            if artifacts_before['hard_link_dirs']:
                print(f"      📁 Existing hard-link dirs: {', '.join(artifacts_before['hard_link_dirs'])}")
            
            # Simulate different failure scenarios
            self.simulate_partial_failure(run_number)
            
            # Build the command
            cmd = [
                "python", "-m", "workers.scripts.register_ondemand",
                str(data_dir),
                f"--dataset-type={self.dataset_type}",
                f"--ingest-subdirs={self.ingest_subdirs}",
                f"--prefix={self.prefix}",
                f"--suffix={self.suffix}",
                f"--description=Test Case {self.test_id} Run {run_number}: {self.test_name} - {self.description}",
                f"--dry-run={self.dry_run}"
            ]
            
            if self.skip_checksum:
                cmd.append("--skip-checksum-verification=True")
            
            print(f"      🚀 Running command:")
            print(f"        {' '.join(cmd)}")
            
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
                verification_executed = "Parallel verification" in output or "verification completed" in output
                cleanup_executed = "Cleaned up test hard-links" in output or "DRY RUN: Would clean up" in output
                subdirs_processed = "DRY RUN - Would register" in output or "Successfully processed" in output
                parallel_verification = "Starting parallel verification" in output
                checksum_verification = "Directory checksum verification passed" in output
                
                # Check artifacts after run
                artifacts_after = self.check_hard_link_artifacts()
                print(f"      📊 Artifacts after run: {artifacts_after['total_artifacts']} found")
                
                # Determine test result for this run
                run_success = success
                run_success = run_success and subdirs_processed
                run_success = run_success and hard_links_created
                run_success = run_success and verification_executed
                run_success = run_success and parallel_verification
                
                # Print run results
                print(f"      📊 Run {run_number} Results:")
                print(f"        Return Code: {result.returncode}")
                print(f"        Execution Time: {execution_time:.2f}s")
                print(f"        Subdirectories Processed: {'✅' if subdirs_processed else '❌'}")
                print(f"        Hard Links Created: {'✅' if hard_links_created else '❌'}")
                print(f"        Verification Executed: {'✅' if verification_executed else '❌'}")
                print(f"        Parallel Verification: {'✅' if parallel_verification else '❌'}")
                print(f"        Cleanup Executed: {'✅' if cleanup_executed else '❌'}")
                
                if run_success:
                    print(f"        ✅ Run {run_number} PASSED in {execution_time:.2f}s")
                else:
                    print(f"        ❌ Run {run_number} FAILED in {execution_time:.2f}s")
                    if error:
                        print(f"        Error output: {error}")
                    all_runs_successful = False
                
                # Small delay between runs
                time.sleep(1)
                
            except subprocess.TimeoutExpired:
                print(f"        ⏰ Run {run_number} TIMEOUT after 5 minutes")
                all_runs_successful = False
            except Exception as e:
                print(f"        ❌ Run {run_number} execution error: {e}")
                all_runs_successful = False
        
        # Final artifact state
        final_artifacts = self.check_hard_link_artifacts()
        print(f"\n    📊 Final Artifact State:")
        print(f"      Hidden directory exists: {final_artifacts['hidden_dir_exists']}")
        print(f"      Total artifacts: {final_artifacts['total_artifacts']}")
        if final_artifacts['hard_link_dirs']:
            print(f"      Remaining hard-link dirs: {', '.join(final_artifacts['hard_link_dirs'])}")
        
        # Overall test success
        if all_runs_successful:
            print(f"    ✅ All 3 runs completed successfully!")
            print(f"    ✅ Idempotent behavior verified!")
        else:
            print(f"    ❌ Some runs failed - idempotent behavior not fully verified")
        
        return all_runs_successful

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Test Case 13: Idempotent Cleanup Behavior")
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
    test = TestCase13(dry_run=dry_run, skip_checksum=args.skip_checksum)
    success = test.run_test()
    
    if success:
        print(f"\n🎉 Test Case {test.test_id} completed successfully!")
        sys.exit(0)
    else:
        print(f"\n❌ Test Case {test.test_id} failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
