import json
from pathlib import Path
import fire
import shutil
import os
import hashlib
from typing import List, Tuple, Dict, Optional
import time
import traceback
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
            
from sca_rhythm import Workflow

import workers.workflow_utils as wf_utils
from workers.celery_app import app as celery_app
import workers.api as api
from workers.config import common
from workers.utils import checksum
    

class Registration:
    def __init__(self,
                 dataset_type: str,
                 path: str,
                 project_id: str = None,
                 description: str = None,
                 prefix: str = None,
                 suffix: str = None,
                 ingest_subdirs: bool = False,
                 skip_checksum_verification: bool = False):
        self.dataset_type = dataset_type
        self.path = path
        self.description = description
        self.project_id = project_id
        self.prefix = prefix
        self.suffix = suffix
        self.ingest_subdirs = ingest_subdirs
        self.skip_checksum_verification = skip_checksum_verification
        self.project = None
        self.renamed_hard_links_parent_dir = None
        self.created_datasets = []
        self.conflicted_datasets = []
        self.errored_datasets = []
        self.original_to_registered_mapping = {}  # Maps original dir names to registered dataset names

        if self.project_id:
            self.project = api.get_project(project_id=self.project_id)


    def should_process_candidate(self, candidate_name: str) -> bool:
        """
        Check if a candidate should be processed. Returns True if the candidate Dataset exists in the system.
        """
        return not self.exists(candidate_name)
        
    
    def get_eligible_candidates(self) -> List[Tuple[str, Path]]:
        """
        Get list of eligible candidates to register based on ingest mode.
        
        Returns:
            List of tuples containing (dataset_name, original_path)
        """
        directory_path: Path = Path(self.path)
        directory_name: str = directory_path.name
        
        if not self.ingest_subdirs:
            # Return parent directory as single candidate
            parent_dir_new_name = generate_dataset_new_name(
                prefix=self.prefix,
                suffix=self.suffix,
                dataset_name=directory_name,
            )
            return [(parent_dir_new_name, directory_path)]
        else:
            # Return subdirectories as candidates (only subdirectories at first level are considered)
            candidates = []
            non_directory_files = []

            for item in directory_path.iterdir():
                if not item.is_dir():
                    non_directory_files.append(item.name)
                    continue
                subdirectory_new_name: str = generate_dataset_new_name(
                    prefix=self.prefix,
                    suffix=self.suffix,
                    dataset_name=item.name,
                )
                print(f"Found candidate: {item.name} -> {subdirectory_new_name}")
                candidates.append((subdirectory_new_name, item))
            
            # Log non-directory files that won't be registered
            if non_directory_files:
                print("Non-directory files found (will not be registered as datasets):")
                # Show first 10 files, then indicate if there are more
                files_to_show = non_directory_files[:10]
                for fname in files_to_show:
                    print(fname)                
                if len(non_directory_files) > 10:
                    remaining_count = len(non_directory_files) - 10
                    print(f"... (showing first 10 files, {remaining_count} more files not shown)")

            return candidates


    def process_and_register_candidates(self,
                                        candidates: List[Tuple[str, Path]]) -> None:
        """
        Process and register a list of datasets in bulk.
        
        Args:
            candidates: List of tuples containing (dataset_name, original_path)
        """
        
        # Filter candidates that need processing
        candidates_to_process = []
        for candidate_name, candidate_path in candidates:
            if self.should_process_candidate(candidate_name):
                candidates_to_process.append((candidate_name, candidate_path))            
        if not candidates_to_process:
            print("No candidates need processing - all are already registered or being processed.")
            return

        print(f"Processing {len(candidates_to_process)} candidates...")
            
        # Register datasets
        self.register_candidate_dirs(candidates_to_process)
        
        # After registration, check for existing datasets that need workflow kickoff
        if not self.dry_run:
            self.initiate_workflows(candidates_to_process)
        

    def register_candidate_dirs(self, candidates: List[Tuple[str, Path]]) -> None:
        """Register all datasets"""
        if self.dry_run:
            print(f"DRY RUN - Would register {len(candidates)} datasets")
            
            # Log what would be registered
            for candidate_name, original_path in candidates:
                if candidate_name != original_path.name:
                    print(f"    Directory '{original_path.name}' would be registered as {self.dataset_type} '{candidate_name}'")
                else:
                    print(f"    Directory '{original_path.name}' would be registered as {self.dataset_type} '{candidate_name}'")
        else:
            try:
              print(f" Preparing bulk registration for {len(candidates)} datasets...")
              
              # Prepare bulk registration data according to API specification
              bulk_data = []
              for candidate_name, candidate_path in candidates:
                  dataset_info = {
                      'name': candidate_name,
                      'type': self.dataset_type,
                      'origin_path': str(candidate_path)
                  }
                  # Add description if provided
                  if self.description:
                      dataset_info['description'] = self.description
                  # Add project ID if provided
                  if self.project_id:
                      dataset_info['project_id'] = self.project_id
                  
                  bulk_data.append(dataset_info)
                  
                  # Store mapping from original directory name to registered dataset name,
                  # for logging purposes
                  original_dir_name = candidate_path.name
                  self.original_to_registered_mapping[original_dir_name] = candidate_name
              
              # Call bulk registration endpoint
              print(f" Calling bulk registration API...")
              response = api.bulk_create_datasets(bulk_data)
              
              # Process response
              self.created_datasets = response.get('created', [])
              self.conflicted_datasets = response.get('conflicted', [])
              self.errored_datasets = response.get('errored', [])
              
              # Log results
              print(f"Bulk registration results:")
              self.log_registration_results()
              
            except Exception as e:
                print(f"Error in bulk registration: {e}")
                return False


    def register_datasets(self) -> None:
        """
        Idempotent method - will not register a duplicate Dataset.

        :return:
        """
        print(f"Processing {str(self.path)}")

        # Get eligible candidates based on ingest mode
        candidates = self.get_eligible_candidates()

        # Process eligible candidates
        self.process_and_register_candidates(candidates)


    def log_dataset_registration_result(self, dataset: Dict) -> None:
      registered_name = dataset['name']
      # Find original directory name that maps to this registered name
      original_dir_name = None
      for orig_name, reg_name in self.original_to_registered_mapping.items():
          if reg_name == registered_name:
              original_dir_name = orig_name
              break            
      if original_dir_name and original_dir_name != registered_name:
          print(f"  {original_dir_name} → {registered_name}")
      else:
          print(f"  {registered_name}")      


    def log_registration_results(self) -> None:
        print("Created datasets:")
        for dataset in self.created_datasets:
            self.log_dataset_registration_result(dataset)
        print("Conflicted datasets (already exist):")
        for dataset in self.conflicted_datasets:
            self.log_dataset_registration_result(dataset)        
        print("Errored datasets:")
        for dataset in self.errored_datasets:
            self.log_dataset_registration_result(dataset)

    
    def start_integration(self, dataset_name: str):
        """
        Start the Integrated workflow on an existing dataset.
        """
        try:
            # Get existing dataset
            existing_dataset = self.get_matching_dataset(dataset_name)
            if not existing_dataset:
                print(f"Dataset {dataset_name} not found")
                return False
            
            # Create and start workflow
            wf_body = wf_utils.get_wf_body(wf_name='integrated')
            wf = Workflow(celery_app=celery_app, **wf_body)
            wf.start(existing_dataset['id'])
            
            print(f"Successfully started Integrated workflow for existing dataset: {dataset_name}")
            return True
            
        except Exception as e:
            print(f"Error starting workflow for {dataset_name}: {e}")
            return False


    def initiate_workflows(self, candidates: List[Tuple[str, Path]]) -> None:
        """
        Workflow initiation for all candidates after registration.
        
        Args:
            candidates: List of tuples containing (dataset_name, original_path)
        """
        if self.dry_run:
            print("DRY RUN: Skipping workflow initiation ")
            return
            
        print("Initiating workflows for all eligible candidates...")
        
        workflows_started = 0
        
        for candidate_name, _ in candidates:
            # Check if dataset exists but doesn't have workflow initiated
            if not self.integration_initiated(candidate_name):
                print(f"Found existing dataset {candidate_name} without Integrated workflow - starting workflow...")
                if self.start_integration(candidate_name):
                    workflows_started += 1
                else:
                    print(f"Failed to start workflow for existing dataset: {candidate_name}")
        
        if workflows_started > 0:
            print(f"Started {workflows_started} workflows for existing datasets")
        else:
            print("No existing datasets found that need workflow kickoff")
        
        print("Workflow initiation completed")


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


    def exists(self, dataset_name: str) -> bool:
        """
        Checks whether a Dataset with this name and the provided type exists in the system 
        """

        print(f"Checking if {self.dataset_type} {dataset_name} is registered...")
        matching_dataset: Dict = self.get_matching_dataset(dataset_name)
        return matching_dataset is not None

    
    def is_integrated(self, dataset_name: str) -> bool:
        """
        Dataset is considered integrated if it has been successfully archived (i.e. it has reached state ARCHIVED).
        Returns False if the dataset doesn't exist.
        """

        print(f"Checking if {self.dataset_type} {dataset_name} is integrated...")
        matching_dataset: Dict = self.get_matching_dataset(dataset_name)
        if not matching_dataset:
            return False

        matching_dataset_is_archived = any(
            state['state'] == 'ARCHIVED' for state in matching_dataset.get('states', []))
        return matching_dataset_is_archived


    def integration_initiated(self, dataset_name: str) -> bool:
        """
        Dataset is considered to be in the middle of integration if the `Integrated` workflow has been initiated on the Dataset.
        Returns False if the dataset doesn't exist.
        """

        print(f"Checking if {self.dataset_type} {dataset_name} is being integrated...")
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


