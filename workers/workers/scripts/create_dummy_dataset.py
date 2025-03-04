import os
import random
import string
import fire


def create_dummy_file(path, size_mb):
    with open(path, 'wb') as f:
        f.write(os.urandom(size_mb * 1024 * 1024))


def random_string(length):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


def get_ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f"{n}{suffix}"


def create_dummy_directory(dir_path: str, subdirs: int = 3):
    """
    Create a directory with dummy files, each subdirectory containing exactly 1GB of data.

    Args:
    dir_path (str): The path where the dummy directory should be created.
    subdirs (int): The number of subdirectories to create. Defaults to 3.

    Example usage:
    python -m workers.scripts.create_dummy_data_product /path/to/dummy_directory --subdirs=3
    """
    if not os.path.exists(dir_path):
        os.makedirs(dir_path)

    size_per_dir_mb = 1024  # 1GB = 1024MB
    total_size_mb = 0

    for i in range(1, subdirs + 1):
        subdir_name = get_ordinal(i)
        subdir_path = os.path.join(dir_path, subdir_name)
        os.makedirs(subdir_path, exist_ok=True)

        current_size_mb = 0

        while current_size_mb < size_per_dir_mb:
            remaining_mb = size_per_dir_mb - current_size_mb
            file_size_mb = min(random.randint(1, 100), remaining_mb)  # Random file size between 1MB and 100MB, or remaining size

            file_name = f"{random_string(10)}.bin"
            file_path = os.path.join(subdir_path, file_name)

            create_dummy_file(file_path, file_size_mb)
            current_size_mb += file_size_mb

            print(f"Created {subdir_name}/{file_name} ({file_size_mb}MB)")

        total_size_mb += current_size_mb
        print(f"Subdirectory {subdir_name} size: {current_size_mb}MB")

    print(f"Total size across all subdirectories: {total_size_mb}MB")


if __name__ == "__main__":
    fire.Fire(create_dummy_directory)