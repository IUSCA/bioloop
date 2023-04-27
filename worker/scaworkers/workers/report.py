import shutil
import uuid
from pathlib import Path

from celery import Celery

import scaworkers.api as api
import scaworkers.celeryconfig as celeryconfig
import scaworkers.utils as utils
from scaworkers.config import config
from scaworkers.workflow import WorkflowTask

app = Celery("tasks")
app.config_from_object(celeryconfig)


def run_fastqc(source_dir, output_dir):
    """
    Run the FastQC tool to check the quality of all fastq files 
    (.fastq.gz) in the source directory recursively.

    :param source_dir: (pathlib.Path): The batch / sequencing run directory
    :param output_dir: (pathlib.Path): where to create the reports (a .zip and .html file)
    :return: None
    """
    fastq_files = [str(p) for p in source_dir.glob('**/*.fastq.gz')]

    # fastqc -t 8 parallel processes 8 fastq files at once
    # all fastq files are sent as command line args
    if len(fastq_files) > 0:
        cmd = ['fastqc', '-t', '8'] + fastq_files + ['-o', str(output_dir)]
        utils.execute(cmd)


def run_multiqc(source_dir, output_dir):
    """
    Run the MultiQC tool to generate an aggregate report
    
    :param source_dir: (pathlib.Path): where fastqc generated reports
    :param output_dir: (pathlib.Path): where to create multiqc_report.html and multiqc_data
    :return:
    """
    cmd = ['multiqc', str(source_dir), '-o', str(output_dir)]
    utils.execute(cmd)


def cleanup(report_dir):
    """
    Delete all files and directories except multiqc_report.html in the report_dir
    :param report_dir: (pathlib.Path): where fastqc and multiqc generates reports
    :return:
    """
    for f in report_dir.iterdir():
        if f.name != 'multiqc_report.html':
            if f.is_dir():
                shutil.rmtree(f)
            else:
                f.unlink()


def create_report(batch_dir: Path, batch_qc_dir: Path, report_id: str = None) -> str:
    """
    Runs fastqc and multiqc on batch files. The qc files are placed in batch_qc_dir


    :param batch_dir: (Path): Staged batch directory path
    :param batch_qc_dir: (Path): directory to generate the qc reports in
    :param report_id: (str): report_id of the last generated report to be reused. (optional)
    :return: The report ID (UUID4)
    """
    report_id = report_id or str(uuid.uuid4())
    batch_qc_dir.mkdir(parents=True, exist_ok=True)

    run_fastqc(batch_dir, batch_qc_dir)
    run_multiqc(batch_qc_dir, batch_qc_dir)

    return report_id


@app.task(base=WorkflowTask, bind=True)
def generate(celery_task, batch_id, **kwargs):
    batch = api.get_batch(batch_id=batch_id)
    batch_type = batch['type'].lower()
    batch_qc_dir = Path(config['paths'][batch_type]['qc']) / batch['name'] / 'qc'
    staged_path = Path(config['paths'][batch_type]['stage']) / batch['name']

    report_id, batch_qc_dir = create_report(
        batch_dir=staged_path,
        batch_qc_dir=batch_qc_dir,
        report_id=batch.get('attributes', {}).get('report_id', None)
    )

    report_filename = batch_qc_dir / 'multiqc_report.html'

    # if the report is created successfully
    if report_filename.exists():
        update_data = {
            'attributes': {
                'report_id': report_id
            }
        }
        api.update_batch(batch_id=batch_id, update_data=update_data)
        api.upload_report(batch_id=batch_id, report_filename=report_filename)
        api.add_state_to_batch(batch_id=batch_id, state='QC')
    else:
        pass
        # TODO: fail the task if there is not report?

    return batch_id,
