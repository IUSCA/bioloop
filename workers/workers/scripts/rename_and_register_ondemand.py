from pathlib import Path
import fire
import shutil
import subprocess
import json
import os
import hashlib
from typing import Set, List, Tuple

import workers.api as api


def all_subdirs_processed(dir_path: Path, processed_dirs: Set[str]) -> bool:
    """Check if all subdirectories (excluding 'renamed_directories') have been processed."""
    all_subdirs = {item.name for item in dir_path.iterdir() if item.is_dir() and item.name != 'renamed_directories'}
    return all_subdirs.issubset(processed_dirs)


def calculate_file_hash(filepath: str, block_size: int = 65536) -> str:
    """Calculate the MD5 hash of a file."""
    file_hash = hashlib.md5()
    with open(filepath, "rb") as f:
        for block in iter(lambda: f.read(block_size), b""):
            file_hash.update(block)
    return file_hash.hexdigest()


def directories_equal(dir1: Path, dir2: Path) -> bool:
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


def load_processed_dirs(dir_path: Path) -> Set[str]:
    processed_file: Path = dir_path / '.processed_dirs.json'
    if processed_file.exists():
        with open(processed_file, 'r') as f:
            return set(json.load(f))
    return set()


def save_processed_dirs(dir_path: Path, processed_dirs: Set[str]) -> None:
    processed_file: Path = dir_path / '.processed_dirs.json'
    with open(processed_file, 'w') as f:
        json.dump(list(processed_dirs), f)


def delete_processed_dirs_file(dir_path: Path) -> None:
    processed_file: Path = dir_path / '.processed_dirs.json'
    if processed_file.exists():
        processed_file.unlink()
        print(f"Deleted {processed_file}")


def is_data_product_registered(new_name: str) -> bool:
    matching_datasets = api.get_all_datasets(dataset_type='DATA_PRODUCT', name=new_name)
    return len(matching_datasets) > 0


def register_data_product(new_name: str, new_path: Path) -> None:
    register_cmd: List[str] = [
        "python",
        str(Path(__file__).parent / "register_ondemand.py"),
        "--data-product",
        new_name,
        str(new_path)
    ]
    subprocess.run(register_cmd, check=True)
    print(f"Registered: {new_name}")


def process_and_register_subdirectories(dir_path: str,
                                        project_name: str,
                                        dry_run: bool = True) -> None:
    dir_path = Path(dir_path)
    dir_name: str = dir_path.name
    print(f"Processing subdirectories in {dir_path.name}")

    processed_dirs: Set[str] = load_processed_dirs(dir_path)
    renamed_dirs_parent: Path = dir_path / 'renamed_directories'

    for item in dir_path.iterdir():
        if item.is_dir() and item.name != 'renamed_directories':
            new_name: str = f"{project_name}-{dir_name}-{item.name}"
            new_path: Path = renamed_dirs_parent / new_name

            print(f"Processing directory: {item.name}")
            print(f"Original path: {item}")
            print(f"New name: {new_path}")

            if not dry_run:
                if new_path.exists():
                    if is_data_product_registered(new_name):
                        if not directories_equal(item, new_path):
                            print(f"""
                            Found existing Data Product with name {new_name}, but the contents of the
                            original subdirectory {item.name} do not match the contents of subdirectory
                            {new_name}. One of these subdirectories may have been modified since
                            registration. This subdirectory will not be registered again.
                            """)
                        else:
                            print(f"Directory already renamed and registered: {new_name}")
                        processed_dirs.add(item.name)
                        save_processed_dirs(dir_path, processed_dirs)
                        continue
                    else:
                        print(f"Directory renamed but not registered: {new_name}")
                        # Delete the subdirectory that is renamed, but not registered, since this
                        # could potentially be an incomplete or corrupted renamed subdirectory
                        # from a previous run.
                        shutil.rmtree(new_path)
                elif item.name in processed_dirs:
                    print(f"Skipping already processed directory: {item.name}")
                    continue

                shutil.copytree(item, new_path)
                print(f"Copied and renamed: {item.name} -> {new_name}")

                if not is_data_product_registered(new_name):
                    try:
                        register_data_product(new_name, new_path)
                        processed_dirs.add(item.name)
                        save_processed_dirs(dir_path, processed_dirs)
                    except Exception as e:
                        print(f"Error occurred during registration of {new_name}: {e}")
                        shutil.rmtree(new_path)
                        print(f"Deleted renamed directory due to registration failure: {new_path}")
                        processed_dirs.discard(item.name)
                        save_processed_dirs(dir_path, processed_dirs)
                else:
                    print(f"Already registered: {new_name}")
                    processed_dirs.add(item.name)
                    save_processed_dirs(dir_path, processed_dirs)
            else:
                print(f"Dry run: Would have copied and renamed {item.name} to {new_name}")
                print(f"Dry run: Would have registered: {new_name}")

    print("Processing and registration complete.")

    if all_subdirs_processed(dir_path, processed_dirs):
        delete_processed_dirs_file(dir_path)

        # Once all subdirectories have been successfully processed,
        # delete the `renamed_directories` directory
        if renamed_dirs_parent.exists() and not dry_run:
            shutil.rmtree(renamed_dirs_parent)
            print(f"Deleted renamed_directories folder: {renamed_dirs_parent}")
        elif dry_run:
            print(f"Dry run: Would have deleted renamed_directories folder: {renamed_dirs_parent}")
        print("All subdirectories processed. Deleted .processed_dirs.json file.")
    else:
        print("Some subdirectories are still unprocessed. Keeping .processed_dirs.json file for the next run.")


"""
This script processes subdirectories within a given directory, renames them according to
a specific format, and registers them as data products.

What it does:
1. Processes all subdirectories within the specified DIR_PATH.
2. Renames directories to the format: {PROJECT_NAME}-{DIR_NAME}-{SUBDIRECTORY_NAME}.
3. Copies renamed directories to a new 'renamed_directories' folder.
4. Registers each new directory as a data product via the register_ondemand script.
5. Maintains a record of processed directories to avoid reprocessing.

Usage:
python -m workers.scripts.rename_and_register_ondemand [OPTIONS] DIR_PATH PROJECT_NAME

Arguments:
DIR_PATH: The path to the directory containing subdirectories to process.
PROJECT_NAME: The name of the project to use in the new directory names.

Options:
--dry-run: If set to True (default), the script simulates the process without making
           any actual changes. Set to False to perform actual renaming and registration.

Example usage:
1. Dry run (simulate without changes):
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory project_xyz

2. Actually process and register:
   python -m workers.scripts.rename_and_register_ondemand /path/to/data_directory project_xyz --dry-run=False
"""
if __name__ == "__main__":
    fire.Fire(process_and_register_subdirectories)
