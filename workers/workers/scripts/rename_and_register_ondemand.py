import json
from pathlib import Path
import fire
import shutil
import os
import hashlib
from typing import List, Tuple, Dict, Optional
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

from workers.scripts.register_dataset import RegistrationManager
import workers.api as api

CHECK_INTERVAL = 60  # 60 seconds

RENAMED_SUBDIRECTORIES_PARENT_DIR_NAME = "renamed_subdirectories"
MAX_WORKERS = 4  # Limit concurrent operations to avoid overwhelming system


class Registration:
    def __init__(self,
                 dataset_type: str,
                 path: str,
                 project_id: str = None,
                 description: str = None,
                 prefix: str = None,
                 suffix: str = None,
                 ingest_parent_dir: bool = False,
                 max_workers: int = MAX_WORKERS):
        self.dataset_type = dataset_type
        self.path = path
        self.description = description
        self.project_id = project_id
        self.prefix = prefix
        self.suffix = suffix
        self.ingest_parent_dir = ingest_parent_dir
        self.max_workers = max_workers
        self.project = None
        self._lock = threading.Lock()  # For thread-safe operations

        if self.project_id:
            self.project = api.get_project(project_id=self.project_id)

    def all_subdirectories_processed(self,
                                     dir_path: Path, ) -> bool:
        print(f"Checking if all subdirectories of {dir_path} have been processed...")
        all_subdirectories: List = [item for item in dir_path.iterdir()
                                    if item.is_dir() and item.name != RENAMED_SUBDIRECTORIES_PARENT_DIR_NAME]
        print(f"Found {len(all_subdirectories)} subdirectories.")
        for subdir in all_subdirectories:
            print(f"Checking subdirectory {subdir.name}...")
            new_name = generate_dataset_new_name(
                prefix=self.prefix,
                suffix=self.suffix,
                dataset_name=subdir.name,
            )
            if not self.is_dataset_registered(dataset_name=new_name):
                return False
        return True

    def should_process_candidate(self, candidate_name: str) -> bool:
        """
        Check if a candidate should be processed (idempotence check).
        Returns True if the candidate needs processing, False if already done.
        """
        # If already registered, skip
        if self.is_dataset_registered(dataset_name=candidate_name):
            print(f"Candidate {candidate_name} is already registered, skipping...")
            return False
        
        # If currently registering, skip (let it finish)
        if self.is_dataset_registering(dataset_name=candidate_name):
            print(f"Candidate {candidate_name} is currently being registered, skipping...")
            return False
        
        return True

    def prepare_candidate_directory(self, original_path: Path, new_name: str, 
                                  renamed_parent_dir: Path) -> Optional[Path]:
        """
        Prepare a candidate directory for registration using hard links to save space.
        Returns the path to the prepared directory, or None if should be skipped.
        """
        new_dir_path = renamed_parent_dir / new_name
        
        # Check if we should process this candidate
        if not self.should_process_candidate(new_name):
            return None
        
        # If the new directory exists but candidate is not registered/registering, delete and recreate
        if new_dir_path.exists():
            print(f"New directory {new_name} exists but not registered, deleting and recreating...")
            shutil.rmtree(path=new_dir_path, ignore_errors=True)
            print(f"Deleted existing directory: {new_dir_path}")
        
        # Create the new directory using hard links to save space
        print(f"Creating new directory with hard links: {original_path} -> {new_dir_path}")
        self.create_hardlinked_directory(original_path, new_dir_path)
        print(f"Successfully created with hard links: {new_dir_path}")
        
        return new_dir_path

    def create_hardlinked_directory(self, src_path: Path, dst_path: Path) -> None:
        """
        Create a hard-linked copy of a directory structure.
        This saves space by creating hard links instead of copying files.
        """
        # Create the destination directory
        dst_path.mkdir(parents=True, exist_ok=True)
        
        # Walk through the source directory and create hard links
        for root, dirs, files in os.walk(src_path):
            # Calculate the relative path from source
            rel_path = Path(root).relative_to(src_path)
            dst_root = dst_path / rel_path
            
            # Create subdirectories
            for dir_name in dirs:
                (dst_root / dir_name).mkdir(exist_ok=True)
            
            # Create hard links for files
            for file_name in files:
                src_file = Path(root) / file_name
                dst_file = dst_root / file_name
                
                try:
                    # Create hard link (this will fail if dst_file already exists)
                    os.link(src_file, dst_file)
                except FileExistsError:
                    # File already exists, skip it
                    print(f"Hard link already exists for: {dst_file}")
                except OSError as e:
                    # If hard link fails (e.g., cross-device), fall back to copy
                    print(f"Hard link failed for {src_file}, falling back to copy: {e}")
                    shutil.copy2(src_file, dst_file)

    def process_single_candidate(self, candidate_tuple: Tuple[str, Path], 
                               renamed_parent_dir: Path, description: str) -> bool:
        """
        Process a single candidate (copy and register).
        Returns True if successful, False otherwise.
        """
        candidate_name, original_path = candidate_tuple
        
        try:
            # Prepare the directory
            prepared_path = self.prepare_candidate_directory(original_path, candidate_name, renamed_parent_dir)
            if prepared_path is None:
                return True  # Skipped, but not an error
            
            # Register the dataset
            print(f"Registering candidate: {candidate_name}")
            self.register_single_dataset(candidate_name, prepared_path, description)
            print(f"Successfully registered: {candidate_name}")
            return True
            
        except Exception as e:
            print(f"Error processing candidate {candidate_name}: {e}")
            traceback.print_exc()
            
            # Clean up on failure
            if prepared_path and prepared_path.exists():
                shutil.rmtree(path=prepared_path, ignore_errors=True)
                print(f"Cleaned up failed directory: {prepared_path}")
            
            return False

    def get_eligible_candidates(self, dir_path: str) -> List[Tuple[str, Path]]:
        """
        Get list of eligible candidates to register based on ingest mode.
        
        Returns:
            List of tuples containing (dataset_name, original_path)
        """
        directory_path: Path = Path(dir_path)
        directory_name: str = directory_path.name
        
        if self.ingest_parent_dir:
            # Return parent directory as single candidate
            parent_dir_new_name = generate_dataset_new_name(
                prefix=self.prefix,
                suffix=self.suffix,
                dataset_name=directory_name,
            )
            return [(parent_dir_new_name, directory_path)]
        else:
            # Return subdirectories as candidates
            candidates = []

            for subdirectory in directory_path.iterdir():
                if not subdirectory.is_dir():
                    print(f"Skipping non-directory file {str(subdirectory)}")
                    continue
                elif subdirectory.name == RENAMED_SUBDIRECTORIES_PARENT_DIR_NAME:
                    print(f"Skipping renamed-subdirectories' parent directory {str(subdirectory)}")
                    continue

                # Generate new name based on whether prefix or suffix is provided
                if self.prefix or self.suffix:
                    subdirectory_new_name: str = generate_dataset_new_name(
                        prefix=self.prefix,
                        suffix=self.suffix,
                        dataset_name=subdirectory.name,
                    )
                else:
                    subdirectory_new_name: str = subdirectory.name

                print(f"Found candidate: {subdirectory.name} -> {subdirectory_new_name}")
                candidates.append((subdirectory_new_name, subdirectory))

            return candidates

    def process_and_register_datasets(self, candidates: List[Tuple[str, Path]], 
                                    dir_path: str, description: str = None, dry_run: bool = False) -> None:
        """
        Process and register a list of datasets with parallelization.
        
        Args:
            candidates: List of tuples containing (dataset_name, original_path)
            dir_path: Original directory path for cleanup purposes
            description: Optional description for datasets
            dry_run: Whether to simulate the process without making changes
        """
        if dry_run:
            print(f"Dry run: Would register {len(candidates)} datasets")
            for dataset_name, original_path in candidates:
                print(f"  - {dataset_name} from {original_path}")
            return

        # Filter candidates that need processing (idempotence)
        candidates_to_process = []
        for candidate_name, original_path in candidates:
            if self.should_process_candidate(candidate_name):
                candidates_to_process.append((candidate_name, original_path))
            else:
                print(f"Skipping already processed candidate: {candidate_name}")

        if not candidates_to_process:
            print("No candidates need processing - all are already registered or being processed.")
            return

        print(f"Processing {len(candidates_to_process)} candidates...")

        # Prepare the renamed parent directory
        directory_path = Path(dir_path)
        renamed_parent_dir = directory_path / RENAMED_SUBDIRECTORIES_PARENT_DIR_NAME
        renamed_parent_dir.mkdir(exist_ok=True)

        # Process candidates in parallel
        successful_count = 0
        failed_count = 0
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all tasks
            future_to_candidate = {
                executor.submit(self.process_single_candidate, candidate, renamed_parent_dir, description): candidate
                for candidate in candidates_to_process
            }
            
            # Process completed tasks
            for future in as_completed(future_to_candidate):
                candidate_name, _ = future_to_candidate[future]
                try:
                    success = future.result()
                    if success:
                        successful_count += 1
                        print(f"✓ Completed: {candidate_name}")
                    else:
                        failed_count += 1
                        print(f"✗ Failed: {candidate_name}")
                except Exception as e:
                    failed_count += 1
                    print(f"✗ Exception for {candidate_name}: {e}")

        print(f"Processing complete. Successful: {successful_count}, Failed: {failed_count}")

        # Clean up renamed_subdirectories folder if processing subdirectories
        if not self.ingest_parent_dir:
            print("Checking if all subdirectories have been processed and registered...")
            if self.all_subdirectories_processed(directory_path):
                print("All subdirectories processed and registered.")
                # Once all subdirectories have been successfully processed,
                # delete the `renamed_subdirectories` directory
                if renamed_parent_dir.exists():
                    shutil.rmtree(path=renamed_parent_dir)
                    print(f"Deleted renamed subdirectories' parent directory: {renamed_parent_dir}")
                print("All subdirectories processed.")
            else:
                print("Some subdirectories are still unprocessed.")

    def register_dataset(self,
                         dir_path: str,
                         description: str = None,
                         dry_run: bool = False) -> None:
        """
        Idempotent method - will not register a duplicate Dataset.

        :param dir_path:
        :param description:
        :param dry_run:
        :return:
        """
        directory_path: Path = Path(dir_path)
        directory_name: str = directory_path.name
        print(f"Processing {str(directory_name)}")

        # Get eligible candidates based on ingest mode
        candidates = self.get_eligible_candidates(dir_path)

        # Process and register the candidates
        self.process_and_register_datasets(candidates, dir_path, description, dry_run)

    def register_single_dataset(self, dataset_name: str, dataset_path: Path, description: str = None) -> None:
        """
        Register a single dataset as either Raw Data or Data Product based on dataset_type.
        
        :param dataset_name: Name of the dataset to register
        :param dataset_path: Path to the dataset directory
        :param description: Optional description for the dataset
        """
        if self.dataset_type == 'RAW_DATA':
            register_raw_data(dataset_name, dataset_path, self.project_id, description)
        else:
            register_data_product(dataset_name, dataset_path, self.project_id, description)

    def get_matching_dataset(self, dataset_name: str) -> Dict | None:
        matching_datasets: List[Dict] = api.get_all_datasets(dataset_type=self.dataset_type,
                                                             name=dataset_name,
                                                             include_states=True)
        print(f"Searching for {self.dataset_type} named {dataset_name}...")
        print(f"matching datasets count: {len(matching_datasets)}")
        if len(matching_datasets) == 0:
            print(f"{self.dataset_type} {dataset_name} not found")
            return None
        return matching_datasets[0]

    def is_dataset_registered(self,
                              dataset_name: str) -> bool:
        """
        Dataset is considered registered if it has been successfully archived (i.e. it has reached state ARCHIVED).
        """

        print(f"Checking if {self.dataset_type} {dataset_name} is registered...")
        matching_dataset: Dict = self.get_matching_dataset(dataset_name)
        if not matching_dataset:
            return False

        matching_dataset_is_archived = any(
            state['state'] == 'ARCHIVED' for state in matching_dataset.get('states', []))
        return matching_dataset_is_archived

    def is_dataset_registering(self, dataset_name: str) -> bool:
        """
        Dataset is considered to be in the middle of registration if the `Integrated` workflow has been initiated on the Dataset
        """

        print(f"Checking if {self.dataset_type} {dataset_name} is registering...")
        matching_dataset: Dict = self.get_matching_dataset(dataset_name)
        if not matching_dataset:
            return False

        workflow_query_response = api.get_dataset_workflows(dataset_id=matching_dataset['id'])
        dataset_workflows = workflow_query_response['results']

        is_integrated_workflow_present = any(workflow['name'] == 'integrated' for workflow in dataset_workflows)
        return is_integrated_workflow_present


