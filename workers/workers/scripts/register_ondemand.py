from pathlib import Path
import fire
from typing import List, Tuple, Dict
            
from sca_rhythm import Workflow

import workers.workflow_utils as wf_utils
from workers.celery_app import app as celery_app
import workers.api as api
    

class Registration:
    def __init__(self,
                 dataset_type: str,
                 path: str,
                 project_id: str = None,
                 description: str = None,
                 prefix: str = None,
                 suffix: str = None,
                 ingest_subdirs: bool = False,
                 dry_run: bool = False):
        self.dataset_type = dataset_type
        self.path = path
        self.description = description
        self.project_id = project_id
        self.prefix = prefix
        self.suffix = suffix
        self.ingest_subdirs = ingest_subdirs
        self.dry_run = dry_run

        self.created_datasets = []
        self.conflicted_datasets = []
        self.errored_datasets = []

        # self.original_to_registered_mapping = {}  # Maps original dir names to registered dataset names
        self.registered_to_original_mapping = {}  # Reverse map: registered dataset names to original dir names

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
            # Return subdirectories as candidates (only subdirectories at top-level are considered)
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
                # print(f"Found candidate: {item.name} -> {subdirectory_new_name}")
                candidates.append((subdirectory_new_name, item))
            
            # Log non-directory files that won't be registered
            if non_directory_files:
                # todo - emoji
                print("Non-directory files found (will not be registered as Datasets):")
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
        # todo - log candidate directories that are to be or not be processed
        if not candidates_to_process:
            print("No candidates need processing - all are already registered.")
            return
            
        # Register datasets
        self.register_candidate_dirs(candidates_to_process)
        
        # After registration, check for existing datasets that need workflow kickoff
        self.initiate_workflows()
        

    def register_candidate_dirs(self, candidates: List[Tuple[str, Path]]) -> None:
        """Register all provided candidates as Datasets in the database"""
        if self.dry_run:
            print(f"⚠️ DRY RUN ⚠️ - Would register {len(candidates)} datasets")
            
            # Log what would be registered
            for candidate_name, original_path in candidates:
                if candidate_name != original_path.name:
                    print(f"    Directory '{original_path.name}' would be registered as a {self.dataset_type} named '{candidate_name}'")
                else:
                    print(f"    Directory '{original_path.name}' would be registered as a {self.dataset_type}")
            return
        else:
            # Prepare registration data
            registration_data = []
            for candidate_name, candidate_path in candidates:
                dataset_info = {
                    'name': candidate_name,
                    'type': self.dataset_type,
                    'origin_path': str(candidate_path)
                }
                # Add description if provided
                if self.description:
                    dataset_info['description'] = self.description
                # Add Project ID if provided
                if self.project_id:
                    dataset_info['project_id'] = self.project_id
                
                registration_data.append(dataset_info)
                
                # Store mapping from original directory name to registered dataset name,
                # for logging purposes
                original_dir_name = candidate_path.name
                # self.original_to_registered_mapping[original_dir_name] = candidate_name
                self.registered_to_original_mapping[candidate_name] = original_dir_name
            
            # Call bulk-registration endpoint
            print(f"Calling bulk-registration API...")
            response = api.bulk_create_datasets(registration_data)
            
            # Process response
            self.created_datasets = response.get('created', [])
            self.conflicted_datasets = response.get('conflicted', [])
            self.errored_datasets = response.get('errored', [])
            
            # Log results
            print(f"Bulk registration results:")
            self.log_registration_results()


    def register_datasets(self) -> None:
        """
        Registers all eligible candidates as Datasets in the database.
        """
        # emoji
        print(f"Processing {str(self.path)}")

        # Get eligible candidates based on ingestion mode
        candidates = self.get_eligible_candidates()

        # Process eligible candidates
        self.process_and_register_candidates(candidates)


    def log_dataset_registration_result(self, dataset: Dict) -> None:
        """
        Log the registration result for a Dataset.
        """
        registration_result_name = dataset['name']
        # Lookup original directory name using reverse mapping to avoid nested loops
        original_dir_name = self.registered_to_original_mapping.get(registration_result_name)
        if original_dir_name and original_dir_name != registration_result_name:
            print(f"  {original_dir_name} → {registration_result_name}")
        else:
            print(f"  {registration_result_name}")      


    def log_registration_results(self) -> None:
        print("✅ Created datasets:")
        for dataset in self.created_datasets:
            self.log_dataset_registration_result(dataset)
        print("✋ Conflicted datasets (already exist):")
        for dataset in self.conflicted_datasets:
            self.log_dataset_registration_result(dataset)        
        print("❌ Errored datasets:")
        for dataset in self.errored_datasets:
            self.log_dataset_registration_result(dataset)

    
    def start_integration(self, dataset: Dict):
        """
        Start the Integrated workflow on a Dataset.
        """
        try:
            # Create and start workflow
            wf_body = wf_utils.get_wf_body(wf_name='integrated')
            wf = Workflow(celery_app=celery_app, **wf_body)
            wf.start(dataset['id'])
            
            print(f"Successfully started Integrated workflow for Dataset: {dataset['name']} (ID: {dataset['id']})")
            return True
            
        except Exception as e:
            print(f"Error starting workflow for Dataset: {dataset['name']} (ID: {dataset['id']}): {e}")
            return False


    def initiate_workflows(self) -> None:
        """
        Workflow initiation for all successfully-created Datasets.
        """
        if self.dry_run:
            print("⚠️ DRY RUN ⚠️ - Would initiate workflows for all successfully-created Datasets")
            return
            
        print("Initiating workflows for all successfully-created Datasets...")
        
        workflows_started = 0
        
        for dataset in self.created_datasets:
            # Check if Dataset exists but doesn't have the 'Integrated' workflow initiated
            if not self.integration_initiated(dataset):
                if self.start_integration(dataset):
                    print(f"ℹ️ Started 'Integrated' workflow for Dataset: {dataset['name']} (ID: {dataset['id']})")
                    workflows_started += 1
                else:
                    print(f"⚠️ Failed to start 'Integrated' workflow for Dataset: {dataset['name']} (ID: {dataset['id']})")
        
        if workflows_started > 0:
            print(f"✅ Started {workflows_started} workflows for created Datasets")
        else:
            print("❌ No created Datasets found that need workflow kickoff")
        

    def get_matching_dataset(self, dataset_name: str) -> Dict | None:
        matching_datasets: List[Dict] = api.get_all_datasets(dataset_type=self.dataset_type,
                                                             name=dataset_name,
                                                             include_states=False)
        if len(matching_datasets) == 0:
            return None
        # print(f"Found {len(matching_datasets)} Datasets with name {dataset_name} and type {self.dataset_type}")
        return matching_datasets[0]


    def exists(self, dataset_name: str) -> bool:
        """
        Checks whether a Dataset with this name and the provided type has been registered in the database.
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
        matching_dataset: Dict = self.get_matching_dataset(dataset_name, include_states=True)
        if not matching_dataset:
            return False

        matching_dataset_is_archived = any(
            state['state'] == 'ARCHIVED' for state in matching_dataset.get('states', []))
        return matching_dataset_is_archived


    def integration_initiated(self, dataset: Dict) -> bool:
        """
        Dataset is considered to be in the middle of integration if the `Integrated` workflow has been initiated (or has finished running) on the Dataset.
        Returns False if the dataset doesn't exist or if the `Integrated` workflow has not been initiated.
        """

        workflow_query_response = api.get_dataset(dataset_id=dataset['id'], workflows=True)
        dataset_workflows = workflow_query_response['workflows']

        is_integrated_workflow_initiated = any(workflow['name'] == 'integrated' for workflow in dataset_workflows)
        return is_integrated_workflow_initiated


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
        dataset_type: str = None,
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
    
    if not dataset_type:
        print("Dataset type is required. Please provide a valid Dataset type (DATA_PRODUCT or RAW_DATA) using the --dataset-type flag.")
        return

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
        print(f"⚠️ DRY RUN MODE ⚠️")

    reg.register_datasets()


"""
This script registers Datasets on-demand in Bioloop. It is intended to allow importing multiple Datasets into
Bioloop via scripting without the need to use the web interface, while also offering the option to choose
registration parameters.

Either the directory provided as an argument or the subdirectories within it are registered as Datasets.

This script:
1. Accepts a directory path as an argument.
2. Gathers a list of candidate directories to be registered. This can be either the directory provided as an argument,
or the top-level subdirectories within it, depending on the ingest_subdirs flag.
3. Optionally renames datasets to be registered according to the format: {PREFIX}-{DIR_NAME}-{SUFFIX}.
4. Registers each new directory as a Data Product or Raw Data.
5. Initiates the Integrated workflow for each registered dataset, which will start the ingestion process.

Note: When ingesting subdirectories (ingest_subdirs=True), only the top-level subdirectories 
within the provided directory are scanned for registration as datasets. Nested subdirectories are not processed.

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

2. Actually register Datasets, and associate them with a project:
   python -m workers.scripts.register_ondemand /path/to/data_directory --project-id=abc123

3. Register as Raw Data with custom prefix, and description:
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=RAW_DATA --prefix=myPrefix --description="Sample description"

4. Ingest subdirectories instead of parent directory:
   python -m workers.scripts.register_ondemand /path/to/data_directory --ingest-subdirs=True
"""

if __name__ == "__main__":
    fire.Fire(init)
