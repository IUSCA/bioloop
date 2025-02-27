from pathlib import Path
import fire
import shutil
import subprocess

def process_and_register_subdirectories(dir_path: Path,
                                        project_name: str,
                                        copy: bool = True,
                                        move: bool = False,
                                        move_original_files: bool = False,
                                        dry_run: bool = True):
    if not (copy ^ move):  # Ensure exactly one of copy or move is True
        raise ValueError("Exactly one of --copy or --move must be specified")
    
    if move_original_files and not copy:
        raise ValueError("--move-original-files can only be used with --copy")

    dir_name = dir_path.name
    print(f"Processing subdirectories in {dir_path.name}")

    renamed_dir = dir_path / 'renamed_directories'
    if not dry_run:
        renamed_dir.mkdir(exist_ok=True)

    if copy and move_original_files:
        original_dir = dir_path / 'original_directories'
        if not dry_run:
            original_dir.mkdir(exist_ok=True)

    for item in dir_path.iterdir():
        if item.is_dir() and item.name not in ['original_directories', 'renamed_directories']:
            print(f"Processing directory: {item.name}")
            new_name = f"{project_name}-{dir_name}-{item.name}"
            
            if copy:
                new_path = renamed_dir / new_name
                print(f"Original path: {item}")
                if move_original_files:
                    original_copy_path = original_dir / item.name
                    print(f"Copy to original directories: {original_copy_path}")
                print(f"New name: {new_path}")
            else:  # move
                new_path = dir_path / new_name
                print(f"Original path: {item}")
                print(f"New name: {new_path}")
            
            try:
                if not dry_run:
                    if copy:
                        if move_original_files:
                            shutil.move(item, original_copy_path)
                            print(f"Moved to original_directories: {item.name}")
                        shutil.copytree(item, new_path)
                        print(f"Copied and renamed: {item.name} -> {new_name}")
                    else:  # move
                        item.rename(new_path)
                        print(f"Renamed: {item.name} -> {new_name}")
                
                    register_cmd = [
                        "python",
                        str(Path(__file__).parent / "register_ondemand.py"),
                        "--data-product",
                        new_name,
                        str(new_path)
                    ]
                    subprocess.run(register_cmd, check=True)
                    print(f"Registered: {new_name}")
                else:
                    if copy:
                        if move_original_files:
                            print(f"Dry run: Would have moved {item.name} to original_directories")
                        print(f"Dry run: Would have copied and renamed {item.name} to {new_name}")
                    else:  # move
                        print(f"Dry run: Would have renamed {item.name} to {new_name}")
                    print(f"Dry run: Would have registered: {new_name}")
            except OSError as e:
                print(f"Error processing {item.name}: {e}")

if __name__ == "__main__":
    fire.Fire(process_and_register_subdirectories)
    print("Processing and registration complete.")
    