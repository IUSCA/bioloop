# Test Bulk Registration Script

This script tests the bulk dataset registration API by attempting to register a mix of datasets that already exist and some that don't exist in the database.

## What it does:

1. **Generates test datasets**: Creates 5 test datasets with predictable names
2. **Checks existing datasets**: Queries the database to see which datasets already exist
3. **Calls bulk API**: Attempts to register all datasets via the bulk API
4. **Logs results**: Shows created, conflicted, and errored datasets
5. **Persists logs**: Saves detailed logs to `/opt/sca/logs/register_ondemand/`

## Usage:

From inside the celery_worker container:

```bash
# First, source the environment variables
source .env

# Test with DATA_PRODUCT datasets
python workers/scripts/test_bulk_registration.py --dataset-type=DATA_PRODUCT

# Test with RAW_DATA datasets  
python workers/scripts/test_bulk_registration.py --dataset-type=RAW_DATA

# Use custom log level
python workers/scripts/test_bulk_registration.py --dataset-type=DATA_PRODUCT --log-level=DEBUG
```

## Test Dataset Strategy:

The script creates a mix of datasets:

**New datasets (should be created):**
- `test_{type}_new_001` through `test_{type}_new_003`
- `test_{type}_final_001`

**Existing datasets (should conflict):**
- Uses **real dataset names** that already exist in your system
- Queries the database to find actual existing datasets
- Uses up to 2 existing dataset names for testing conflicts

## Expected Results:

- **New datasets**: Should appear in "CREATED" section
- **Existing datasets**: Should appear in "CONFLICTED" section  
- **API errors**: Should appear in "ERRORED" section

## Log Files:

Logs are saved to: `/opt/sca/logs/register_ondemand/test_bulk_registration_YYYY-MM-DD_HH-MM-SS.log`

## Requirements:

- Must be run inside celery_worker container
- API server must be running and accessible
- Environment variables must be loaded (`source .env`)
- Database must be accessible
