import json
from pathlib import Path
import fire
import shutil
import os
import hashlib
from typing import List, Tuple, Dict
import time
import traceback

from workers.scripts.register_dataset import RegistrationManager
import workers.api as api

CHECK_INTERVAL = 60  # 60 seconds

RENAMED_SUBDIRECTORIES_PARENT_DIR_NAME = "renamed_subdirectories"


class Registration:
    def __init__(self,
                 dataset_type: str,
                 path: str,
                 project_id: str = None,
                 description: str = None):
        self.dataset_type = dataset_type
        self.path = path
        self.description = description
        self.project_id = project_id
        self.project = None

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
                prefix=self.project.name if self.project else None,
                dataset_name=subdir.name,
            )
            if not self.is_dataset_registered(dataset_name=new_name):
                return False
        return True

    def register_dataset(self,
                         dir_path: str,
                         # associating_project_id: str = None,
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

        renamed_subdirectories_parent_dir: Path = directory_path / RENAMED_SUBDIRECTORIES_PARENT_DIR_NAME

        for subdirectory in directory_path.iterdir():
            if subdirectory.is_dir() and subdirectory.name != RENAMED_SUBDIRECTORIES_PARENT_DIR_NAME:
                subdirectory_new_name: str = generate_dataset_new_name(
                    prefix=self.project.name if self.project else None,
                    dataset_name=subdirectory.name,
                )
                renamed_subdirectory: Path = renamed_subdirectories_parent_dir / subdirectory_new_name

                print(f"Processing subdirectory: {str(subdirectory.name)}")
                print(f"Original subdirectory path: {str(subdirectory)}")
                print(f"Renamed subdirectory path: {str(renamed_subdirectory)}")

                if not dry_run:
                    if renamed_subdirectory.exists():
                        print(f"Renamed subdirectory {renamed_subdirectory.name} already exists")
                        if self.is_dataset_registered(dataset_name=renamed_subdirectory.name):
                            print(
                                f"Renamed subdirectory {renamed_subdirectory.name} is already registered as a {self.dataset_type}")
                            print("Moving on to the next subdirectory")
                            continue
                        else:
                            print(
                                f"Renamed subdirectory {renamed_subdirectory.name} is not registered")
                            # Delete the subdirectory that is renamed but not registered, since this
                            # could potentially be an incomplete or corrupted renamed subdirectory
                            # from a previous run.
                            print(
                                f"Deleting existing renamed subdirectory to avoid conflicts {renamed_subdirectory.name}")
                            shutil.rmtree(path=renamed_subdirectory)
                            print(
                                f"Deleted renamed subdirectory {renamed_subdirectory}")
                    elif self.is_dataset_registered(dataset_name=renamed_subdirectory.name):
                        # If the renamed subdirectory does not exist, but a Dataset with the same name already exists,
                        # this means that the subdirectory was successfully registered by a previous run, and then deleted.
                        print(f"Renamed subdirectory {renamed_subdirectory.name} does not exist")
                        print(
                            f"Renamed subdirectory {renamed_subdirectory.name} is already registered as a {self.dataset_type}.")
                        print(f"Moving on to the next subdirectory")
                        continue

                    shutil.copytree(subdirectory, renamed_subdirectory)
                    print(f"Copied and renamed: {subdirectory.name} -> {renamed_subdirectory.name}")

                    print(
                        f"{renamed_subdirectory} does not exist. This subdirectory is currently not registered: {renamed_subdirectory.name}")
                    try:
                        print(f"Registering: {renamed_subdirectory.name}")
                        register_data_product(renamed_subdirectory.name, renamed_subdirectory, project_id, description)
                    except Exception as e:
                        print(f"Error occurred during registration of {renamed_subdirectory.name}: {e}")
                        traceback.print_exc()
                        shutil.rmtree(path=renamed_subdirectory, ignore_errors=True)
                        print(f"Deleted renamed directory due to registration failure: {renamed_subdirectory}")
                else:
                    print(f"Dry run: Would have copied and renamed {subdirectory.name} to {renamed_subdirectory.name}")
                    print(f"Dry run: Would have registered: {renamed_subdirectory.name}")

        print("Processing and registration complete.")

        print("Checking if all subdirectories have been processed and registered...")
        if self.all_subdirectories_processed(dir_path, project_name):
            print("All subdirectories processed and registered.")
            # Once all subdirectories have been successfully processed,
            # delete the `renamed_subdirectories` directory
            if renamed_subdirectories_parent_dir.exists() and not dry_run:
                shutil.rmtree(path=renamed_subdirectories_parent_dir)
                print(f"Deleted renamed subdirectories' parent directory: {renamed_subdirectories_parent_dir}")
            elif dry_run:
                print(f"Dry run: Would have deleted renamed_subdirectories folder: {renamed_subdirectories_parent_dir}")
            print("All subdirectories processed.")
        else:
            print("Some subdirectories are still unprocessed.")

    def is_dataset_registered(self,
                              dataset_name: str) -> bool:
        """
        Dataset is considered registered if it has been assigned an `archive_path`.
        """

        print(f"Checking if {self.dataset_type} {dataset_name} is registered...")

        while True:
            matching_datasets: List[Dict] = api.get_all_datasets(dataset_type=self.dataset_type,
                                                                 name=dataset_name)
            print(f"matching datasets count: {len(matching_datasets)}")

            if len(matching_datasets) == 0:
                print(f"{self.dataset_type} {dataset_name} not found")
                return False

            matching_dataset: Dict = matching_datasets[0]

            if matching_dataset and matching_dataset['archive_path'] is not None:
                # Dataset is considered registered if it has an `archive_path`
                print(
                    f"Found registered {self.dataset_type} {dataset_name}, archived at {matching_dataset['archive_path']}")
                return True
            elif matching_dataset:
                # Dataset is considered partially-registered if it has no `archive_path` yet.
                # Wait for `archive_path` to be assigned in this case.
                print(
                    f"{self.dataset_type} {dataset_name} currently has archive_path {matching_dataset['archive_path']}."
                    f" Checking again in {CHECK_INTERVAL} seconds, until archive_path has been assigned.")
                time.sleep(CHECK_INTERVAL)


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


"""
This script processes subdirectories within a given directory, renames them according to
a specific format, and registers them as data products.

What it does:
1. Processes all subdirectories within the specified DIR_PATH.
2. Renames directories to the format: {PROJECT_NAME}-{DIR_NAME}-{SUBDIRECTORY_NAME}.
3. Copies renamed directories to a new 'renamed_directories' folder.
4. Registers each new directory as a Data Product via the register_ondemand script.
5. Assigns a description to each registered dataset.
6. Assigns a Project ID to each registered dataset.

Usage:
python -m workers.scripts.rename_and_register_ondemand [OPTIONS] DIR_PATH PROJECT_NAME

Arguments:
DIR_PATH: The path to the directory containing subdirectories to process.
PROJECT_NAME: The name of the project to use in the new directory names.

Options:
--dry-run: If set to True (default), the script simulates the process without making
           any actual changes. Set to False to perform actual renaming and registration.
--project-id: The ID of the project to associate with the registered datasets.
--description: A description to add to each registered dataset.

Example usage:
1. Dry run (simulate without changes):
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory --description="Sample dataset description" --dry-run=True

2. Actually process and register:
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory --dry-run=True --project-id=abc123
"""
# todo:
# 1. remove project_xyz - instead, associate with project_id from the command line argument
# 2. add optional prefix and suffix to the new directory name (for both renamed subdirs and parent dir)
# 2. make renaming subdirs optional
# 4. make project_id and description optional
# 5. option to ingesting subdirs or ingest parent dir
# 6. default dry_run to False
# 7. Enable registering raw data as well

if __name__ == "__main__":
    fire.Fire(register_dataset)
