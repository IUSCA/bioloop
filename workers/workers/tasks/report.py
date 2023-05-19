from __future__ import annotations

import uuid
from pathlib import Path

from celery import Celery
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


def run_fastqc(celery_task: WorkflowTask, source_dir, output_dir):
    """
    Run the FastQC tool to check the quality of all fastq files 
    (.fastq.gz) in the source directory recursively.

    @param celery_task: WorkflowTask
    @param source_dir: (pathlib.Path): The dataset / sequencing run directory
    @param output_dir: (pathlib.Path): where to create the reports (a .zip and .html file)
    @return: None

    """
    NUM_THREADS = 8
    BATCH_SIZE = NUM_THREADS
    fastq_files = [str(p) for p in source_dir.glob('**/*.fastq.gz')]
    prog = Progress(celery_task=celery_task, name='fastqc', total=len(fastq_files), units='items')

    done = 0
    prog.update(done=done)
    for batch in utils.batched(fastq_files, n=BATCH_SIZE):
        cmd.fastqc_parallel(fastq_files=batch, output_dir=output_dir, num_threads=NUM_THREADS)
        done += len(batch)
        prog.update(done=done)


def create_report(celery_task: WorkflowTask, dataset_dir: Path, dataset_qc_dir: Path, report_id: str = None) -> str:
    """
    Runs fastqc and multiqc on dataset files. The qc files are placed in dataset_qc_dir

    @param celery_task: WorkflowTask
    @param dataset_dir: (Path): Staged dataset directory path
    @param dataset_qc_dir: (Path): directory to generate the qc reports in
    @param report_id: (str): report_id of the last generated report to be reused. (optional)
    @return: The report ID (UUID4)

    """
    report_id = report_id or str(uuid.uuid4())
    dataset_qc_dir.mkdir(parents=True, exist_ok=True)

    run_fastqc(celery_task, dataset_dir, dataset_qc_dir)
    cmd.multiqc(dataset_qc_dir, dataset_qc_dir)

    return report_id


def generate_reports(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    dataset_type = dataset['type'].lower()
    dataset_qc_dir = Path(config['paths'][dataset_type]['qc']) / dataset['name'] / 'qc'
    staged_path = Path(config['paths'][dataset_type]['stage']) / dataset['name']

    report_id = create_report(
        celery_task=celery_task,
        dataset_dir=staged_path,
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
        api.update_dataset(dataset_id=dataset_id, update_data=update_data)
        api.upload_report(dataset_id=dataset_id, report_filename=report_filename)
        api.add_state_to_dataset(dataset_id=dataset_id, state='QC')
    else:
        pass
        # TODO: fail the task if there is no report?
        # nonRetryable exception

    return dataset_id,
