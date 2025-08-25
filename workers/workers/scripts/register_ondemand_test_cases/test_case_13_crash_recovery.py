#!/usr/bin/env python3
"""
Test Case 13: Script crash during workflow initiation and recovery

This test simulates a scenario where register_ondemand successfully registers
multiple datasets but crashes before all workflows can be initiated. Then it
verifies that re-running the script will:
1. Skip already-registered datasets
2. Initiate workflows for datasets that were created but didn't have workflows started
"""

import os
import sys
import subprocess
import logging
import time
from pathlib import Path
from dotenv import load_dotenv
from unittest.mock import patch, MagicMock
import tempfile

# Load environment variables from .env file
load_dotenv()

sys.path.append('/opt/sca/app')
import workers.api as api
from workers.scripts.register_ondemand_test_cases.generate_test_datasets import generate_datasets

# Setup logging
root_logger = logging.getLogger()
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/sca/logs/register_ondemand/test_case_13.log'),
        logging.StreamHandler()
    ],
    force=True  # Force reconfiguration
)
logger = logging.getLogger(__name__)


def create_test_datasets():
    """Create multiple test datasets for the crash recovery test"""
    logger.info("Creating test datasets...")
    
    # Generate test datasets
    container_path = generate_datasets(
        dataset_type='DATA_PRODUCT',
        size_mb=1.0,  # Small size for faster testing
        container_name='test_case_13',
        num_datasets=4  # Create 4 datasets to test crash scenario
    )
    
    # Get the names of the created subdirectories
    dataset_names = []
    for item in container_path.iterdir():
        if item.is_dir():
            dataset_names.append(item.name)
            logger.info(f"Created dataset directory: {item.name}")
    
    return container_path, dataset_names


def simulate_crash_with_mocked_workflow(container_path):
    """
    Simulate a crash using unittest.mock to control workflow behavior.
    Mock the workflow initiation to fail after a certain number of calls.
    """
    logger.info("Simulating crash using mocked workflow API...")
    
    from workers.scripts.register_ondemand import Registration
    import workers.workflow_utils as wf_utils
    from sca_rhythm import Workflow
    
    # Track how many workflows we've attempted to start
    workflow_call_count = 0
    max_workflows_before_crash = 2
    
    def mock_workflow_start(dataset_id):
        """Mock workflow.start() that crashes after a few calls"""
        nonlocal workflow_call_count
        workflow_call_count += 1
        
        logger.info(f"🧪 MOCK: Workflow start attempt #{workflow_call_count} for dataset {dataset_id}")
        
        if workflow_call_count <= max_workflows_before_crash:
            # Let first few workflows succeed
            logger.info(f"✅ MOCK: Workflow {workflow_call_count} started successfully")
            return True
        else:
            # Simulate crash after max workflows
            logger.info(f"💥 MOCK: Simulating crash during workflow {workflow_call_count}")
            raise Exception("Simulated crash during workflow initiation")
    
    # Use patch to mock the Workflow.start method
    with patch('sca_rhythm.Workflow.start', side_effect=mock_workflow_start):
        reg = Registration(
            dataset_type='DATA_PRODUCT', 
            path=str(container_path),
            ingest_subdirs=True
        )
        
        try:
            # Register datasets (should succeed)
            logger.info("Step A: Registering datasets...")
            reg.register_datasets()
            
            logger.info(f"✅ Registration completed with simulated crash")
            logger.info(f"   - {len(reg.created_datasets)} datasets registered")
            logger.info(f"   - {workflow_call_count} workflow attempts made")
            
            return True, reg.created_datasets
            
        except Exception as e:
            logger.info(f"✅ Expected crash occurred: {e}")
            return True, reg.created_datasets

