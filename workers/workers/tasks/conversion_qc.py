from __future__ import annotations

import os
from pathlib import Path

from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.tasks.qc import create_report

app = Celery("tasks")
app.config_from_object(celeryconfig)


def generate_qc(celery_task, dataset_id_conversion_id, **kwargs):
    conversion = api.get_conversion(conversion_id=dataset_id_conversion_id['conversion_id'], include_dataset=True)
    dataset = api.get_dataset(dataset_id=dataset_id_conversion_id['dataset_id'])
    
    all_conversions_output_dir = Path(conversion['definition']['output_directory'])
    conversion_run_dir = all_conversions_output_dir / f'{conversion["id"]}'

    dataset = api.get_dataset(dataset_id=dataset['id'])
    dataset_type = dataset['type']

    conversion_run_dir = all_conversions_output_dir / f'{conversion["id"]}'
    print(f"conversion_run_dir: {conversion_run_dir}")

    conversion_output_dir = conversion_run_dir / f'{dataset["name"]}'
    print(f"conversion_output_dir: {conversion_output_dir}")

    if not conversion_output_dir.exists():
        raise Exception(f"Conversion output directory does not exist: {conversion_output_dir}")
    
    dataset_qc_dir = Path(config['paths'][dataset_type]['qc']) / dataset['name'] / 'qc'

    # for i in os.listdir(conversion_output_dir):
    #     p = os.path.join(conversion_output_dir, i)
            
    report_id = create_report(
        celery_task=celery_task,
        dataset_dir=conversion_output_dir,
        dataset_qc_dir=dataset_qc_dir,
        report_id=(dataset.get('metadata', {}) or {}).get('report_id', None)
    )

    report_filename = dataset_qc_dir / 'multiqc_report.html'

    # if the report is created successfully
    if report_filename.exists():
        update_data = {
            'metadata': {
                'report_id': report_id
            }
        }
        api.update_dataset(dataset_id=conversion['dataset_id'], update_data=update_data)
        api.upload_report(dataset_id=conversion['dataset_id'], report_filename=report_filename)
        api.add_state_to_dataset(dataset_id=conversion['dataset_id'], state='QC')
    else:
        pass
        # TODO: fail the task if there is no report?
        # nonRetryable exception

    return {'dataset_id': dataset['id'], 'conversion_id': conversion['id']},
