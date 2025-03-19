import os
import random
import string
import fire


def create_dummy_file(path, size_mb):
    with open(path, 'wb') as f:
        f.write(os.urandom(size_mb * 1024 * 1024))


def random_string(length):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


# Ordinal numbers are formed by adding a suffix to the cardinal number.
# Examples of ordinal suffixes:
    # 1st -> st (used for 1, 21, 31, 41, etc.)
    # 2nd -> nd  (used for 2, 22, 32, 42, etc.)
    # 3rd -> rd (used for 3, 23, 33, 43, etc.)
    # 4th -> th (used for all other numbers, like 4th, 5th, etc.)
def get_ordinal(n):
    if 11 <= (n % 100) <= 13:
        # If the number, when divided by 100, leaves a remainder of 11, 12, or 13
        # Example:
        # Numbers ending in 11: 11, 111, 211, 311, ..., 1011, 1111, ...
        suffix = 'th'
    else:
        # min(n % 10, 4): smaller among the last digit and 4
        suffix = ['th', 'st', 'nd', 'rd', 'th'][min(n % 10, 4)]
    return f"{n}{suffix}"


def create_dummy_directory(dir_path: str, subdirs: int = 3, size_gb: float = 1):
    os.makedirs(dir_path, exist_ok=True)

    for i in range(subdirs):
        subdir_name = f"subdir_{i + 1}"
        subdir_path = os.path.join(dir_path, subdir_name)
        os.makedirs(subdir_path, exist_ok=True)

        total_size = 0
        file_count = 0
        target_size = size_gb * 1024  # Convert GB to MB

        while total_size < target_size:
            file_size = random.randint(1, 100)  # Random file size between 1MB and 100MB
            if total_size + file_size > target_size:
                file_size = target_size - total_size

            if file_size <= 0:
                break

            file_name = f"{random_string(10)}.bin"
            file_path = os.path.join(subdir_path, file_name)
            create_dummy_file(file_path, file_size)

            total_size += file_size
            file_count += 1

            print(f"Created {get_ordinal(file_count)} file in {subdir_name}: {file_name} ({file_size}MB)")

        print(f"Finished creating {subdir_name}. Total size: {total_size}MB")

    print(f"Finished creating dummy directory at {dir_path}")


"""
    Creates a dummy directory with the specified number of subdirectories,
    each containing the specified amount of data.

    Usage:
        python -m workers.scripts.create_dummy_dataset [OPTIONS] DIR_PATH

    Arguments:
        DIR_PATH (str): The path where the dummy directory should be created.

    Options:
        --subdirs (int): The number of subdirectories to create. Defaults to 3.
        --size_gb (float): The size of each subdirectory in GB. Defaults to 1.

    Example:
        python -m workers.scripts.create_dummy_dataset /path/to/dummy_directory --subdirs=5 --size_gb=2
"""
if __name__ == "__main__":
    fire.Fire(create_dummy_directory)
