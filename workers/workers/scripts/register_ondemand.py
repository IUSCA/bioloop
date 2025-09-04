from pathlib import Path
import argparse
from typing import List, Tuple, Dict
import logging
from datetime import datetime

import workers.api as api
from workers.config import config


logger = logging.getLogger(__name__)

def get_log_file_path() -> Path:
    log_dir = Path(config['logs']['register_ondemand'])
    log_file_path = log_dir / f'{datetime.now().strftime("%Y-%m-%d_%H-%M-%S")}.log'
    return log_file_path

def setup_logging(log_level: str = "INFO") -> None:
    """
    Setup logging configuration with the specified log level.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    # Convert string to logging level constant
    numeric_level = getattr(logging, log_level.upper(), None)
    if not isinstance(numeric_level, int):
        raise ValueError(f"Invalid log level: {log_level}")
    
    # Get the root logger and set its level
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Clear existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create log directory if it doesn't exist
    log_dir = get_log_file_path().parent
    if not log_dir.exists():
        log_dir.mkdir(parents=True, exist_ok=True)

    # Add new handlers
    root_logger.addHandler(logging.FileHandler(str(get_log_file_path())))
    root_logger.addHandler(logging.StreamHandler())
    
    # Set format for all handlers
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    for handler in root_logger.handlers:
        handler.setFormatter(formatter)


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

        self.created = []
        self.conflicted = []
        self.errored = []

        self.registered_to_original_mapping = {}

        if self.project_id:
            try:
                self.project = api.get_project(self.project_id)
            except Exception as e:
                logger.error(f"❌ ERROR: Failed to validate project ID '{self.project_id}': {e}")
                raise ValueError(f"Invalid project ID '{self.project_id}': {e}")
    

    def should_process_candidate(self, candidate_name: str) -> bool:
        """
        Check if a candidate should be processed. Returns True if the candidate Dataset exists in the system.
        """
        
        if not self.exists(candidate_name):
          logger.info(f"{self.dataset_type} {candidate_name} does not exist - processing")
          return True
        else:
            dataset = self.get_dataset_by_name(candidate_name)
            if not self.integration_initiated(dataset['id']):
                logger.info(f"{self.dataset_type} {candidate_name} is not integrated - processing")
                return True
        logger.info(f"{self.dataset_type} {candidate_name} already exists - skipping")
        return True

    
    def get_potential_candidates_for_registration(self) -> List[Tuple[str, Path]]:
        """
        Get list of potential candidates to register based on ingestion mode.
        
        Returns:
            List[Tuple[str, Path]]: Each tuple contains (dataset_name, original_path)
            - dataset_name: the name under which the dataset will be registered
            - original_path: the Path to the dataset directory
        """
        logger.info("") # newline
        
        directory_path: Path = Path(self.path)
        directory_name: str = directory_path.name
        
        candidates = []

        if not self.ingest_subdirs:
            # Return parent directory as single candidate
            parent_dir_new_name = generate_dataset_new_name(
                prefix=self.prefix,
                suffix=self.suffix,
                dataset_name=directory_name,
            )
            candidates.append((parent_dir_new_name, directory_path))
        else:
            # Return subdirectories as candidates (only subdirectories at top-level are considered eligible for registration)
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
                candidates.append((subdirectory_new_name, item))
            
            # Log non-directory files that won't be registered
            if non_directory_files:
                logger.debug(f"⚠️ {len(non_directory_files)} non-directory file(s) found (will not be registered as Datasets):")
                # Show first 10 files, then indicate if there are more
                files_to_show = non_directory_files[:10]
                for fname in files_to_show:
                    logger.debug(fname)
                if len(non_directory_files) > 10:
                    remaining_count = len(non_directory_files) - 10
                    logger.debug(f"... (showing first 10 files, {remaining_count} more files not shown)")

        logger.debug(f"Found {len(candidates)} possible directories to register as Datasets:")
        for _, original_path in candidates:
            logger.debug(f"    {original_path.name}")
        
        return candidates


    def process_and_register_candidates(self,
                                        candidates: List[Tuple[str, Path]]) -> None:
        """
        Process and register a list of datasets in bulk.
        
        Args:
            candidates: List of tuples containing (dataset_name, original_path)
        """

        logger.info("") # newline

        # Filter candidates that need processing
        candidates_to_process = []
        for candidate_name, candidate_path in candidates:
            if self.should_process_candidate(candidate_name):
                candidates_to_process.append((candidate_name, candidate_path))
        if not candidates_to_process:
            logger.info("No candidates need processing - all are already registered.")
            return
        else:
            logger.info(f"Found {len(candidates_to_process)} directories eligible for registration:")
            for _, candidate_path in candidates_to_process:
                logger.info(f"    {candidate_path.name}")
            
        # Register datasets
        self.register_candidate_dirs(candidates_to_process)
        
        # After registration, check for existing datasets that need workflow kickoff
        self.initiate_workflows()
        

    def register_candidate_dirs(self, candidates: List[Tuple[str, Path]]) -> None:
        """Register all provided candidates as Datasets in the database"""
        
        logger.info("") # newline

        # Log what would be registered
        logger.info(f"Will register {len(candidates)} datasets:")
        for candidate_name, original_path in candidates:
            if candidate_name != original_path.name:
                logger.info(f"    {original_path.name} → {candidate_name}")
            else:
                logger.info(f"    {original_path.name}")
        
        if self.dry_run:
            logger.info("") # newline
            logger.info(f"⚠️ DRY RUN ⚠️ - Would register {len(candidates)} datasets")
            return
        
        # Prepare registration data
        registration_data = []
        for candidate_name, candidate_path in candidates:
            dataset_info = {
                'name': candidate_name,
                'type': self.dataset_type,
                'origin_path': str(candidate_path),
                'create_method': 'ON_DEMAND'
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
        logger.info("") # newline
        logger.info(f"Registering...")
        response = api.bulk_create_datasets(registration_data)
        
        # Process response
        self.created = response.get('created', []) # Array of `dataset` dicts
        self.conflicted = response.get('conflicted', []) # Array of dicts with shape: {'name': str, 'type': str}
        self.errored = response.get('errored', []) # Array of dicts with shape: {'name': str, 'type': str}
        
        # Log results
        self.log_registration_results()


    def register_datasets(self) -> None:
        """
        Registers all eligible candidates as Datasets in the database.
        """
        # emoji
        logger.info("") # newline
        logger.info(f"Processing path: {str(self.path)}")

        # Get eligible candidates based on ingestion mode
        candidates = self.get_potential_candidates_for_registration()

        # Process eligible candidates
        self.process_and_register_candidates(candidates)


    def log_dataset_registration_result(self, dataset: Dict, log_id: bool = False) -> None:
        """
        Log the registration result for a Dataset.
        """
        registration_result_name = dataset['name']
        # Lookup original directory name using reverse mapping to avoid nested loops
        original_dir_name = self.registered_to_original_mapping.get(registration_result_name)
        if original_dir_name and original_dir_name != registration_result_name:
            log_str = f"  {original_dir_name} → {registration_result_name}"
        else:
            log_str = f"  {registration_result_name}"
        if log_id:
            log_str += f"  (ID: {dataset['id']})"
        logger.info(log_str)


    def log_registration_results(self) -> None:
        logger.info("") # newline
        logger.info(f"Registration results:")

        if len(self.created) > 0:
            logger.info(f"✅ CREATED:")
            logger.info(f"  The following {len(self.created)} Dataset(s) were successfully registered:")
            for dataset in self.created:
                self.log_dataset_registration_result(dataset, log_id=True)
        if len(self.conflicted) > 0:
            logger.info(f"✋ CONFLICTED:")
            logger.info(f"  The following {len(self.conflicted)} Dataset(s) already exist, and were therefore not registered:")
            for dataset in self.conflicted:
                self.log_dataset_registration_result(dataset, log_id=False)        
        if len(self.errored) > 0:
            logger.info(f"❌ ERRORED:")
            logger.info(f"  The following {len(self.errored)} Dataset(s) could not be registered due to errors:")
            for dataset in self.errored:
                self.log_dataset_registration_result(dataset, log_id=False)
        
        if len(self.created) + len(self.conflicted) + len(self.errored) == 0:
            logger.info(f"⚠️ No datasets were registered")

    
    def start_integration(self, dataset: Dict):
        """
        Start the Integrated workflow on a Dataset.
        """
        try:
            api.initiate_workflow(dataset_id=dataset['id'], workflow_name='integrated')
            logger.info(f"Successfully started Integrated workflow for Dataset: {dataset['name']} (ID: {dataset['id']})")
            return True            
        except Exception as e:
            logger.error(f"Error starting workflow for Dataset: {dataset['name']} (ID: {dataset['id']}): {e}")
            return False


    def initiate_workflows(self) -> None:
        """
        Workflow initiation for datasets that were either created or already existed (conflicted).
        Only initiates workflows on datasets that don't already have the Integration workflow started.
        """
        logger.info("") # newline
        
        if self.dry_run:
            logger.info("⚠️ DRY RUN ⚠️ - Would initiate workflows for eligible datasets")
            return
        
        # Gather all potential dataset names (considering possible renaming) that may have been created
        potentially_created_datasets = [dataset_registration_name for dataset_registration_name, _ in self.get_potential_candidates_for_registration()]
        
        # Get datasets that were either created or already existed
        datasets_eligible_for_integration = []
        
        # Retrieve details of conflicting datasets, to potentially initiate the Integrated workflow on them
        self.conflicted_datasets = []
        for d in self.conflicted:
            conflicted = self.get_dataset_by_name(dataset_name=d['name'],
                                                  include_audit_logs=True)
            conflicted_dataset_creation_log = [log for log in conflicted['audit_logs'] if log['create_method'] == 'ON_DEMAND'][0]
            # If dataset was created by the service user (i.e. this script), it is eligible for workflow initiation
            logger.info(f"conflicted dataset {d['name']} was created by user {conflicted_dataset_creation_log['user']['username']}")
            if conflicted_dataset_creation_log['user']['username'] == config['service_user']:
                self.conflicted_datasets.append(conflicted)
            else:
                logger.info(f"Conflicting dataset {d['name']} was not created by user {config['service_user']} - skipping workflow initiation")
                  
        for dataset in self.created + self.conflicted_datasets:
            if dataset['name'] in potentially_created_datasets:
                datasets_eligible_for_integration.append(dataset)
        
        logger.info(f"Datasets eligible for integration: {len(datasets_eligible_for_integration)}")
        
        if not datasets_eligible_for_integration:
            logger.info("No datasets eligible for integration")
            return
        
        workflows_started = 0
        workflows_already_initiated = 0
        workflow_failures = 0
        
        for dataset in datasets_eligible_for_integration:
            logger.info(f"Checking workflow status for Dataset: {dataset['name']} (ID: {dataset['id']})")
            
            # Check if Integration workflow has already been initiated
            if self.integration_initiated(dataset['id']):
                logger.info(f"🚧 'Integrated' workflow already initiated on dataset {dataset['name']} (ID: {dataset['id']})")
                workflows_already_initiated += 1
                continue
            
            # Try to start the Integration workflow with retry logic
            logger.info(f"Starting 'Integrated' workflow for Dataset: {dataset['name']} (ID: {dataset['id']})")
            
            if self.start_integration(dataset):
                logger.info(f"ℹ️ Started 'Integrated' workflow for Dataset: {dataset['name']} (ID: {dataset['id']})")
                workflows_started += 1
            else:
                logger.error(f"🚨 Script will now fail due to workflow initiation failure on Dataset: {dataset['name']} (ID: {dataset['id']})")
                raise RuntimeError(f"Failed to initiate workflow on Dataset {dataset['name']} (ID: {dataset['id']})")
        
        # Log summary
        logger.info("")
        logger.info("📊 Workflow Initiation Summary:")
        logger.info(f"  Total eligible datasets: {len(datasets_eligible_for_integration)}")
        logger.info(f"  Workflows started: {workflows_started}")
        logger.info(f"  Workflows already initiated: {workflows_already_initiated}")
        logger.info(f"  Workflow failures: {workflow_failures}")
        
        if workflows_already_initiated > 0:
            logger.info("")
            logger.info("ℹ️ Workflows initiated can be monitored in the portal")
        
        if workflows_started > 0:
            logger.info(f"✅ Successfully started {workflows_started} new workflows")
        else:
            logger.info("ℹ️ No new workflows were started")
        

    def get_dataset_by_name(self,
                             dataset_name: str,
                             include_audit_logs: bool = False) -> Dict | None:
        matching_datasets: List[Dict] = api.get_all_datasets(dataset_type=self.dataset_type,
                                                             name=dataset_name,
                                                             match_name_exact=True,
                                                             include_audit_logs=include_audit_logs)
        if len(matching_datasets) == 0:
            return None
        # print(f"Found {len(matching_datasets)} Datasets with name {dataset_name} and type {self.dataset_type}")
        return matching_datasets[0]


    def exists(self, dataset_name: str) -> bool:
        """
        Checks whether a Dataset with this name and the provided type has been registered in the database.
        """

        logger.info(f"Checking if {self.dataset_type} {dataset_name} is registered...")
        matching_dataset: Dict = self.get_dataset_by_name(dataset_name)
        return matching_dataset is not None


    def integration_initiated(self, dataset_id: int) -> bool:
        """
        Dataset is considered to have been integrated if the `Integrated` workflow has been initiated (or has finished running) on the Dataset.
        Returns False if the dataset doesn't exist or if the `Integrated` workflow has not been initiated.
        """

        workflow_query_response = api.get_dataset(dataset_id=dataset_id, workflows=True)
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


def validate_inputs(dir_path: str,
                    dataset_type: str,
                    project_id: str,
                    ingest_subdirs: bool) -> bool:
    """
    Validate all input parameters before processing.
    
    Returns:
        bool: True if all validations pass, False otherwise
    """
    # Validate dataset_type
    valid_dataset_types = ['RAW_DATA', 'DATA_PRODUCT']
    if dataset_type not in valid_dataset_types:
        logger.error(f"❌ ERROR: Invalid dataset_type '{dataset_type}'.")
        logger.error(f"   Valid options are: {', '.join(valid_dataset_types)}")
        return False
    
    # Validate directory path
    path = Path(dir_path)
    if not path.exists():
        logger.error(f"❌ ERROR: Path '{dir_path}' does not exist.")
        return False
    
    if not path.is_dir():
        logger.error(f"❌ ERROR: Path '{dir_path}' is not a directory.")
        return False
    
    # Validate project_id if provided
    if project_id is not None:
        project_id_trimmed = project_id.strip()
        if not project_id_trimmed:
            logger.error("❌ ERROR: project_id cannot be empty or whitespace.")
            return False
        if any(ch.isspace() for ch in project_id_trimmed):
            logger.error("❌ ERROR: project_id must not contain whitespace characters.")
            return False
            
    # Validate ingest_subdirs - check if subdirectories exist when required
    if ingest_subdirs:
        subdirs = [item for item in path.iterdir() if item.is_dir()]
        if not subdirs:
            logger.error(f"❌ ERROR: ingest_subdirs is True but no subdirectories found in '{dir_path}'.")
            logger.error("   Either set ingest_subdirs=False or ensure the directory contains subdirectories.")
            return False
    
    return True


def log_inputs(dir_path: str,
               dataset_type: str,
               project_id: str,
               description: str,
               prefix: str,
               suffix: str,
               ingest_subdirs: bool,
               dry_run: bool) -> None:
    """
    Log the input parameters.
    """
    logger.info("") # newline
    logger.info("📝 Script parameters:")
    logger.info(f"  dir_path: {dir_path}")
    logger.info(f"  dataset_type: {dataset_type}")    
    logger.info(f"  project_id: {project_id}")
    logger.info(f"  description: {description}")
    logger.info(f"  prefix: {prefix}")
    logger.info(f"  suffix: {suffix}")
    logger.info(f"  ingest_subdirs: {ingest_subdirs}")
    logger.info(f"  dry_run: {dry_run}")


def init(dir_path: str,
        dataset_type: str,
        project_id: str = None,
        description: str = None,
        prefix: str = None,
        suffix: str = None,
        ingest_subdirs: bool = False,
        dry_run: bool = False) -> None:
    """
    Initiate processing of the provided directory.
        
    Args:
        dir_path: Path to the directory containing subdirectories to process - REQUIRED
        dataset_type: Type of dataset to register ('DATA_PRODUCT' or 'RAW_DATA') - REQUIRED
        project_id: Optional project ID to associate with datasets
        description: Optional description for datasets
        prefix: Optional prefix for renamed directories
        suffix: Optional suffix for renamed directories
        ingest_subdirs: Whether to ingest subdirectories instead of the parent directory (default: False)
        dry_run: Whether to simulate the process without making changes (default: False)
    """
    
    # Validate all inputs
    if not validate_inputs(dir_path, dataset_type, project_id, ingest_subdirs):
        return

    # Log inputs
    log_inputs(dir_path, dataset_type, project_id, description, prefix, suffix, ingest_subdirs, dry_run)

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
        logger.info("") # newline
        logger.info(f"⚠️ DRY RUN MODE ⚠️")

    reg.register_datasets()


"""
This script registers Datasets on-demand in Bioloop. It is intended to allow importing multiple Datasets into
Bioloop via scripting without the need to use the web interface, while also offering the option to choose
registration parameters.

