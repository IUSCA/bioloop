import time
from pathlib import Path

from watchdog.events import RegexMatchingEventHandler
from watchdog.observers import Observer

from scaworkers.config import config
import scaworkers.api as api


class TopLevelDirHandler(RegexMatchingEventHandler):
    """
    the regular expression matches a string that starts with the watched path,
    followed by a forward slash, and then one or more non-slash characters until
    the end of the string. This pattern matches only paths that contain exactly
    one directory below the watched path, making it suitable for monitoring only
    top-level directories.

    ^ matches the beginning of the string.
    {}\/ inserts the watched path into the regex, followed by a forward slash.
        The curly braces are a placeholder for the watched path, and the backslash is used to
        escape the forward slash character.
    [^\/]+ matches one or more characters that are not forward slashes.
        The ^ inside the square brackets means "negate the character class",
        so the expression matches any character that is not a forward slash.
        The + means to match one or more of these non-slash characters.
    $ matches the end of the string.
    """

    def __init__(self, path, callback):
        self.path = path
        self.callback = callback
        regexes = [r'^{}\/[^\/]+$'.format(path)]
        super().__init__(regexes=regexes, ignore_directories=False)

    def on_created(self, event):
        if event.is_directory:
            # print("m1 - New top-level directory created:", event.src_path)
            self.callback()

    def on_moved(self, event):
        if event.is_directory:
            # print("m1 - New top-level directory moved:", event.src_path, event.dest_path)
            self.callback()


# def dir1_callback():
#     print('change in m1')
#
#
# def dir2_callback():
#     print('change in m2')


def scan(path_to_target_dir: str, registered_names: list[str], rejects: list[str]) -> list[Path]:
    """
    return the directories in target_dir which are not in registered and not in rejects

    :return: new directories to register
    """
    target_dir = Path(path_to_target_dir)
    dirs = [
        p for p in target_dir.iterdir()
        if all([
            p.is_dir(),
            p.name not in set(registered_names),
            p.name not in set(rejects)
        ])
    ]
    return dirs


def register_raw_data() -> None:
    reg_config = config['registration']['raw_data']
    registered_names = [batch['name'] for batch in api.get_all_batches(batch_type='RAW_DATA')]
    candidates = scan(
        path_to_target_dir=reg_config['source_dir'],
        registered_names=registered_names,
        rejects=reg_config['rejects']
    )
    for candidate in candidates:
        print('registering raw data', candidate.name)
        batch = {
            'name': candidate.name,
            'type': 'RAW_DATA',
            'origin_path': str(candidate.resolve()),
        }
        api.create_batch(batch)


def register_data_products() -> None:
    reg_config = config['registration']['data_products']
    registered_names = [batch['name'] for batch in api.get_all_batches(batch_type='DATA_PRODUCT')]
    candidates = scan(
        path_to_target_dir=reg_config['source_dir'],
        registered_names=registered_names,
        rejects=reg_config['rejects']
    )
    for candidate in candidates:
        print('registering data product', candidate.name)
        batch = {
            'name': candidate.name,
            'type': 'DATA_PRODUCT',
            'origin_path': str(candidate.resolve()),
        }
        created_batch = api.create_batch(batch)

        # Find raw_data with the same and add an association
        source_batches = api.get_all_batches(batch_type='RAW_DATA', name=candidate.name)
        if len(source_batches) > 0:
            api.add_associations([{
                'source_id': source_batches[0]['id'],
                'derived_id': created_batch['id']
            }])


if __name__ == "__main__":
    register_raw_data()
    register_data_products()

    path1 = config['registration']['raw_data']['source_dir']
    path2 = config['registration']['data_products']['source_dir']
    handler1 = TopLevelDirHandler(path1, register_raw_data)
    handler2 = TopLevelDirHandler(path2, register_data_products)
    observer = Observer()
    observer.schedule(handler1, path1, recursive=True)
    observer.schedule(handler2, path2, recursive=True)
    observer.start()
    print('observer started', path1, path2)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
