import os
import random
import string
import fire


def create_dummy_file(path, size_mb):
    with open(path, 'wb') as f:
        f.write(os.urandom(size_mb * 1024 * 1024))


def random_string(length):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


def create_dummy_directory(dir_path: str, total_size_gb: float = 10):
    """
    Create a directory with dummy files totaling approximately the specified size.

    Args:
    dir_path (str): The path where the dummy directory should be created.
    total_size_gb (float): The approximate total size of the dummy files in gigabytes. Defaults to 10GB.

    Example usage:
    python -m workers.scripts.create_dummy_data_product /path/to/dummy_directory --total_size_gb=5
    """
    if not os.path.exists(dir_path):
        os.makedirs(dir_path)

    total_size_mb = int(total_size_gb * 1024)
    current_size_mb = 0

    while current_size_mb < total_size_mb:
        file_size_mb = random.randint(1, 100)  # Random file size between 1MB and 100MB
        if current_size_mb + file_size_mb > total_size_mb:
            file_size_mb = total_size_mb - current_size_mb

        file_name = f"{random_string(10)}.bin"
        file_path = os.path.join(dir_path, file_name)

        create_dummy_file(file_path, file_size_mb)
        current_size_mb += file_size_mb

        print(f"Created {file_name} ({file_size_mb}MB)")

    print(f"Total size: {current_size_mb}MB")


if __name__ == "__main__":
    fire.Fire(create_dummy_directory)
