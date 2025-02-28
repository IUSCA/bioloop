from pathlib import Path
import fire
import shutil
import subprocess
import json
import os
import hashlib
from typing import Set, List, Tuple

import workers.api as api


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
                            print(f"Found existing Data Product with name {new_name}, but the contents of the original directory {item.name} have been modified since registration. This subdirectory will not be registered again.")
                        else:
                            print(f"Directory already renamed and registered: {new_name}")
                        processed_dirs.add(item.name)
                        continue
                    else:
                        print(f"Directory renamed but not registered: {new_name}")
                        shutil.rmtree(new_path)
                elif item.name in processed_dirs:
                    print(f"Skipping already processed directory: {item.name}")
                    continue

                shutil.copytree(item, new_path)
                print(f"Copied and renamed: {item.name} -> {new_name}")

                if not is_data_product_registered(new_name):
                    try:
                        # if item.name == '1st':
                        #     raise Exception(f"Error occurred during registration of {new_name}")
                        register_data_product(new_name, new_path)
                        processed_dirs.add(item.name)
                        # raise Exception(f"Error occurred during registration of {new_name}")
                    except Exception as e:
                        print(f"Error occurred during registration of {new_name}: {e}")
                        shutil.rmtree(new_path)
                        print(f"Deleted renamed directory due to registration failure: {new_path}")
                        # Remove the directory from processed_dirs if it was added,
                        # so it can be processed in the next run
                        processed_dirs.discard(item.name)
                else:
                    print(f"Already registered: {new_name}")
                    processed_dirs.add(item.name)
            else:
                print(f"Dry run: Would have copied and renamed {item.name} to {new_name}")
                print(f"Dry run: Would have registered: {new_name}")

    print("Processing and registration complete.")
    save_processed_dirs(dir_path, processed_dirs)

    # If the script completes successfully, delete the processed directories file
    delete_processed_dirs_file(dir_path)


if __name__ == "__main__":
    fire.Fire(process_and_register_subdirectories)