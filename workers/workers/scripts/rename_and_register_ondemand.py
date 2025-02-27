from pathlib import Path
import fire
import shutil
import subprocess
import json
import filecmp
import os
import hashlib


def calculate_file_hash(filepath, block_size=65536): # block_size = 64 KB
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
    dir1_contents = list(os.walk(dir1))
    dir2_contents = list(os.walk(dir2))

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

            file1 = os.path.join(path1, f1)
            file2 = os.path.join(path2, f2)

            # Compare file sizes first (quick check)
            if os.path.getsize(file1) != os.path.getsize(file2):
                return False

            # Compare checksums
            if calculate_file_hash(file1) != calculate_file_hash(file2):
                return False

    return True

def load_processed_dirs(dir_path: Path) -> set:
    processed_file = dir_path / '.processed_dirs.json'
    if processed_file.exists():
        with open(processed_file, 'r') as f:
            return set(json.load(f))
    return set()

def save_processed_dirs(dir_path: Path, processed_dirs: set):
    processed_file = dir_path / '.processed_dirs.json'
    with open(processed_file, 'w') as f:
        json.dump(list(processed_dirs), f)

def is_registered(new_name: str, new_path: Path) -> bool:
    # TODO: Implement actual registration check
    # This should check if the directory is already registered in your system
    return False

def register_data_product(new_name: str, new_path: Path):
    register_cmd = [
        "python",
        str(Path(__file__).parent / "register_ondemand.py"),
        "--data-product",
        new_name,
        str(new_path)
    ]
    subprocess.run(register_cmd, check=True)
    print(f"Registered: {new_name}")

def process_and_register_subdirectories(dir_path: Path,
                                        project_name: str,
                                        copy: bool = True,
                                        move: bool = False,
                                        dry_run: bool = True):
    if not (copy ^ move):  # Ensure exactly one of copy or move is True
        raise ValueError("Exactly one of --copy or --move must be specified")

    dir_name = dir_path.name
    print(f"Processing subdirectories in {dir_path.name}")

    processed_dirs = load_processed_dirs(dir_path)
    renamed_dirs = []  # Keep track of renamed directories for potential rollback

    renamed_dir = dir_path / 'renamed_directories'
    if copy:
        if renamed_dir.exists():
            if not dry_run:
                shutil.rmtree(renamed_dir)
                print(f"Deleted existing 'renamed_directories' folder")
            else:
                print(f"Dry run: Would have deleted existing 'renamed_directories' folder")
        if not dry_run:
            renamed_dir.mkdir(exist_ok=True)
        else:
            print(f"Dry run: Would have created 'renamed_directories' folder")

    try:
        for item in dir_path.iterdir():
            if item.is_dir() and item.name != 'renamed_directories':
                new_name = f"{project_name}-{dir_name}-{item.name}"
                if copy:
                    new_path = renamed_dir / new_name
                else:  # move
                    new_path = dir_path / new_name

                if new_path.exists():
                    # Check if the copy/move operation was completed successfully
                    if directories_equal(item, new_path):
                        if is_registered(new_name, new_path):
                            print(f"Directory already renamed and registered: {new_name}")
                            processed_dirs.add(item.name)
                            continue
                        else:
                            print(f"Directory renamed but not registered: {new_name}")
                            # TODO - Proceed with registration
                    else:
                        print(f"Incomplete copy/move detected for {new_name}. Retrying operation.")
                        # TODO - We'll redo the copy/move operation
                elif item.name in processed_dirs:
                    print(f"Skipping already processed directory: {item.name}")
                    continue

                print(f"Processing directory: {item.name}")
                print(f"Original path: {item}")
                print(f"New name: {new_path}")

                if not dry_run:
                    if copy:
                        shutil.copytree(item, new_path, dirs_exist_ok=True)
                        print(f"Copied and renamed: {item.name} -> {new_name}")
                    else:  # move
                        if new_path.exists():
                            shutil.rmtree(new_path)
                        shutil.move(item, new_path)
                        print(f"Moved and renamed: {item.name} -> {new_name}")
                        renamed_dirs.append((item, new_path))

                    if not is_registered(new_name, new_path):
                        register_data_product(new_name, new_path)
                    else:
                        print(f"Already registered: {new_name}")

                    processed_dirs.add(item.name)
                else:
                    if copy:
                        print(f"Dry run: Would have copied and renamed {item.name} to {new_name}")
                    else:
                        print(f"Dry run: Would have moved and renamed {item.name} to {new_name}")
                    print(f"Dry run: Would have registered: {new_name}")

    except Exception as e:
        print(f"Error occurred during processing: {e}")
        if not dry_run and move:
            print("Rolling back all renamed directories...")
            for original, renamed in renamed_dirs:
                if renamed.exists():
                    shutil.move(renamed, original)
                    print(f"Reverted {renamed.name} back to {original.name}")
            # Clear the processed_dirs as we've reverted all changes
            processed_dirs.clear()
            save_processed_dirs(dir_path, processed_dirs)
        print("Rolled back all changes")
        raise  # Re-raise the exception after rollback

    print("Processing and registration complete.")

if __name__ == "__main__":
    fire.Fire(process_and_register_subdirectories)