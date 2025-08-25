- write script to create datasets (less than 5 MB is fine, but size should be configurable) of type RAW_DATA or DATA_PRODUCT (coinfigurable) and place them in register_ondemand locations mentioned in docker.py. These will be used to test the cases below, for the register_ondemand.py script.
- make sure name chosen for dataset to be created dosesn't exist. Use /datasets route's /exists endpoint to check.
- use api.py to make API calls from python code
- add param to script to generate either a single dataset directory, or multiple  dataset directories, which are all embedded at the top-level of a created directory. This will be used to test cases of ingesting a single directory, or multiple directories present within the top-level of a directory.
- For test cases with `.` being provided as the --path param, you will need to run the script from the /opt/sca/data/register_ondemand/[raw_data | data_products]/[directory_you_created_for_this_test_case] directory.
- for each test case, persist logs to /opt/sca/logs/register_ondemand
- All These scripts will be executed from INSIDE the celery_worker container, not from the host machine.
- Each test case script should be inside workers/workers/scripts/register_ondemand_test_cases.
- test case scripts should use the script you create to generate datasets, in order to generate datasets for the test cases.

Case 1:
- --dataset-type = RAW_DATA
- --path - provide `.` for this value (current dir).
- --ingest_subdirs: true

Case 2:
- --dataset-type = DATA_PRODUCT
- --path - provide `.` for this value (current dir).
- --ingest_subdirs: false

Case 3:
- --dataset-type = DATA_PRODUCT
- --path - provide an actual path for this value (as opposed to `.`).
- --ingest_subdirs: true

Case 4:
- --dataset-type = DATA_PRODUCT
- --path - provide an actual path for this value (as opposed to `.`).
- --ingest_subdirs: false

Case 5:
- --dataset-type = don't provide arg
- ensure that output logs an error

Case 6:
- --dataset-type = RAW_DATA
- --project_id = find a random project_id using API calls
- --ingest_subdirs = true
- ensure via api call that created datasets are linked to selected project

Case 7:
- --dataset-type = DATA_PRODUCT
- --ingest_subdirs=true
- --prefix = some random string
- ensure that all created datasets have prefix at the beginning of their names

Case 8:
- --dataset-type = DATA_PRODUCT
- --ingest_subdirs=true
- --suffix = some random string
- ensure that all created datasets have suffix at the end of their names

Case 9:
- --dataset-type = DATA_PRODUCT
- --ingest_subdirs=true
- --suffix = some random string
- --prefix = some random string
- ensure that all created datasets have both prefix and suffix in the name

Case 10:
- --dataset-type = DATA_PRODUCT
- --ingest_subdirs=true
- description = some random string
- ensure that all created datasets have their `description` set to the string provided 

Case 11:
- --ingest_subdirs=true
- some, but not all of the names of the subdirectories to be ingested are already in use by existing datasets

