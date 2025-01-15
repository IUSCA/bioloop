## Dataset Registration Worker
The `watch.py` script registers a directory as a `RAW_DATA` or a `DATA_PRODUCT` within the system.

### Paths
The script is configured to watch over two locations:
1. RAW_DATA origin path 
2. DATA_PRODUCT origin path

### Intervals
The script scans these locations for new directories every 10 seconds.

### Init
Upon initialization, the watch script retrieves two sets of datasets (duplicates and non-duplicates) that are currently registered in the system.

### Registration
1. If a dataset with that directory's name doesn't exist in the system, a new dataset is registered.
2. If a non-duplicate dataset with that name/type already exists in the system:
    - If the directory's last modified time is more recent than the non-duplicate-dataset's creation time:
      - then the directory is considered a duplicate dataset, and registered as a duplicate dataset in the system.
3. If a duplicate dataset with that name/type already exists in the system:
    - the script warns that this directory has already been registered as a duplicate dataset in the system, and that a new duplicate dataset will not be registered.