Either the directory provided as an argument or the subdirectories within it are registered as Datasets.

This script:
1. Accepts a directory path (absolute) as an argument.
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
DIR_PATH: The absolute path to the directory to process.

Options:
--dataset-type: Type of dataset to register ('DATA_PRODUCT' or 'RAW_DATA', required)
--project-id: Optional ID of the project to associate with the registered datasets.
--description: Optional description to add to each registered dataset.
--prefix: Optional prefix to add to renamed directory names.
--suffix: Optional suffix to add to renamed directory names.
--ingest-subdirs: Whether to ingest subdirectories instead of the parent directory (default: False).
--dry-run: Whether to simulate the process without making changes (default: False).
--log-level: Set the logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL, default: INFO).

Example usage:
1. Dry run (simulate without changes):
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=DATA_PRODUCT --description="Sample dataset description" --dry-run

2. Actually register Datasets, and associate them with a project:
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=DATA_PRODUCT --project-id=abc123

3. Register as Raw Data with custom prefix, and description:
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=RAW_DATA --prefix=myPrefix --description="Sample description"

4. Ingest subdirectories instead of parent directory:
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=DATA_PRODUCT --ingest-subdirs

5. Set custom logging level for debugging:
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=DATA_PRODUCT --log-level=DEBUG

6. Set logging level to show only warnings and errors:
   python -m workers.scripts.register_ondemand /path/to/data_directory --dataset-type=DATA_PRODUCT --log-level=WARNING
"""

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Register datasets on-demand in Bioloop.")
    parser.add_argument("dir_path", help="Path to the directory to process")
    parser.add_argument("--dataset-type", dest="dataset_type", required=True, choices=["DATA_PRODUCT", "RAW_DATA"], help="Dataset type to register")
    parser.add_argument("--project-id", dest="project_id", default=None, help="Optional project ID to associate with datasets")
    parser.add_argument("--description", dest="description", default=None, help="Optional description for datasets")
    parser.add_argument("--prefix", dest="prefix", default=None, help="Optional prefix for renamed directories")
    parser.add_argument("--suffix", dest="suffix", default=None, help="Optional suffix for renamed directories")
    # Flags: presence means True; passing a value (e.g., --flag=true) will be rejected by argparse
    parser.add_argument("--ingest-subdirs", dest="ingest_subdirs", action="store_true", help="Ingest subdirectories instead of the parent directory")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true", help="Simulate the process without making changes")
    parser.add_argument("--log-level", dest="log_level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"], help="Set the logging level")

    args = parser.parse_args()

    setup_logging(args.log_level)

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