def create_mock_script_with_delay(container_path):
    """
    Create a modified version of register_ondemand that adds delays during workflow initiation.
    This allows us to reliably interrupt the script during the workflow phase.
    """
    # Create a temporary script directory
    temp_script_dir = Path('/tmp/test_register_ondemand')
    temp_script_dir.mkdir(exist_ok=True)
    
    # Create the mock script content
    mock_script_content = f'''#!/usr/bin/env python3


"""
Modified register_ondemand script with artificial delays for testing crash scenarios.
"""
import sys
import time
import logging
sys.path.append('/opt/sca/app')

# Import the original register_ondemand module
from workers.scripts.register_ondemand import *

# Override the start_integration method to add delay
original_start_integration = Registration.start_integration

def slow_start_integration(self, dataset):
    """Modified start_integration that adds delay for testing"""
    logger.info(f"🐌 TESTING: Adding 3-second delay before starting workflow for {{dataset['name']}}")
    time.sleep(3)  # Add delay to make interruption more reliable
    return original_start_integration(self, dataset)

# Patch the method
Registration.start_integration = slow_start_integration

# Run the normal script logic
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Register datasets on-demand in Bioloop (TEST VERSION).")
    parser.add_argument("dir_path", help="Path to the directory to process")
    parser.add_argument("--dataset-type", dest="dataset_type", required=True, choices=["DATA_PRODUCT", "RAW_DATA"], help="Dataset type to register")
    parser.add_argument("--project-id", dest="project_id", default=None, help="Optional project ID to associate with datasets")
    parser.add_argument("--description", dest="description", default=None, help="Optional description for datasets")
    parser.add_argument("--prefix", dest="prefix", default=None, help="Optional prefix for renamed directories")
    parser.add_argument("--suffix", dest="suffix", default=None, help="Optional suffix for renamed directories")
    parser.add_argument("--ingest-subdirs", dest="ingest_subdirs", action="store_true", help="Ingest subdirectories instead of the parent directory")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true", help="Simulate the process without making changes")

    args = parser.parse_args()

    init(
        dir_path=args.dir_path,
        dataset_type=args.dataset_type,
        project_id=args.project_id,
        description=args.description,
        prefix=args.prefix,
        suffix=args.suffix,
        ingest_subdirs=args.ingest_subdirs,
        dry_run=args.dry_run,
    )
'''
    
    # Write the mock script
    mock_script_path = temp_script_dir / 'mock_register_ondemand.py'
    with open(mock_script_path, 'w') as f:
        f.write(mock_script_content)
    
    # Make it executable
    os.chmod(mock_script_path, 0o755)
    
    logger.info(f"Created mock script with delays: {{mock_script_path}}")
    return mock_script_path

def run_registration_with_interrupt(container_path, interrupt_after_seconds: int = 8):
    """
    Run the mock register_ondemand script and interrupt it during workflow initiation.
    The mock script has artificial delays to make interruption more reliable.
    """
    logger.info(f"Running mock register_ondemand with interrupt after {{interrupt_after_seconds}}s...")
    
    # Create the mock script with delays
    mock_script_path = create_mock_script_with_delay(container_path)
    
    cmd = [
        'python', str(mock_script_path),
        '--dataset-type', 'DATA_PRODUCT',
        '--ingest-subdirs',
        str(container_path)
    ]
    
    logger.info(f"Executing command: {{' '.join(cmd)}}")
    
    # Start the process
    process = subprocess.Popen(
        cmd, 
        stdout=subprocess.PIPE, 
        stderr=subprocess.PIPE, 
        text=True,
        cwd='/opt/sca/app'
    )
    
    logger.info(f"Started process PID: {{process.pid}}")
    
    def interrupt_process():
        """Function to interrupt the process after a delay"""
        time.sleep(interrupt_after_seconds)
        if process.poll() is None:  # Process still running
            logger.info(f"Interrupting process {{process.pid}} with SIGTERM...")
            try:
                process.terminate()  # Send SIGTERM first
                time.sleep(1)
                if process.poll() is None:
                    logger.info(f"Force killing process {{process.pid}}...")
                    process.kill()  # Force kill if SIGTERM didn't work
            except ProcessLookupError:
                logger.info("Process already terminated")
    
    # Start the interrupt thread
    interrupt_thread = threading.Thread(target=interrupt_process)
    interrupt_thread.start()
    
    try:
        # Wait for process to complete or be killed
        stdout, stderr = process.communicate()
        return_code = process.returncode
        was_interrupted = return_code != 0  # Non-zero return codes indicate interruption
    except Exception as e:
        logger.error(f"Error waiting for process: {{e}}")
        stdout, stderr = "", str(e)
        return_code = -1
        was_interrupted = True
    
    # Wait for interrupt thread to finish
    interrupt_thread.join()
    
    # Clean up mock script
    try:
        mock_script_path.unlink()
        mock_script_path.parent.rmdir()
    except Exception as e:
        logger.warning(f"Failed to clean up mock script: {{e}}")
    
    logger.info("First run output:")
    logger.info("STDOUT:")
    logger.info(stdout)
    if stderr:
        logger.warning("STDERR:")
        logger.warning(stderr)
    
    logger.info(f"Return code: {{return_code}}")
    logger.info(f"Process was interrupted: {{was_interrupted}}")
    
    return return_code, stdout, stderr, was_interrupted