def generate_dataset_new_name(prefix: str = None,
                              suffix: str = None,
                              dataset_name: str = None) -> str:
    """
    Generate a new name for a Dataset directory based on provided components.

    The order of components in the generated name is:
    {prefix}-{dir_name}-{suffix}

    Args:
        prefix (str, optional): A prefix to be added at the beginning of the name.
        suffix (str, optional): A suffix to be added at the end of the name.
        dataset_name (str, optional): The original name of the directory.

    Returns:
        str: The generated name for the directory.

    Example usage:
        generate_dataset_new_name(prefix="pre", suffix="suf", dir_name="data")
        # Returns: "pre-data-suf"

        generate_dataset_new_name(prefix="pre", dir_name="data")
        # Returns: "pre-data"

        generate_dataset_new_name(dir_name="data")
        # Returns: "data"
    """
    components = []

    if prefix:
        components.append(prefix)
    if dataset_name:
        components.append(dataset_name)
    if suffix:
        components.append(suffix)

    return "-".join(filter(None, components))


def calculate_file_hash(filepath: str,
                        block_size: int = 65536) -> str:
    """Calculate the MD5 hash of a file."""
    file_hash = hashlib.md5()
    with open(filepath, "rb") as f:
        for block in iter(lambda: f.read(block_size), b""):
            file_hash.update(block)
    return file_hash.hexdigest()


