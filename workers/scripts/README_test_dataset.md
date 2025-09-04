# Test Dataset Creation Script

## Overview
This script creates a test Raw Data dataset for the bcl2fast pipeline that can be used to validate the pipeline functionality and test various command-line arguments.

## What it creates
The script generates a minimal but valid BCL (Base Call) dataset structure that mimics a real Illumina sequencing run:

- **SampleSheet.csv** - Required for bcl2fastq pipeline
- **RunInfo.xml** - Run information and metadata
- **RunParameters.xml** - Run parameters and configuration
- **Data/Intensities/BaseCalls/** - BCL data structure with:
  - 1 lane (L001)
  - 302 cycles (C001.1 to C302.1)
  - Empty BCL, LOCs, and FILTER files (minimal size)
- **metadata.json** - Dataset information and test details

## Usage

### From within celery_worker container:
```bash
# Create with default name (timestamp-based)
python /opt/workers/scripts/create_test_bcl2fast_dataset.py

# Create with custom name
python /opt/workers/scripts/create_test_bcl2fast_dataset.py my_test_dataset
```

### From host machine:
```bash
# Execute inside the container
docker exec -it bioloop-celery_worker-1 python /opt/workers/scripts/create_test_bcl2fast_dataset.py

# With custom name
docker exec -it bioloop-celery_worker-1 python /opt/workers/scripts/create_test_bcl2fast_dataset.py my_test_dataset
```

## Features

### 1. Existence Check
- Uses the `/datasets/raw_data/{name}/exists` API endpoint
- Prevents overwriting existing datasets
- Provides clear error messages

### 2. Valid BCL Structure
- Creates the exact directory structure expected by bcl2fastq
- Includes all required metadata files
- Generates minimal but valid BCL files

### 3. Test Flag Support
- Designed to work with `--no-lane-splitting` flag
- Can be extended for other flags from `seed_data/arguments.js`
- Includes metadata about test flags used

### 4. Proper Placement
- Places dataset in `/opt/sca/data/origin/raw_data/`
- Follows the Bioloop directory structure
- Ready for pipeline processing

## Test Arguments

The script is designed to work with these flags from the seed data:

- `--no-lane-splitting` ✅ (Boolean flag)
- `--ignore-missing-bcls` ✅ (Boolean flag)  
- `--delete-undetermined` ✅ (Boolean flag)
- `--filter-single-index` ✅ (Boolean flag)
- `--barcode-mismatches` ✅ (NUMBER: 0, 1, 2)
- `--uses-bases-mask` ✅ (STRING)

## Requirements

- **Container**: Must run from within `celery_worker` container
- **API Access**: Requires working API connection
- **Permissions**: Write access to `/opt/sca/data/origin/raw_data/`
- **Dependencies**: Python 3.6+, pathlib, requests

## Output Location

The dataset will be created at:
```
/opt/sca/data/origin/raw_data/{dataset_name}/
```

## Validation

After creation, the dataset should:
1. ✅ Be recognized by the Bioloop watch system
2. ✅ Pass dataset validation checks
3. ✅ Work with the bcl2fast pipeline
4. ✅ Accept the `--no-lane-splitting` flag
5. ✅ Generate valid FASTQ output

## Troubleshooting

### Common Issues:

1. **"Origin directory does not exist"**
   - Ensure you're running from within the celery_worker container
   - Check that `init_dirs.sh` has been run

2. **"Failed to initialize API session"**
   - Verify API is running and accessible
   - Check configuration in `.env` file

3. **"Dataset already exists"**
   - Choose a different dataset name
   - Or delete the existing dataset first

4. **Permission denied errors**
   - Ensure proper container permissions
   - Check volume mount configuration

## Example Output

```
Creating test BCL dataset: test_bcl2fast_20250120_143022
✓ API session initialized
Checking if dataset 'test_bcl2fast_20250120_143022' already exists...
✓ Dataset 'test_bcl2fast_20250120_143022' does not exist. Proceeding...
✓ Origin directory found: /opt/sca/data/origin/raw_data
Created BCL dataset structure at: /opt/sca/data/origin/raw_data/test_bcl2fast_20250120_143022
✓ Successfully created test dataset at: /opt/sca/data/origin/raw_data/test_bcl2fast_20250120_143022

============================================================
TEST DATASET CREATION COMPLETED
============================================================
Dataset Name: test_bcl2fast_20250120_143022
Location: /opt/sca/data/origin/raw_data/test_bcl2fast_20250120_143022
Type: Raw Data
Pipeline: bcl2fast
Test Flag: --no-lane-splitting

Dataset Structure:
├── SampleSheet.csv (required for bcl2fastq)
├── RunInfo.xml (run information)
├── RunParameters.xml (run parameters)
├── Data/Intensities/BaseCalls/ (BCL data structure)
│   └── L001/ (Lane 1)
│       └── C001.1/ to C302.1/ (cycles)
└── metadata.json (dataset metadata)

This dataset should work with the bcl2fast pipeline
and can be used to test the --no-lane-splitting flag.
============================================================
```
