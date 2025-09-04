#!/usr/bin/env python3
"""
Script to calculate the MD5 checksum of a file or directory.

This script provides two approaches:
1. Simple mode (default): Creates tar files without progress tracking
2. Progress tracking mode: Creates tar files with progress tracking using a mock celery task

Usage:
    # Simple mode (no progress tracking)
    python checksum_test.py /path/to/directory
    
    # With custom output path
    python checksum_test.py /path/to/directory -o /path/to/output.tar
    
    # Progress tracking mode (requires celery instance)
    python checksum_test.py /path/to/directory --progress
"""

import argparse
import sys
import shutil
import logging
from pathlib import Path
import json

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers.config import config

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

def create_mock_celery_task():
    """
    Create a mock celery task for progress tracking.
    This allows the script to use progress tracking without requiring a real celery instance.
    """
    try:
        from celery import Celery
        
        # Create a minimal mock task that mimics the required interface
        class MockTask:
            def __init__(self):
                self.id = "mock_task_12345"
                # Create a mock request object
                class MockRequest:
                    def __init__(self, task_id):
                        self.id = task_id
                
                self.request = MockRequest(self.id)
                self.backend = None
                self.app = Celery()
                self.app.conf.update(celeryconfig.__dict__)
        
        return MockTask()
    except ImportError:
        logger.warning("Celery not available, progress tracking disabled")
        return None

def make_tarfile_with_progress(celery_task, tar_path: Path, source_dir: str, source_size: int = None):
    """
    Create a tar file from a source directory with progress tracking.
    
    @param celery_task: Celery task for progress tracking
    @param tar_path: Path where the tar file should be created
    @param source_dir: Source directory to tar
    @param source_size: Size for progress tracking
    @return: Path to the created tar file
    """
    logger.info(f'creating tar of {source_dir} at {tar_path} with progress tracking')
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()

    if celery_task and source_size:
        with wf_utils.track_progress_parallel(celery_task=celery_task,
                                              name='tar',
                                              progress_fn=lambda: tar_path.stat().st_size if tar_path.exists() else 0,
                                              total=source_size,
                                              units='bytes'):
            cmd.tar(tar_path=tar_path, source_dir=source_dir)
    else:
        # Fallback to direct tar creation
        cmd.tar(tar_path=tar_path, source_dir=source_dir)

    return tar_path

def make_tarfile(tar_path: Path, source_dir: str, source_size: int = None):
    """
    Create a tar file from a source directory without requiring a celery task.
    
    @param tar_path: Path where the tar file should be created
    @param source_dir: Source directory to tar
    @param source_size: Optional size for progress tracking (unused in standalone mode)
    @return: Path to the created tar file
    """
    logger.info(f'creating tar of {source_dir} at {tar_path}')
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()

    # Create tar file directly without progress tracking
    # using python to create tar files does not support --sparse
    # SDA has trouble uploading sparse tar files
    cmd.tar(tar_path=tar_path, source_dir=source_dir)

    return tar_path


def main():
    parser = argparse.ArgumentParser(
        description="Create a tar file from a directory and calculate its MD5 checksum",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        "path",
        type=str,
        help="Path to the directory to tar and checksum"
    )
    
    parser.add_argument(
        "--output", "-o",
        type=str,
        help="Output path for the tar file (default: {input_path}.tar)"
    )
    
    parser.add_argument(
        "--progress", "-p",
        action="store_true",
        help="Enable progress tracking (requires celery dependencies)"
    )
    
    args = parser.parse_args()
    
    # Convert to Path object and validate
    source_dir = Path(args.path)
    
    if not source_dir.exists():
        print(f"Error: Path '{args.path}' does not exist", file=sys.stderr)
        sys.exit(1)
    
    if not source_dir.is_dir():
        print(f"Error: Path '{args.path}' is not a directory", file=sys.stderr)
        sys.exit(1)
    
    # Determine output tar file path
    if args.output:
        tar_path = Path(args.output)
    else:
        tar_path = source_dir.with_suffix('.tar')
    
    try:
        # Create the tar file
        if args.progress:
            # Use progress tracking mode
            celery_task = create_mock_celery_task()
            if celery_task:
                # Estimate source size for progress tracking
                source_size = sum(f.stat().st_size for f in source_dir.rglob('*') if f.is_file())
                make_tarfile_with_progress(celery_task=celery_task, tar_path=tar_path, source_dir=str(source_dir), source_size=source_size)
            else:
                logger.warning("Progress tracking not available, falling back to simple mode")
                make_tarfile(tar_path=tar_path, source_dir=str(source_dir))
        else:
            # Use simple mode
            make_tarfile(tar_path=tar_path, source_dir=str(source_dir))
        
        # Calculate and display checksum
        checksum = utils.checksum(tar_path)
        print(f"Tar file created: {tar_path}")
        print(f"MD5 checksum: {checksum}")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
