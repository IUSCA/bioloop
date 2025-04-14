import logging
import time
from collections import defaultdict
from pathlib import Path
from typing import Callable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Observer:
    def __init__(self, name: str, dir_path: str, callback: Callable[[str, list[Path]], None], interval: int = 10,
                 full_scan_every_n_scans: int = None, max_retries: int = 5):
        """
        Watch a directory for changes (non-recursive) and call a callback function on changes.
        This should be scheduled using a Poller instance.

        events:
        - add: directory added
        - delete: directory deleted
        - full_scan: full scan of the directory

        The first event will be "add" and it'll contain all the directories present at the time of registration.

        :param name: Name of the observer.
        :param dir_path: Directory path to watch.
        :param callback: Callback function to call on directory changes.
        :param interval: Polling interval in seconds.
        :param full_scan_every_n_scans: Perform a full scan every n scans. If None, no full scans will be performed.
        :param max_retries: Maximum number of retries before stopping the observer.
        """
        self.name = name
        self.dir_path = Path(dir_path)
        self.callback = callback
        self.interval = interval
        self.full_scan_every_n_scans = full_scan_every_n_scans
        self.directories = set()
        self.max_retries = max_retries

        self.events = {
            'ADD': 'add',
            'DELETE': 'delete',
            'FULL_SCAN': 'full_scan'
        }

    def watch(self, scan_type='incremental') -> None:
        """
        Watch the directory for changes and call the callback function on changes.
        """
        if not self.dir_path.exists():
            logger.warning(f'Directory {self.dir_path} does not exist. Skipping.')
            return
        dirs = [p for p in self.dir_path.iterdir() if p.is_dir()]
        current_directories = set(p.name for p in dirs)
        added_directories = current_directories - self.directories
        deleted_directories = self.directories - current_directories

        if scan_type == 'incremental':
            if len(added_directories) > 0:
                self.callback(self.events['ADD'], [self.dir_path / name for name in added_directories])
            if len(deleted_directories) > 0:
                self.callback(self.events['DELETE'], [self.dir_path / name for name in deleted_directories])
        elif scan_type == 'full':
            self.callback(self.events['FULL_SCAN'], dirs)

        self.directories = current_directories

    def __str__(self):
        return f'Observer(name={self.name}, dir_path={self.dir_path}, interval={self.interval}, full_scan_every_n_scans={self.full_scan_every_n_scans})'


class Poller:
    def __init__(self):
        """
        Calls the registered observers at their specified intervals. Accurate intervals are not guaranteed.
        An observer will be called at most once in the interval specified by the observer.

        WARNING: This is a blocking function. It will run indefinitely.
        """
        self.observers = dict()
        self.last_call_times = defaultdict(int)
        self.scan_count = defaultdict(int)
        self.retries = defaultdict(int)

    def register(self, observer: Observer) -> None:
        """
        Register an observer.

        :param observer: Observer instance to register.
        """
        observer.interval = int(observer.interval)
        assert observer.interval >= 1
        self.observers[observer.name] = observer
        logger.info(
            f'Registered: {observer}.'
        )

    def unregister(self, name: str) -> bool:
        """
        Unregister an observer.
        This will not stop the observer if it's already running. It'll just stop calling the observer in the future.

        :param name: Name of the observer to unregister.
        :return: True if the observer was unregistered, False otherwise.
        """
        if name not in self.observers:
            logger.warning(f'Observer {name} not found.')
            return False
        self.observers.pop(name)
        self.last_call_times.pop(name, None)
        self.scan_count.pop(name, None)
        self.retries.pop(name, None)
        return True

    def _poll(self):
        for observer in self.observers.values():
            current_time = time.time()
            elapsed_since_last_call = current_time - self.last_call_times[observer.name]
            # print(observer.name, elapsed_since_last_call, observer.interval)
            # print(observer.name, observer.full_scan_every_n_scans, self.scan_count)
            if elapsed_since_last_call >= observer.interval:
                self.scan_count[observer.name] = self.scan_count[observer.name] + 1
                scan_type = 'incremental'
                if observer.full_scan_every_n_scans and (
                        self.scan_count[observer.name] >= observer.full_scan_every_n_scans
                ):
                    scan_type = 'full'
                    self.scan_count[observer.name] = 0
                try:
                    observer.watch(scan_type=scan_type)
                    self.retries[observer.name] = 0
                except KeyboardInterrupt:
                    logger.info('KeyboardInterrupt received. Exiting.')
                    return
                except Exception as e:
                    logger.error(f'exception in calling observer {observer.name}', exc_info=e)
                    self.retries[observer.name] += 1
                    if self.retries[observer.name] >= observer.max_retries:
                        logger.error(f"Max retries reached for {observer.name}. Stopping.")
                        self.unregister(observer.name)
                        continue
                self.last_call_times[observer.name] = int(current_time)

    def poll(self, loop=True) -> None:
        """
        Call the registered observers at their specified intervals.
        """

        if loop:
            try:
                while True:
                    self._poll()
                    time.sleep(1)
            except KeyboardInterrupt:
                logger.info('KeyboardInterrupt received. Exiting.')
                return
        else:
            self._poll()
