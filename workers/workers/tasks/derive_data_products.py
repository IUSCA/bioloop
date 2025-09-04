from __future__ import annotations

import os
from pathlib import Path

from celery import Celery
import requests

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


def derive(celery_task, dataset_id_conversion_id, **kwargs):
    """
    Create data product datasets from conversion output directories.
    
    For all directories inside conversion_output_dir, a new data product dataset
    is created using the POST /datasets/bulk API.
    
    @param celery_task: WorkflowTask
    @param dataset_id: (int): Source dataset ID
    @param conversion_id: (int): Conversion ID
    @return: tuple (dataset_id, conversion_id)
    """
    # Get conversion information
    conversion = api.get_conversion(conversion_id=dataset_id_conversion_id['conversion_id'], include_dataset=True)
    dataset = api.get_dataset(dataset_id=dataset_id_conversion_id['dataset_id'])
    
    print(f"conversion: {conversion}")
    print(f"conversion['definition']: {conversion['definition']}")
    print(f"conversion['definition']['output_directory']: {conversion['definition']['output_directory']}")

    all_conversions_output_dir = Path(conversion['definition']['output_directory'])
    conversion_run_dir = all_conversions_output_dir / f'{conversion["id"]}'
    conversion_output_dir = conversion_run_dir / f'{dataset["name"]}'
    
    print(f"conversion_run_dir: {conversion_run_dir}")
    print(f"conversion_output_dir: {conversion_output_dir}")

    # if not conversion_output_dir.exists():
    #     raise Exception(f"Conversion output directory does not exist: {conversion_output_dir}")
    
    # Find all directories inside conversion_output_dir
    output_directories = []
    for item in os.listdir(conversion_output_dir):
        item_path = conversion_output_dir / item
        if item_path.is_dir():
            output_directories.append(item_path)
    
    if not output_directories:
        print("No output directories found - no data products to create")
        return {'dataset_id': dataset['id'], 'conversion_id': conversion['id']},
    
    print(f"Found {len(output_directories)} output directories to create as data products")
    
    # Prepare datasets for bulk creation
    datasets_to_create = []
    for output_dir in output_directories:
        # Use the directory name as the dataset name
        data_product_name = output_dir.name
        
        # Create a unique name by combining source dataset name and output directory name
        unique_name = f"{dataset['name']}_{data_product_name}"
        
        dataset_payload = {
            "name": unique_name,
            "type": "DATA_PRODUCT",
            "origin_path": str(output_dir),
        }
        datasets_to_create.append(dataset_payload)
        print(f"Prepared data product: {unique_name} from {output_dir}")
    
    # Create all data products using bulk API
    print(f"Creating {len(datasets_to_create)} data products via bulk API...")
    result = api.bulk_create_datasets(datasets_to_create)
    
    print(f"Bulk creation result: {result}")
    
    # Log results
    if result.get('created'):
        print(f"Successfully created {len(result['created'])} data products")
        for created_dataset in result['created']:
            print(f"  - Created: {created_dataset['name']} (ID: {created_dataset['id']})")
    
    if result.get('conflicted'):
        print(f"Found {len(result['conflicted'])} conflicted datasets (already exist)")
        for conflicted in result['conflicted']:
            print(f"  - Conflicted: {conflicted['name']}")
    
    if result.get('errored'):
        print(f"Found {len(result['errored'])} errored datasets")
        for errored in result['errored']:
            print(f"  - Errored: {errored['name']}")
    
    # Create dataset hierarchy relationships for successfully created datasets
    created_data_products = result['created']
    conflicting_datasets = []

    # Gather details of conflicted datasets by fetching them from the API
    if result.get('conflicted'):
        print(f"Fetching details for {len(result['conflicted'])} conflicted datasets...")
        for conflicted in result['conflicted']:
              # Search for the existing dataset by name and type
              conflicting_datasets = api.get_all_datasets(
                  name=conflicted['name'],
                  dataset_type=conflicted['type'],
                  match_name_exact=True,
              )
              if len(conflicting_datasets) > 0:
                  conflicting_dataset = conflicting_datasets[0]
                  created_data_products.append(conflicting_dataset)
                  print(f"  - Found conflicted dataset: {conflicting_dataset['name']} (ID: {conflicting_dataset['id']})")

    # Due to bulk creation, only one of derived (created) or conflicting datasets' lists
    # will be non-empty
    derived_data_products = created_data_products + conflicting_datasets

    # Create hierarchy relationships for all data products (created + conflicted)
    # TODO - check if hierarchy relationships already exist
    if derived_data_products:
        dataset_hierarchy_data = []
        conversion_derivation_data = []
        
        for data_product in derived_data_products:
            dataset_hierarchy_data.append({
                "source_id": dataset['id'],
                "derived_id": data_product['id']
            })
              
            conversion_derivation_data.append({
                "conversion_id": conversion['id'],
                "dataset_id": data_product['id']
            })

        # try:
        api.create_dataset_hierarchy(dataset_hierarchy_data)
        api.post_conversion_derived_datasets(conversion_derivation_data)
        # except requests.exceptions.HTTPError as e:
        #     print(f"Error creating records: {e}")
        #     if e.response.status_code == 409:
        #         print(f"Conflict creating records: {e}")
        #         print(f"Skipping creation of records")
        #     else:
        #         raise

        # print(f"Creating {len(dataset_hierarchy_data)} hierarchy relationships...")
        # print("Hierarchy relationships created successfully")
        print(f"Creating {len(conversion_derivation_data)} conversion derivations...")
        print("Conversion derivations created successfully")

    return {'dataset_id': dataset['id'], 'conversion_id': conversion['id']},
