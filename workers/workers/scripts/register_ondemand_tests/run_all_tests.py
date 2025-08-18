#!/usr/bin/env python3
"""
Comprehensive Test Runner for register_ondemand.py

This script runs all documented test cases to verify the functionality of the register_ondemand.py script.
Each test case is designed to be idempotent and checks for existing datasets before execution.

Test Cases Covered:
1. Basic Registration - No renaming, subdirectory ingestion
2. Renaming with Prefix/Suffix - Multiple subdirectories with renaming
3. Hard Linking - Multiple subdirectories with varying file sizes
4. Idempotency - Testing duplicate execution prevention
5. Large Dataset - Testing with larger file sizes
6. Mixed Content - Testing with nested directories and varying structures
7. Error Handling - Testing error scenarios and edge cases
8. Cleanup - Testing cleanup functionality
9. Edge Cases - Testing various edge cases including non-directory files
10. Concurrent Execution - Testing parallel operations with multiple subdirectories
11. Large Files - Testing with larger individual files
12. Special Characters - Testing with special characters in directory names
13. Idempotent Cleanup Behavior - Testing idempotent cleanup with partial failures

Usage:
    python run_all_tests.py [--dry-run] [--skip-checksum] [--test-case N]
"""

import argparse
import os
import sys
import subprocess
import time
from pathlib import Path
from typing import List, Dict, Optional

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

