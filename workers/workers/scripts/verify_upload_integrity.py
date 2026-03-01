#!/usr/bin/env python3
"""
Standalone Upload Verification Script

Performs BLAKE3 checksum verification for uploaded datasets.
Designed to be run as a subprocess with output captured to database.

All output (stdout/stderr) is automatically persisted to worker_process logs
and displayed in the UI at /uploads/:id

Usage:
    python -m workers.scripts.verify_upload_integrity <dataset_id> <task_id> <retry_count> <max_retries>
"""

import sys
import os
import argparse
import traceback
from datetime import datetime

from workers import api
from workers.constants.upload import UPLOAD_STATUS
from workers.upload import verify_upload_integrity as verify_integrity_impl


def main():
    parser = argparse.ArgumentParser(description='Verify upload integrity for a dataset')
    parser.add_argument('dataset_id', type=int, help='Dataset ID to verify')
    parser.add_argument('task_id', type=str, help='Celery task ID')
    parser.add_argument('retry_count', type=int, help='Current retry count (0-indexed)')
    parser.add_argument('max_retries', type=int, help='Maximum retry attempts')
    args = parser.parse_args()
    
    dataset_id = args.dataset_id
    task_id = args.task_id
    retry_count = args.retry_count
    max_retries = args.max_retries
    is_final_retry = retry_count >= max_retries
    
    print("="*80)
    print("UPLOAD VERIFICATION TASK STARTED")
    print(f"Dataset ID: {dataset_id}")
    print(f"Task ID: {task_id}")
    print(f"Retry attempt: {retry_count + 1}/{max_retries + 1}")
    print(f"Timestamp: {datetime.utcnow().isoformat()}")
    print("="*80)
    print()
    
    try:
        # Fetch dataset and upload log
        print(f"Fetching dataset {dataset_id}...")
        dataset = api.get_dataset(dataset_id=dataset_id, workflows=True)
        upload_log = api.get_dataset_upload_log(dataset_id)
        
        dataset_name = dataset.get('name')
        origin_path = dataset.get('origin_path')
        
        print(f"Dataset name: {dataset_name}")
        print(f"Origin path: {origin_path}")
        print(f"Current status: {upload_log.get('status')}")
        print()
        
        # Verify integrity (idempotent - safe to run multiple times)
        print("Starting integrity verification...")
        print("This may take a while for large datasets (up to 24 hours for very large files)")
        print()
        
        verify_integrity_impl(dataset, upload_log)
        
        print()
        print("✓ Integrity verification PASSED")
        print(f"Updating status to {UPLOAD_STATUS['VERIFIED']}...")
        
        # Update status to VERIFIED
        api.update_dataset_upload_log(
            dataset_id=dataset_id,
            log_data={'status': UPLOAD_STATUS['VERIFIED']}
        )
        
        print()
        print("="*80)
        print("UPLOAD VERIFICATION TASK COMPLETED SUCCESSFULLY")
        print(f"Dataset ID: {dataset_id}")
        print(f"Dataset name: {dataset_name}")
        print(f"Expected resolution: manage_upload_workflows.py will pick this up on next run")
        print(f"                     and trigger integrated workflow")
        print("="*80)
        
        sys.exit(0)
        
    except Exception as e:
        # Print full error details
        print()
        print("="*80)
        if is_final_retry:
            print("FAILURE MODE: VERIFICATION EXCEPTION (FINAL RETRY)")
        else:
            print("FAILURE MODE: VERIFICATION EXCEPTION (WILL RETRY)")
        print(f"Dataset ID: {dataset_id}")
        print(f"Task ID: {task_id}")
        print(f"Retry attempt: {retry_count + 1}/{max_retries + 1}")
        print(f"Error: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        print()
        print("Full traceback:")
        traceback.print_exc()
        print()
        
        if is_final_retry:
            print("This was the final retry attempt")
            print(f"Expected resolution: Status set to {UPLOAD_STATUS['VERIFICATION_FAILED']}")
            print("                     Admin will be notified")
            print("                     Admin should investigate:")
            print("                       - Check if files exist at origin_path")
            print("                       - Check if filesystem is accessible")
            print("                       - Check if BLAKE3 library is installed")
            print("                       - Consider disabling checksum verification")
            print("="*80)
            
            # Final failure - mark as VERIFICATION_FAILED
            try:
                api.update_dataset_upload_log(
                    dataset_id=dataset_id,
                    log_data={
                        'status': UPLOAD_STATUS['VERIFICATION_FAILED'],
                        'metadata': {
                            'failure_reason': f'{type(e).__name__}: {str(e)}',
                            'task_id': task_id,
                            'failed_at': datetime.utcnow().isoformat(),
                            'retries_exhausted': True,
                        }
                    }
                )
                print(f"✓ Status updated to {UPLOAD_STATUS['VERIFICATION_FAILED']}")
            except Exception as update_error:
                print(f"✗ Failed to update status: {update_error}")
            
            # Send admin notification
            try:
                api.create_notification({
                    'title': f'Upload Verification Failed: {dataset.get("name", dataset_id)}',
                    'message': (
                        f'Upload verification permanently failed after {retry_count + 1} attempts.\n\n'
                        f'Dataset ID: {dataset_id}\n'
                        f'Dataset Name: {dataset.get("name")}\n'
                        f'Task ID: {task_id}\n'
                        f'Error: {str(e)}\n\n'
                        f'Manual intervention required.\n'
                        f'View logs at /uploads/:id (check dataset uploads table for upload log ID)'
                    ),
                    'type': 'error',
                    'metadata': {
                        'dataset_id': dataset_id,
                        'task_id': task_id,
                        'error': str(e),
                        'timestamp': datetime.utcnow().isoformat(),
                    },
                })
                print("✓ Admin notification sent")
            except Exception as notify_error:
                print(f"✗ Failed to send admin notification: {notify_error}")
        else:
            print(f"Expected resolution: Celery will retry in 60 seconds")
            print(f"                     Retry attempt {retry_count + 2}/{max_retries + 1} will start soon")
            print("="*80)
        
        # Exit with error code to signal failure to Celery
        sys.exit(1)


if __name__ == '__main__':
    main()
