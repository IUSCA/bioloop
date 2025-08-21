# Register OnDemand Test Cases

This directory contains comprehensive test cases for the `register_ondemand.py` script. All tests are designed to run inside the celery_worker container.

## Overview

The test suite includes:

1. **Dataset Generator**: Creates test datasets with configurable size and type
2. **10 Test Cases**: Cover all major functionality of register_ondemand.py
3. **Master Test Runner**: Executes all test cases and provides summary

## Test Cases

| Case | Description | Parameters Tested |
|------|-------------|-------------------|
| 01 | RAW_DATA with current directory (.) | `--dataset-type=RAW_DATA`, `--ingest-subdirs=true`, `path=.` |
| 02 | DATA_PRODUCT with current directory (.) | `--dataset-type=DATA_PRODUCT`, `--ingest-subdirs=false`, `path=.` |
| 03 | DATA_PRODUCT with absolute path | `--dataset-type=DATA_PRODUCT`, `--ingest-subdirs=true`, absolute path |
| 04 | DATA_PRODUCT with absolute path, no subdirs | `--dataset-type=DATA_PRODUCT`, `--ingest-subdirs=false`, absolute path |
| 05 | Missing dataset-type parameter | Error handling test |
| 06 | RAW_DATA with project assignment | `--project-id`, project association verification |
| 07 | DATA_PRODUCT with prefix | `--prefix`, name verification |
| 08 | DATA_PRODUCT with suffix | `--suffix`, name verification |
| 09 | DATA_PRODUCT with prefix and suffix | `--prefix` + `--suffix`, name verification |
| 10 | DATA_PRODUCT with description | `--description`, description verification |

## Files

- `generate_test_datasets.py`: Creates test datasets in appropriate directories
- `test_case_XX_*.py`: Individual test case scripts (01-10)
- `run_all_test_cases.py`: Master script to run all tests
- `README.md`: This documentation

## Usage

### Running Individual Test Cases

From inside the celery_worker container:

```bash
# Run a specific test case
cd /opt/sca/workers
python workers/scripts/register_ondemand_test_cases/test_case_01_raw_data_current_dir.py
```

### Running All Test Cases

```bash
# Run the complete test suite
cd /opt/sca/workers
python workers/scripts/register_ondemand_test_cases/run_all_test_cases.py
```

### Creating Test Datasets Manually

```bash
# Generate a single RAW_DATA dataset (5MB)
cd /opt/sca/workers
python workers/scripts/register_ondemand_test_cases/generate_test_datasets.py --dataset-type RAW_DATA

# Generate multiple DATA_PRODUCT datasets (2MB each)
python workers/scripts/register_ondemand_test_cases/generate_test_datasets.py --dataset-type DATA_PRODUCT --size-mb 2.0 --multiple
```

## Logging

All test logs are stored in `/opt/sca/logs/register_ondemand/`:

- `dataset_generator.log`: Dataset generation logs
- `test_case_XX.log`: Individual test case logs
- `run_all_test_cases.log`: Master test runner logs

## Test Data Locations

Test datasets are created in:
- RAW_DATA: `/opt/sca/data/register_ondemand/raw_data/`
- DATA_PRODUCT: `/opt/sca/data/register_ondemand/data_products/`

## Requirements

1. Must be run inside the celery_worker container
2. API server must be running and accessible
3. Database must be initialized with proper schema
4. Required directories must exist (created by `init_dirs.sh`)

## Expected Behavior

- **Test Cases 01-04, 06-10**: Should complete successfully if register_ondemand.py works correctly
- **Test Case 05**: Should fail gracefully with appropriate error message
- **Test Case 06**: Will skip project association verification if project API is not available

## Troubleshooting

1. **API Connection Errors**: Ensure the API server is running and accessible
2. **Permission Errors**: Ensure proper file permissions in data directories
3. **Database Errors**: Verify database schema is up to date
4. **Missing Directories**: Run `init_dirs.sh` to create required directory structure

## Notes

- Test datasets are small (1-5MB) to ensure fast execution
- Each test case creates unique dataset names to avoid conflicts
- Tests verify both command execution and API response validation
- Test Case 06 may exit early if project API functions are not available (as per user requirements)
