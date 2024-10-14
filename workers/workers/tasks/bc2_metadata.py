import csv
import requests
import workers.api as api

def parse_csv(file_path, orien_avatar_key):
  data = []
  with open(file_path, mode='r') as file:
    csv_reader = csv.DictReader(file)
    for row in csv_reader:
      if row['orien_avatar_key'] == orien_avatar_key:
        data.append(row)
  return data

def send_to_api(data, api_url):
  headers = {'Content-Type': 'application/json'}
  for item in data:
    response = requests.post(api_url, json=item, headers=headers)
    if response.status_code != 200:
      print(f"Failed to send data: {item}")
    else:
      print(f"Successfully sent data: {item}")

def get_metadata_from_csv(celery_task, dataset_id, **kwargs):
  print("Getting metadata from CSV")
  dataset = api.get_dataset(dataset_id=dataset_id)

  file_path = '/home/ryanlong/Downloads/metadata_2024_03_01.csv'
  data = parse_csv(file_path, dataset['name'])
  print(data)

  print("Sending data to API")

  # create test data
  data = [
    {
      "name": "Name",
      "description": "Chuck"
    },
    {
      "name": "Age",
      "description": "43"
    }
  ]

  print(data)

  api.create_metadata(dataset_id=dataset_id, data=data)

  return dataset_id
