from pathlib import Path
import fire
import shutil
import subprocess


def process_and_register_subdirectories(dir_path: Path,
                                        project_name: str,
                                        copy: bool = True,
                                        move: bool = False,
                                        dry_run: bool = True):
    if not (copy ^ move):  # Ensure exactly one of copy or move is True
        raise ValueError("Exactly one of --copy or --move must be specified")

    dir_name = dir_path.name
    print(f"Processing subdirectories in {dir_path.name}")

    if copy:
        renamed_dir = dir_path / 'renamed_directories'
        if not dry_run:
            renamed_dir.mkdir(exist_ok=True)

    for item in dir_path.iterdir():
        if item.is_dir() and item.name != 'renamed_directories':
            print(f"Processing directory: {item.name}")
            new_name = f"{project_name}-{dir_name}-{item.name}"

            if copy:
                new_path = renamed_dir / new_name
                print(f"Original path: {item}")
                print(f"New name: {new_path}")
            else:  # move
                new_path = dir_path / new_name
                print(f"Original path: {item}")
                print(f"New name: {new_path}")

            try:
                if not dry_run:
                    if copy:
                        shutil.copytree(item, new_path)
                        print(f"Copied and renamed: {item.name} -> {new_name}")
                    else:  # move
                        # First, create a copy
                        temp_copy = dir_path / f"temp_{item.name}"
                        shutil.copytree(item, temp_copy)
                        print(f"Created temporary copy: {item.name} -> temp_{item.name}")

                        # Then, rename the copy
                        temp_copy.rename(new_path)
                        print(f"Renamed temporary copy: temp_{item.name} -> {new_name}")

                        # Finally, delete the original
                        shutil.rmtree(item)
                        print(f"Deleted original directory: {item.name}")

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
                        print(f"Dry run: Would have copied and renamed {item.name} to {new_name}")
                    else:  # move
                        print(f"Dry run: Would have copied {item.name} to temp_{item.name}")
                        print(f"Dry run: Would have renamed temp_{item.name} to {new_name}")
                        print(f"Dry run: Would have deleted original directory {item.name}")
                    print(f"Dry run: Would have registered: {new_name}")
            except OSError as e:
                print(f"Error processing {item.name}: {e}")


if __name__ == "__main__":
    fire.Fire(process_and_register_subdirectories)
    print("Processing and registration complete.")