def directories_are_equal(dir1: Path,
                          dir2: Path) -> bool:
    """
    Compare two directories by calculating and comparing checksums of all files.
    """
    dir1_contents: List[Tuple[str, List[str], List[str]]] = list(os.walk(dir1))
    dir2_contents: List[Tuple[str, List[str], List[str]]] = list(os.walk(dir2))

    if len(dir1_contents) != len(dir2_contents):
        return False

    for (path1, dirs1, files1), (path2, dirs2, files2) in zip(dir1_contents, dir2_contents):
        if len(dirs1) != len(dirs2) or len(files1) != len(files2):
            return False

        for d1, d2 in zip(sorted(dirs1), sorted(dirs2)):
            if d1 != d2:
                return False

        for f1, f2 in zip(sorted(files1), sorted(files2)):
            if f1 != f2:
                return False

            file1: str = os.path.join(path1, f1)
            file2: str = os.path.join(path2, f2)

            # Compare file sizes first (quick check)
            if os.path.getsize(file1) != os.path.getsize(file2):
                return False

            # If file sizes are same, compare checksums
            if calculate_file_hash(file1) != calculate_file_hash(file2):
                return False

    return True


def register_data_product(new_name: str,
                          new_path: Path,
                          project_id: str = None,
                          description: str = None) -> None:
    dataset_type = 'DATA_PRODUCT'

    print(f'Dataset type: {dataset_type}')
    print(f'Dataset name: {new_name}')
    print(f'Dataset path: {str(new_path)}')
    if project_id:
        print(f'Project ID: {project_id}')
    if description:
        print(f'Description: {description}')

    if not new_path.exists():
        print(f'{new_path} does not exist')
        return

    reg = RegistrationManager(dataset_type)
    reg.register_candidate(new_name, str(new_path), project_id, description)
    print(f"Registered: {new_name}")