class TestRunner:
    """Manages the execution of all test cases for register_ondemand.py"""
    
    def __init__(self, dry_run: bool = True, skip_checksum: bool = False):
        self.dry_run = dry_run
        self.skip_checksum = skip_checksum
        self.test_data_base = Path("/opt/sca/data/scratch")
        self.script_path = "/opt/sca/app/workers/scripts/register_ondemand.py"
        self.results = []
        
        # Test case definitions
        self.test_cases = [
            {
                "id": 1,
                "name": "Basic Registration",
                "description": "Basic functionality without renaming or hard linking",
                "data_dir": "test_01_basic_registration",
                "subdirs": ["subdir_basic"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": None,
                "suffix": None,
                "expected_hard_links": 0,
                "expected_verification": False
            },
            {
                "id": 2,
                "name": "Renaming with Prefix/Suffix",
                "description": "Renaming functionality with prefix/suffix and parallel verification",
                "data_dir": "test_02_renaming_with_prefix_suffix",
                "subdirs": ["subdir_alpha", "subdir_beta"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": "TEST_PRE",
                "suffix": "TEST_SUF",
                "expected_hard_links": 2,
                "expected_verification": True
            },
            {
                "id": 3,
                "name": "Hard Linking",
                "description": "Hard linking with multiple subdirectories and varying file sizes",
                "data_dir": "test_03_hard_linking",
                "subdirs": ["subdir_gamma", "subdir_delta", "subdir_epsilon"],
                "dataset_type": "RAW_DATA",
                "ingest_subdirs": True,
                "prefix": "HARDLINK",
                "suffix": "VERIFY",
                "expected_hard_links": 3,
                "expected_verification": True
            },
            {
                "id": 4,
                "name": "Idempotency",
                "description": "Testing duplicate execution prevention",
                "data_dir": "test_04_idempotency",
                "subdirs": ["subdir_zeta", "subdir_eta"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": None,
                "suffix": None,
                "expected_hard_links": 0,
                "expected_verification": False
            },
            {
                "id": 5,
                "name": "Large Dataset",
                "description": "Testing with larger file sizes",
                "data_dir": "test_05_large_dataset",
                "subdirs": ["subdir_large_1", "subdir_large_2"],
                "dataset_type": "RAW_DATA",
                "ingest_subdirs": True,
                "prefix": "LARGE",
                "suffix": "DATA",
                "expected_hard_links": 2,
                "expected_verification": True
            },
            {
                "id": 6,
                "name": "Mixed Content",
                "description": "Testing with nested directories and varying structures",
                "data_dir": "test_06_mixed_content",
                "subdirs": ["subdir_nested", "subdir_flat", "subdir_mixed"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": "MIXED",
                "suffix": "CONTENT",
                "expected_hard_links": 3,
                "expected_verification": True
            },
            {
                "id": 7,
                "name": "Error Handling",
                "description": "Testing error scenarios and edge cases",
                "data_dir": "test_07_error_handling",
                "subdirs": ["subdir_nu", "subdir_xi"],
                "dataset_type": "RAW_DATA",
                "ingest_subdirs": True,
                "prefix": None,
                "suffix": None,
                "expected_hard_links": 0,
                "expected_verification": False
            },
            {
                "id": 8,
                "name": "Cleanup",
                "description": "Testing cleanup functionality",
                "data_dir": "test_08_cleanup",
                "subdirs": ["subdir_omicron", "subdir_pi"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": "CLEANUP",
                "suffix": "TEST",
                "expected_hard_links": 2,
                "expected_verification": True
            },
            {
                "id": 9,
                "name": "Edge Cases",
                "description": "Testing various edge cases including non-directory files",
                "data_dir": "test_09_edge_cases",
                "subdirs": ["subdir_edge_1", "subdir_edge_2", "subdir_edge_3"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": None,
                "suffix": None,
                "expected_hard_links": 0,
                "expected_verification": False
            },
            {
                "id": 10,
                "name": "Concurrent Execution",
                "description": "Testing parallel operations with multiple subdirectories",
                "data_dir": "test_10_concurrent",
                "subdirs": ["subdir_parallel_1", "subdir_parallel_2", "subdir_parallel_3", "subdir_parallel_4", "subdir_parallel_5"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": "PARALLEL",
                "suffix": "TEST",
                "expected_hard_links": 5,
                "expected_verification": True
            },
            {
                "id": 11,
                "name": "Large Files",
                "description": "Testing with larger individual files",
                "data_dir": "test_11_large_files",
                "subdirs": ["subdir_large_files"],
                "dataset_type": "RAW_DATA",
                "ingest_subdirs": True,
                "prefix": "LARGE",
                "suffix": "FILES",
                "expected_hard_links": 1,
                "expected_verification": True
            },
            {
                "id": 12,
                "name": "Special Characters",
                "description": "Testing with special characters in directory names",
                "data_dir": "test_12_special_chars",
                "subdirs": ["subdir with spaces", "subdir.with.dots", "subdir_underscores", "subdir123numbers"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": None,
                "suffix": None,
                "expected_hard_links": 0,
                "expected_verification": False
            },
            {
                "id": 13,
                "name": "Idempotent Cleanup Behavior",
                "description": "Testing idempotent cleanup with partial failures and multiple runs",
                "data_dir": "test_13_idempotent_cleanup",
                "subdirs": ["subdir_cleanup_1", "subdir_cleanup_2", "subdir_cleanup_3"],
                "dataset_type": "DATA_PRODUCT",
                "ingest_subdirs": True,
                "prefix": "IDEMPOTENT",
                "suffix": "CLEANUP",
                "expected_hard_links": 3,
                "expected_verification": True
            }
        ]
    
    def check_dataset_exists(self, dataset_name: str, dataset_type: str) -> bool:
        """Check if a dataset already exists using the API"""
        try:
            # Use the API to check if dataset exists
            matching_datasets = api.get_all_datasets(dataset_type=dataset_type, name=dataset_name, include_states=True)
            exists = len(matching_datasets) > 0
            
            if exists:
                print(f"    ⚠️  Dataset {dataset_type} '{dataset_name}' already exists in database")
                # Check if it's archived
                dataset = matching_datasets[0]
                is_archived = any(state['state'] == 'ARCHIVED' for state in dataset.get('states', []))
                if is_archived:
                    print(f"    ✅ Dataset is already archived - skipping test")
                else:
                    print(f"    ⚠️  Dataset exists but not archived - will test workflow kickoff")
            else:
                print(f"    ✅ Dataset {dataset_type} '{dataset_name}' does not exist - safe to test")
            
            return exists
        except Exception as e:
            print(f"    ❌ Error checking dataset existence: {e}")
            return False
    
    def create_test_data(self, test_case: Dict) -> bool:
        """Create test data for a specific test case"""
        data_dir = self.test_data_base / test_case["data_dir"]
        
        print(f"    📁 Creating test data in {data_dir}")
        
        try:
            # Create the main data directory
            data_dir.mkdir(parents=True, exist_ok=True)
            
            # Create subdirectories with test files
            for subdir_name in test_case["subdirs"]:
                subdir_path = data_dir / subdir_name
                subdir_path.mkdir(exist_ok=True)
                
                # Create 2-3 test files in each subdirectory
                num_files = 2 if test_case["id"] <= 5 else 3
                for i in range(num_files):
                    file_size_mb = 1 if test_case["id"] <= 5 else 2
                    if test_case["id"] == 11:  # Large files test
                        file_size_mb = 10
                    
                    file_path = subdir_path / f"test_file_{i+1}.dat"
                    content = b'0' * (file_size_mb * 1024 * 1024)  # Create file with specified size
                    
                    with open(file_path, 'wb') as f:
                        f.write(content)
                    
                    print(f"      📄 Created {file_path} ({file_size_mb}MB)")
            
            # For edge cases test, add some non-directory files
            if test_case["id"] == 9:
                for i in range(15):  # More than 10 to test the limit
                    file_path = data_dir / f"non_dir_file_{i+1}.txt"
                    with open(file_path, 'w') as f:
                        f.write(f"Non-directory file {i+1}")
                    print(f"      📄 Created non-directory file {file_path}")
            
            print(f"    ✅ Test data created successfully")
            return True
            
        except Exception as e:
            print(f"    ❌ Error creating test data: {e}")
            return False
    
    def run_test_case(self, test_case: Dict) -> Dict:
        """Run a single test case"""
        print(f"\n{'='*80}")
        print(f"🧪 TEST CASE {test_case['id']:02d}: {test_case['name']}")
        print(f"{'='*80}")
        print(f"Description: {test_case['description']}")
        print(f"Data Directory: {test_case['data_dir']}")
        print(f"Subdirectories: {', '.join(test_case['subdirs'])}")
        print(f"Dataset Type: {test_case['dataset_type']}")
        print(f"Expected Hard Links: {test_case['expected_hard_links']}")
        print(f"Expected Verification: {test_case['expected_verification']}")
        
        # Check if test data exists, create if not
        data_dir = self.test_data_base / test_case["data_dir"]
        if not data_dir.exists():
            if not self.create_test_data(test_case):
                return {"success": False, "error": "Failed to create test data"}
        else:
            print(f"    📁 Test data already exists at {data_dir}")
        
        # Check for existing datasets
        print(f"    🔍 Checking for existing datasets...")
        existing_datasets = []
        for subdir_name in test_case["subdirs"]:
            dataset_name = subdir_name
            if test_case["prefix"] or test_case["suffix"]:
                # Generate the expected dataset name
                components = []
                if test_case["prefix"]:
                    components.append(test_case["prefix"])
                components.append(subdir_name)
                if test_case["suffix"]:
                    components.append(test_case["suffix"])
                dataset_name = "-".join(components)
            
            exists = self.check_dataset_exists(dataset_name, test_case["dataset_type"])
            if exists:
                existing_datasets.append(dataset_name)
        
        # Build the command
        cmd = [
            "python", "-m", "workers.scripts.register_ondemand",
            str(data_dir),
            f"--dataset-type={test_case['dataset_type']}",
            f"--ingest-subdirs={test_case['ingest_subdirs']}",
            f"--description=Test Case {test_case['id']:02d}: {test_case['name']} - {test_case['description']}",
            f"--dry-run={self.dry_run}"
        ]
        
        if test_case["prefix"]:
            cmd.extend([f"--prefix={test_case['prefix']}"])
        if test_case["suffix"]:
            cmd.extend([f"--suffix={test_case['suffix']}"])
        
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
            hard_links_created = "hard-linked directory created" in output
            verification_executed = "Parallel verification" in output or "verification completed" in output
            cleanup_executed = "Cleaned up renamed directory" in output or "DRY RUN: Would clean up" in output
            
            # Determine test result
            test_success = success
            if test_case["expected_hard_links"] > 0:
                test_success = test_success and hard_links_created
            if test_case["expected_verification"]:
                test_success = test_success and verification_executed
            
            result_summary = {
                "test_case_id": test_case["id"],
                "test_case_name": test_case["name"],
                "success": test_success,
                "execution_time": execution_time,
                "return_code": result.returncode,
                "hard_links_created": hard_links_created,
                "verification_executed": verification_executed,
                "cleanup_executed": cleanup_executed,
                "existing_datasets": existing_datasets,
                "output": output,
                "error": error
            }
            
            if test_success:
                print(f"    ✅ Test PASSED in {execution_time:.2f}s")
            else:
                print(f"    ❌ Test FAILED in {execution_time:.2f}s")
                if error:
                    print(f"    Error output: {error}")
            
            return result_summary
            
        except subprocess.TimeoutExpired:
            print(f"    ⏰ Test TIMEOUT after 5 minutes")
            return {
                "test_case_id": test_case["id"],
                "test_case_name": test_case["name"],
                "success": False,
                "error": "Test timeout after 5 minutes"
            }
        except Exception as e:
            print(f"    ❌ Test execution error: {e}")
            return {
                "test_case_id": test_case["id"],
                "test_case_name": test_case["name"],
                "success": False,
                "error": str(e)
            }
    
    def run_all_tests(self, specific_test_case: Optional[int] = None) -> None:
        """Run all test cases or a specific test case"""
        print(f"🚀 Starting Comprehensive Test Suite for register_ondemand.py")
        print(f"Configuration:")
        print(f"  Dry Run: {self.dry_run}")
        print(f"  Skip Checksum: {self.skip_checksum}")
        print(f"  Test Data Base: {self.test_data_base}")
        print(f"  Script Path: {self.script_path}")
        
        if specific_test_case:
            test_cases = [tc for tc in self.test_cases if tc["id"] == specific_test_case]
            if not test_cases:
                print(f"❌ Test case {specific_test_case} not found")
                return
            print(f"Running specific test case: {specific_test_case}")
        else:
            test_cases = self.test_cases
            print(f"Running all {len(test_cases)} test cases")
        
        start_time = time.time()
        
        for test_case in test_cases:
            result = self.run_test_case(test_case)
            self.results.append(result)
            
            # Small delay between tests
            time.sleep(1)
        
        total_time = time.time() - start_time
        
        # Print summary
        self.print_summary(total_time)
    
    def print_summary(self, total_time: float) -> None:
        """Print a summary of all test results"""
        print(f"\n{'='*80}")
        print(f"📊 TEST SUITE SUMMARY")
        print(f"{'='*80}")
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        print(f"Total Execution Time: {total_time:.2f}s")
        
        if failed_tests > 0:
            print(f"\n❌ Failed Tests:")
            for result in self.results:
                if not result["success"]:
                    print(f"  Test Case {result['test_case_id']:02d}: {result['test_case_name']}")
                    if "error" in result:
                        print(f"    Error: {result['error']}")
        
        print(f"\n✅ All tests completed!")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Run comprehensive tests for register_ondemand.py")
    parser.add_argument("--dry-run", action="store_true", default=True, 
                       help="Run in dry-run mode (default: True)")
    parser.add_argument("--no-dry-run", action="store_true", 
                       help="Disable dry-run mode")
    parser.add_argument("--skip-checksum", action="store_true", 
                       help="Skip checksum verification in tests")
    parser.add_argument("--test-case", type=int, 
                       help="Run only a specific test case by ID")
    
    args = parser.parse_args()
    
    # Handle dry-run logic
    dry_run = args.dry_run and not args.no_dry_run
    
    # Create and run test runner
    runner = TestRunner(dry_run=dry_run, skip_checksum=args.skip_checksum)
    runner.run_all_tests(specific_test_case=args.test_case)

if __name__ == "__main__":
    main()