def run_full_registration(container_path):
    """Run register_ondemand script without timeout (recovery run)"""
    logger.info("Running register_ondemand for recovery (no timeout)...")
    
    cmd = [
        'python', '-m', 'workers.scripts.register_ondemand',
        '--dataset-type', 'DATA_PRODUCT',
        '--ingest-subdirs',
        str(container_path)
    ]
    
    logger.info(f"Executing command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd='/opt/sca/app')
    
    logger.info("Recovery run output:")
    logger.info("STDOUT:")
    logger.info(result.stdout)
    if result.stderr:
        logger.warning("STDERR:")
        logger.warning(result.stderr)
    
    logger.info(f"Return code: {result.returncode}")
    
    return result


def check_dataset_status(dataset_names):
    """Check which datasets exist and which have workflows initiated"""
    logger.info("Checking dataset status...")
    
    results = {
        'registered': [],
        'with_workflows': [],
        'without_workflows': []
    }
    
    for name in dataset_names:
        try:
            # Check if dataset exists
            datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=name)
            if datasets:
                dataset = datasets[0]
                results['registered'].append(name)
                
                # Check if it has workflows
                dataset_detail = api.get_dataset(dataset_id=dataset['id'], workflows=True)
                workflows = dataset_detail.get('workflows', [])
                
                if any(wf['name'] == 'integrated' for wf in workflows):
                    results['with_workflows'].append(name)
                    logger.info(f"✅ {name}: Registered with workflow")
                else:
                    results['without_workflows'].append(name)
                    logger.info(f"⚠️ {name}: Registered but no workflow")
            else:
                logger.info(f"❌ {name}: Not registered")
        except Exception as e:
            logger.error(f"Error checking dataset {name}: {e}")
    
    return results


def cleanup_test_datasets(dataset_names):
    """Clean up test datasets from the database"""
    logger.info("Cleaning up test datasets...")
    
    for name in dataset_names:
        try:
            datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=name)
            for dataset in datasets:
                try:
                    api.delete_dataset(dataset['id'])
                    logger.info(f"Deleted dataset: {name} (ID: {dataset['id']})")
                except Exception as e:
                    logger.warning(f"Failed to delete dataset {name}: {e}")
        except Exception as e:
            logger.warning(f"Error finding dataset {name} for cleanup: {e}")