def register_raw_data(new_name: str,
                      new_path: Path,
                      project_id: str = None,
                      description: str = None) -> None:
    dataset_type = 'RAW_DATA'

    print(f'Dataset type: {dataset_type}')
    print(f'Dataset name: {new_name}')
    print(f'Dataset path: {str(new_path)}')
    if project_id:
        print(f'Project ID: {project_id}')
    if description:
        print(f'Description: {description}')

    if not new_path.exists():
        print(f'{new_path} does not exist')
        return

    reg = RegistrationManager(dataset_type)
    reg.register_candidate(new_name, str(new_path), project_id, description)
    print(f"Registered: {new_name}")


def register_dataset(dir_path: str,
                    dataset_type: str = 'DATA_PRODUCT',
                    project_id: str = None,
                    description: str = None,
                    prefix: str = None,
                    suffix: str = None,
                    ingest_parent_dir: bool = False,
                    dry_run: bool = False,
                    max_workers: int = MAX_WORKERS) -> None:
    """
    Main function to register datasets with enhanced options.
    
    Args:
        dir_path: Path to the directory containing subdirectories to process
        dataset_type: Type of dataset to register ('DATA_PRODUCT' or 'RAW_DATA')
        project_id: Optional project ID to associate with datasets
        description: Optional description for datasets
        prefix: Optional prefix for renamed directories
        suffix: Optional suffix for renamed directories
        ingest_parent_dir: Whether to ingest the parent directory instead of subdirectories (default: False)
        dry_run: Whether to simulate the process without making changes (default: False)
        max_workers: Maximum number of concurrent operations (default: 4)
    """
    
    reg = Registration(
        dataset_type=dataset_type,
        path=dir_path,
        project_id=project_id,
        description=description,
        prefix=prefix,
        suffix=suffix,
        ingest_parent_dir=ingest_parent_dir,
        max_workers=max_workers
    )
    
    reg.register_dataset(dir_path, description, dry_run)


