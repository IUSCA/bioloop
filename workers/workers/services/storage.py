import time

from workers import cmd
from workers.config import config


class StorageBackend:
    def __init__(self):
        self._backend = None

    def put(self, local_file: str, storage_file: str, verify_checksum: bool = True) -> tuple[str, str]:
        raise NotImplementedError

    def get(self, storage_file: str, local_file: str, verify_checksum=True) -> tuple[str, str]:
        raise NotImplementedError

    def get_size(self, storage_file: str) -> int:
        raise NotImplementedError

    def get_hash(self, storage_file: str, missing_ok: bool = False) -> str | None:
        raise NotImplementedError

    def delete(self, storage_file: str) -> None:
        raise NotImplementedError

    def exists(self, storage_file: str) -> bool:
        raise NotImplementedError

    def ensure_directory(self, storage_dir: str) -> None:
        raise NotImplementedError


class HSIBackend(StorageBackend):
    def __init__(self):
        super().__init__()
        self._backend = 'hsi'

    def put(self, local_file: str, storage_file: str, verify_checksum: bool = True):
        """
        Transfer a local file to tape archive

        If storage_file exists, it will be overwritten

        The checksum algorithms that are used are very CPU-intensive.
        Although the checksum code is compiled with a high level of compiler optimization,
        transfer rates can be significantly reduced when checksum creation or verification is in effect.
        The amount of degradation in transfer rates depends on several factors, such as processor speed,
        network transfer speed, and speed of the local filesystem.
        """
        # -c flag enables checksum creation
        put_cmd = 'put -c on' if verify_checksum else 'put'
        command = ['hsi', '-P', f'{put_cmd} {local_file} : {storage_file}']
        return cmd.execute(command)

    def get_size(self, storage_file: str):
        command = ['hsi', '-P', f'ls -s1 {storage_file}']
        stdout, stderr = cmd.execute(command)
        return int(stdout.strip().split()[0])

    def get(self, storage_file: str, local_file: str, verify_checksum=True):
        """
        Transfer a file from tape archive to local disk.

        If the local_file exists, it will be overwritten.

        Transfer speeds are around 56 MBps

        The checksum algorithms that are used are very CPU-intensive.
        Although the checksum code is compiled with a high level of compiler optimization,
        transfer rates can be significantly reduced when checksum creation or verification is in effect.
        The amount of degradation in transfer rates depends on several factors, such as processor speed,
        network transfer speed, and speed of the local filesystem.
        """
        get_cmd = 'get -c on' if verify_checksum else 'get'
        command = ['hsi', '-P', f'{get_cmd} {local_file} : {storage_file}']
        return cmd.execute(command)

    def get_hash(self, storage_file: str, missing_ok: bool = False) -> str | None:
        command = ['hsi', '-P', f'hashlist {storage_file}']
        try:
            stdout, stderr = cmd.execute(command)
            checksum = stdout.strip().split()[0]
            if checksum == '(none)':
                return None
            return checksum
        except cmd.SubprocessError:
            if missing_ok:
                return None
            else:
                raise

    def delete(self, storage_file: str) -> None:
        if self.exists(storage_file):
            command = ['hsi', '-P', f'rm {storage_file}']
            cmd.execute(command)

    def exists(self, storage_file: str) -> bool:
        command = ['hsi', '-P', f'ls {storage_file}']
        try:
            cmd.execute(command)
            return True
        except cmd.SubprocessError:
            return False

    def ensure_directory(self, storage_dir: str) -> None:
        command = ['hsi', '-P', f'mkdir -p {storage_dir}']
        cmd.execute(command)


class FSBackend(StorageBackend):
    def __init__(self):
        super().__init__()
        self._backend = 'fs'
        self.delay_multiplier = 60 / (2 ** 30)  # 1 GB = 1 minute

    def _simulate_transfer_time(self, f: str):
        """
        Simulate transfer time for debugging purposes.
        """
        # simulate transfer time, delay is proportional to file size
        if self.delay_multiplier > 0:
            delay = self.delay_multiplier * self.get_size(f)
        else:
            delay = 0
        time.sleep(delay)

    def put(self, local_file: str, storage_file: str, verify_checksum: bool = True):
        """
        Transfer a local file to storage directory

        If storage_file exists, it will be overwritten
        """
        self._simulate_transfer_time(local_file)
        command = ['cp', '-f', local_file, storage_file]
        return cmd.execute(command)

    def get_size(self, storage_file: str):
        command = ['du', '-sk', storage_file]
        stdout, stderr = cmd.execute(command)
        return int(stdout.strip().split()[0]) * 1024

    def get(self, storage_file: str, local_file: str, verify_checksum=True):
        """
        Transfer a file from storage directory to local disk.

        If the local_file exists, it will be overwritten.
        """
        self._simulate_transfer_time(storage_file)
        command = ['cp', '-f', storage_file, local_file]
        return cmd.execute(command)

    def get_hash(self, storage_file: str, missing_ok: bool = False) -> str | None:
        command = ['md5', storage_file]
        try:
            stdout, stderr = cmd.execute(command)
            checksum = stdout.strip().split('=')[1]
            return checksum.strip()
        except cmd.SubprocessError:
            if missing_ok:
                return None
            else:
                raise

    def delete(self, storage_file: str) -> None:
        if self.exists(storage_file):
            command = ['rm', '-f', storage_file]
            cmd.execute(command)

    def exists(self, storage_file: str) -> bool:
        command = ['ls', storage_file]
        try:
            cmd.execute(command)
            return True
        except cmd.SubprocessError:
            return False

    def ensure_directory(self, storage_dir: str) -> None:
        command = ['mkdir', '-p', storage_dir]
        cmd.execute(command)


# Choose the backend based on configuration
# create a singleton instance of the backend

def get_storage_backend() -> StorageBackend:
    """
    Get the storage backend based on configuration.
    """
    if config['storage_backend'] == 'hsi':
        return HSIBackend()
    else:
        return FSBackend()


storage = get_storage_backend()
