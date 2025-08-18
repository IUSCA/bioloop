#!/usr/bin/env python3
"""
Test Runner for Created Test Cases

This script runs the test cases we've created so far to verify the functionality
of the register_ondemand.py script.

Test Cases Available:
1. Basic Registration (test_01_basic_registration.py)
2. Renaming with Prefix/Suffix (test_02_renaming_with_prefix_suffix.py)
9. Edge Cases (test_09_edge_cases.py)
10. Concurrent Execution (test_10_concurrent.py)
11. Large Files (test_11_large_files.py)
13. Idempotent Cleanup Behavior (test_13_idempotent_cleanup.py)

Usage:
    python run_created_tests.py [--dry-run] [--skip-checksum] [--test-case N]
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

class TestRunner:
    """Manages the execution of created test cases for register_ondemand.py"""
    
    def __init__(self, dry_run: bool = True, skip_checksum: bool = False):
        self.dry_run = dry_run
        self.skip_checksum = skip_checksum
        self.test_scripts_dir = Path(__file__).parent
        self.results = []
        
        # Available test cases
        self.available_tests = [
            {
                "id": 1,
                "name": "Basic Registration",
                "script": "test_01_basic_registration.py",
                "description": "Basic functionality without renaming or hard linking"
            },
            {
                "id": 2,
                "name": "Renaming with Prefix/Suffix",
                "script": "test_02_renaming_with_prefix_suffix.py",
                "description": "Renaming functionality with prefix/suffix and parallel verification"
            },
            {
                "id": 9,
                "name": "Edge Cases",
                "script": "test_09_edge_cases.py",
                "description": "Testing various edge cases including non-directory files"
            },
            {
                "id": 10,
                "name": "Concurrent Execution",
                "script": "test_10_concurrent.py",
                "description": "Testing parallel operations with multiple subdirectories"
            },
            {
                "id": 11,
                "name": "Large Files",
                "script": "test_11_large_files.py",
                "description": "Testing with larger individual files"
            },
            {
                "id": 13,
                "name": "Idempotent Cleanup Behavior",
                "script": "test_13_idempotent_cleanup.py",
                "description": "Testing idempotent cleanup with partial failures and multiple runs"
            }
        ]
    
    def run_test_case(self, test_case: dict) -> dict:
        """Run a single test case"""
        script_path = self.test_scripts_dir / test_case["script"]
        
        print(f"\n{'='*80}")
        print(f"🧪 TEST CASE {test_case['id']:02d}: {test_case['name']}")
        print(f"{'='*80}")
        print(f"Description: {test_case['description']}")
        print(f"Script: {test_case['script']}")
        
        # Build the command
        cmd = [
            "python", str(script_path),
            "--dry-run" if self.dry_run else "--no-dry-run"
        ]
        
        if self.skip_checksum:
            cmd.append("--skip-checksum")
        
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
            
            # Check for success indicators in output
            test_passed = "Test PASSED" in output or "Test Case completed successfully" in output
            test_failed = "Test FAILED" in output or "Test Case failed" in output
            
            # Determine final result
            if test_passed:
                final_success = True
            elif test_failed:
                final_success = False
            else:
                final_success = success  # Fallback to return code
            
            result_summary = {
                "test_case_id": test_case["id"],
                "test_case_name": test_case["name"],
                "script": test_case["script"],
                "success": final_success,
                "execution_time": execution_time,
                "return_code": result.returncode,
                "output": output,
                "error": error
            }
            
            if final_success:
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
                "script": test_case["script"],
                "success": False,
                "error": "Test timeout after 5 minutes"
            }
        except Exception as e:
            print(f"    ❌ Test execution error: {e}")
            return {
                "test_case_id": test_case["id"],
                "test_case_name": test_case["name"],
                "script": test_case["script"],
                "success": False,
                "error": str(e)
            }
    
    def run_all_tests(self, specific_test_case: int = None) -> None:
        """Run all available test cases or a specific test case"""
        print(f"🚀 Starting Test Suite for Created Test Cases")
        print(f"Configuration:")
        print(f"  Dry Run: {self.dry_run}")
        print(f"  Skip Checksum: {self.skip_checksum}")
        print(f"  Test Scripts Directory: {self.test_scripts_dir}")
        
        if specific_test_case:
            test_cases = [tc for tc in self.available_tests if tc["id"] == specific_test_case]
            if not test_cases:
                print(f"❌ Test case {specific_test_case} not found")
                return
            print(f"Running specific test case: {specific_test_case}")
        else:
            test_cases = self.available_tests
            print(f"Running all {len(test_cases)} available test cases")
        
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
        
        # Show available test cases
        print(f"\n📋 Available Test Cases:")
        for test_case in self.available_tests:
            status = "✅" if any(r["test_case_id"] == test_case["id"] and r["success"] for r in self.results) else "❌"
            print(f"  {status} Test Case {test_case['id']:02d}: {test_case['name']}")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Run created test cases for register_ondemand.py")
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


