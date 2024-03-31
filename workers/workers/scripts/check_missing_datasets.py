from pathlib import Path
import csv
import fire

import workers.api as api

dataset_ids = []


# datasets_file = '/home/ripandey/cfndap_datasets_failed_sync.csv'
# output_file = '/home/ripandey/missing_origin_paths.csv'


def main(output_file: str, input_file: str = './cfndap_datasets_failed_sync.csv'):
    with open(input_file, 'r') as file:
        dataset_ids.append(file.readline().strip())

    with open(output_file, 'r') as file:
        writer = csv.writer(file)
        csv_fields = ['id', 'origin_path']
        writer.writerow(csv_fields)

        for ds_id in dataset_ids:
            dataset = api.get_dataset(dataset_id=ds_id)
            origin_path = Path(dataset['origin_path'])

            if not origin_path.exists():
                writer.writerow([ds_id, dataset['origin_path']])


if __name__ == "__main__":
    fire.Fire(main)