"""
This script processes subdirectories within a given directory, renames them according to
a specific format, and registers them as data products or raw data.

What it does:
1. Processes all subdirectories within the specified DIR_PATH (or the parent directory itself).
2. Optionally renames directories to the format: {PREFIX}-{DIR_NAME}-{SUFFIX}.
3. Copies renamed directories to a new 'renamed_directories' folder (if renaming).
4. Registers each new directory as a Data Product or Raw Data via the register_ondemand script.
5. Optionally assigns a description to each registered dataset.
6. Optionally assigns a Project ID to each registered dataset.

Usage:
python -m workers.scripts.rename_and_register_ondemand [OPTIONS] DIR_PATH

Arguments:
DIR_PATH: The path to the directory containing subdirectories to process.

Options:
--dataset-type: Type of dataset to register ('DATA_PRODUCT' or 'RAW_DATA', default: 'DATA_PRODUCT')
--project-id: Optional ID of the project to associate with the registered datasets.
--description: Optional description to add to each registered dataset.
--prefix: Optional prefix to add to renamed directory names.
--suffix: Optional suffix to add to renamed directory names.
--rename-directories: Whether to rename directories (default: True).
--ingest-parent-dir: Whether to ingest the parent directory instead of subdirectories (default: False).
--dry-run: Whether to simulate the process without making changes (default: False).

Example usage:
1. Dry run (simulate without changes):
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory --description="Sample dataset description" --dry-run=True

2. Actually process and register with project ID:
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory --project-id=abc123 --dry-run=False

3. Register as raw data with custom prefix:
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory --dataset-type=RAW_DATA --prefix=myproject --dry-run=False

4. Ingest parent directory instead of subdirectories:
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory --ingest-parent-dir=True --dry-run=False

5. Register without renaming directories:
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory --rename-directories=False --dry-run=False
"""

if __name__ == "__main__":
    fire.Fire(register_dataset)