def run_test():
    """Run test case 13: Script crash during workflow initiation and recovery"""
    logger.info("=" * 80)
    logger.info("Starting Test Case 13: Script crash during workflow initiation and recovery")
    logger.info("=" * 80)
    
    dataset_names = []
    container_path = None
    
    try:
        # Step 1: Create test datasets
        logger.info("Step 1: Creating test datasets...")
        container_path, dataset_names = create_test_datasets()  # Create 4 datasets
        
        # Step 2: Simulate crash during workflow initiation using mocks
        logger.info("Step 2: Simulating crash during workflow initiation using mocks...")
        crash_success, created_datasets = simulate_crash_with_mocked_workflow(container_path)
        
        # Give the system a moment to settle
        time.sleep(2)
        
        # Step 3: Check status after "crash"
        logger.info("Step 3: Checking dataset status after simulated crash...")
        status_after_crash = check_dataset_status(dataset_names)
        
        logger.info(f"After crash - Registered: {len(status_after_crash['registered'])}")
        logger.info(f"After crash - With workflows: {len(status_after_crash['with_workflows'])}")
        logger.info(f"After crash - Without workflows: {len(status_after_crash['without_workflows'])}")
        
        # Step 4: Run recovery (full registration)
        logger.info("Step 4: Running recovery registration...")
        recovery_result = run_full_registration(container_path)
        
        # Give the system a moment to process workflows
        time.sleep(3)
        
        # Step 5: Check final status
        logger.info("Step 5: Checking final dataset status...")
        final_status = check_dataset_status(dataset_names)
        
        logger.info(f"Final - Registered: {len(final_status['registered'])}")
        logger.info(f"Final - With workflows: {len(final_status['with_workflows'])}")
        logger.info(f"Final - Without workflows: {len(final_status['without_workflows'])}")
        
        # Step 6: Validate test results
        logger.info("Step 6: Validating test results...")
        
        success = True
        
        # Crash simulation should have succeeded
        if not crash_success:
            logger.error("❌ Crash simulation failed")
            success = False
        
        # Should have some datasets after crash but not all with workflows
        if len(status_after_crash['registered']) == 0:
            logger.error("❌ No datasets were registered during crash simulation")
            success = False
            
        if len(status_after_crash['without_workflows']) == 0:
            logger.error("❌ All datasets had workflows after crash - crash simulation was ineffective")
            success = False
        
        # After recovery, all datasets should be registered
        if len(final_status['registered']) != len(dataset_names):
            logger.error(f"❌ Expected {len(dataset_names)} registered datasets after recovery, got {len(final_status['registered'])}")
            success = False
        
        # After recovery, all registered datasets should have workflows
        if len(final_status['without_workflows']) > 0:
            logger.error(f"❌ {len(final_status['without_workflows'])} datasets still without workflows after recovery")
            success = False
        
        # Should have more workflows after recovery than after crash
        workflows_after_crash = len(status_after_crash['with_workflows'])
        workflows_after_recovery = len(final_status['with_workflows'])
        
        if workflows_after_recovery <= workflows_after_crash:
            logger.error(f"❌ Expected more workflows after recovery ({workflows_after_recovery}) than after crash ({workflows_after_crash})")
            success = False
        
        # Recovery run should have succeeded
        if recovery_result.returncode != 0:
            logger.error(f"❌ Recovery run failed with return code: {recovery_result.returncode}")
            success = False
        
        if success:
            logger.info("✅ TEST PASSED: Crash recovery scenario completed successfully")
            logger.info(f"   - {len(dataset_names)} datasets created")
            logger.info(f"   - {workflows_after_crash} workflows initiated before 'crash'")
            logger.info(f"   - {workflows_after_recovery - workflows_after_crash} additional workflows initiated during recovery")
        else:
            logger.error("❌ TEST FAILED: Crash recovery scenario did not work as expected")
        
        return success
        
    except Exception as e:
        logger.error(f"Test failed with exception: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False
    
    finally:
        # Step 7: Cleanup
        logger.info("Step 7: Cleaning up test datasets...")
        cleanup_test_datasets(dataset_names)
        
        # Clean up test directory
        try:
            if container_path and container_path.exists():
                import shutil
                shutil.rmtree(container_path)
                logger.info(f"Cleaned up test directory: {container_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up test directory: {e}")


if __name__ == "__main__":
    success = run_test()
    sys.exit(0 if success else 1)