def init(dir_path: str,
                    dataset_type: str = 'DATA_PRODUCT',
                    project_id: str = None,
                    description: str = None,
                    prefix: str = None,
                    suffix: str = None,
                    ingest_subdirs: bool = False,
                    dry_run: bool = False) -> None:
    """
    Initiate processing of the provided directory.
        
    Args:
        dir_path: Path to the directory containing subdirectories to process
        dataset_type: Type of dataset to register ('DATA_PRODUCT' or 'RAW_DATA')
        project_id: Optional project ID to associate with datasets
        description: Optional description for datasets
        prefix: Optional prefix for renamed directories
        suffix: Optional suffix for renamed directories
        ingest_subdirs: Whether to ingest subdirectories instead of the parent directory (default: False)
        dry_run: Whether to simulate the process without making changes (default: False)
    """
    
    reg = Registration(
        dataset_type=dataset_type,
        path=dir_path,
        project_id=project_id,
        description=description,
        prefix=prefix,
        suffix=suffix,
        ingest_subdirs=ingest_subdirs,
    )
    
    if dry_run:
        print(f"DRY RUN MODE")

    reg.register_datasets()


"""
This script registers Datasets on-demand in Bioloop. It is intended to allow importing multiple Datasets into
Bioloop via scripting without the need to use the web interface, while also offering the option to choose
registration parameters.

Either the directory provided as an argument or the subdirectories within it are registered as Datasets.

What it does:
1. Accepts a directory path as an argument.
2. Gathers a list of candidate directories to be registered. This can be either the directory provided as an argument,
or the subdirectories within it, depending on the ingest_subdirs flag.
3. Optionally renames candidate directories to the format: {PREFIX}-{DIR_NAME}-{SUFFIX} format, by creating hard-linked copies.
4. Registers each new directory as a Data Product or Raw Data. This involves persisting a record for the Dataset in the database.
5. Initiates the Integrated workflow for each registered dataset, which will start the ingestion process.

Note: When ingesting subdirectories (ingest_subdirs=True), only the first level of subdirectories 
within the provided directory is scanned for registration as datasets. Nested subdirectories are not processed.

Note: If renaming is enabled, the script creates hard-linked copies of renamed directories to a new '.{arg_dir_name}__renamed' folder.

Note: Why Hard-Linking Instead of Copying:
- **Space Efficiency**: Hard-links create additional directory entries that point to the same inode,
  consuming negligible additional disk space compared to full directory copies.
- **Speed**: Hard-linking is nearly instantaneous, even for multi-terabyte directories, as it only
  creates metadata entries rather than duplicating file content.
- **Data Integrity**: Since hard-links reference the same physical data, there's no risk of
  corruption during the copying process.
- **Idempotency**: The script can safely re-run without creating duplicate data, as hard-links
  are automatically cleaned up and recreated if needed.

Usage:
python -m workers.scripts.register_ondemand [OPTIONS] DIR_PATH

Arguments:
DIR_PATH: The path to the directory containing subdirectories to process.

Options:
--dataset-type: Type of dataset to register ('DATA_PRODUCT' or 'RAW_DATA', default: 'DATA_PRODUCT')
--project-id: Optional ID of the project to associate with the registered datasets.
--description: Optional description to add to each registered dataset.
--prefix: Optional prefix to add to renamed directory names.
--suffix: Optional suffix to add to renamed directory names.
--ingest-subdirs: Whether to ingest subdirectories instead of the parent directory (default: False).
--dry-run: Whether to simulate the process without making changes (default: False).

Example usage:
1. Dry run (simulate without changes):
   python -m workers.scripts.register_ondemand /path/to/data_directory --description="Sample dataset description" --dry-run=True

2. Actually process and register with project ID:
   python -m workers.scripts.register_ondemand /path/to/data_directory --project-id=abc123

3. Register as raw data with custom prefix:
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=RAW_DATA --prefix=myproject

4. Ingest subdirectories instead of parent directory:
   python -m workers.scripts.register_ondemand /path/to/data_directory --ingest-subdirs=True
"""

if __name__ == "__main__":
    fire.Fire(init)
