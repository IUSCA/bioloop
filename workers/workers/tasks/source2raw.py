import shutil
import tempfile
from pathlib import Path
from textwrap import dedent

from celery import current_app
from celery.utils.log import get_task_logger
from glom import glom
from sca_rhythm import WorkflowTask, Workflow

import workers.workflow_utils as wf_utils
from workers import api, cmd, exceptions
from workers.config import config
from workers.dataset import get_project_path
from workers.neuroimaging import get_subject_id, remove_non_alphanumeric

logger = get_task_logger(__name__)


def run_dicom2bids(celery_task: WorkflowTask,
                   source_data: Path,
                   dst_dir: Path,
                   subject_id: str,
                   session_name: str,
                   conv_config_path: str,
                   log_dst: Path) -> Path:
    # let dcm2bids generate output in a temp directory
    with tempfile.TemporaryDirectory(dir=dst_dir) as tmp_dir:
        # tmp_dir is of type string and has the full path to the temporary directory
        dcm2bids_args = ['dcm2bids',
                         '-d', str(source_data),
                         '-p', subject_id,
                         '-s', str(session_name),
                         '-c', conv_config_path,
                         '-o', str(tmp_dir),
                         '--clobber'
                         ]
        cmd.execute_with_log_tracking(cmd=dcm2bids_args, celery_task=celery_task)

        # TODO: Ensure that dcm2bids succeeds even when the exit code is 0.
        # dst_dir / tmp_dir still works even if tmp_dir is a full path string because
        # Pathlib removes the common prefix when joining paths
        raw_data = dst_dir / tmp_dir / f'sub-{subject_id}'
        if not raw_data.exists():
            raise exceptions.ConversionException(f'Expected Raw Data directory {str(raw_data)} is not found')

        # rename the generated directory to a unique name and move it under raw_data_root_dir
        unique_dir_name = f'sub-{subject_id}_{session_name}'
        new_raw_data = dst_dir / unique_dir_name
        shutil.rmtree(new_raw_data, ignore_errors=True)  # delete if the destination directory already exists
        shutil.move(src=raw_data, dst=new_raw_data)

        # copy the log files to {protocol_dir}/logs
        # Log files are at tmp_dcm2bids/log/*.log
        # example: tmp_dcm2bids/log/sub-10807_ses-20250224T123911_20250228-144236.log
        log_dir = dst_dir / tmp_dir / 'tmp_dcm2bids/log'
        logger.info(f'Copying log files from {log_dir} to {log_dst}, if it exists: {log_dir.exists()}')
        if log_dst is not None and log_dir.exists():
            log_files = log_dir.glob('*.log')
            for log_file in log_files:
                try:
                    logger.info(f'Copying log file {log_file} to {log_dst}')
                    shutil.copy2(log_file, log_dst)
                except Exception as e:
                    logger.warn(f'Failed to copy log file {log_file} to {log_dst}', exc_info=e)

        # getting out of this context will automatically delete the tmp_dir and tmp_dir/tmp_dcm2bids along with it

        return new_raw_data


def send_notification(dataset_name, dataset_id):
    try:
        cmd.send_email(
            from_addr=config['email']['from_addr'],
            to_addrs=config['source2raw']['notification']['to_addrs'],
            msg_subject=f'Source to Raw Conversion Completed - {dataset_name}',
            msg_body=dedent(f'''\
            Dear Operators,
            
            The source to raw data conversion process has been successfully completed. 

            Link to raw data: {config['ui_url']}/datasets/{dataset_id}
            ''').strip("\n")
        )
    except Exception as e:
        logger.warn('Unable to send email', exc_info=e)


def make_session_name(session):
    study_time = session["study_time"][:6]  # hhmmss
    return f'{session["study_date"]}T{study_time}'


def get_config_path(session, missing_ok: bool = False) -> str | None:
    # assumes that protocol is associated to the session

    conv_config_dir = config['source2raw']['dcm2bids_config_dir']
    protocol_id = glom(session, 'protocol.domain_id', default=None)
    conv_config_path = Path(conv_config_dir).resolve() / f'dcm2bids_config_{protocol_id}.json'
    if conv_config_path.exists():
        return str(conv_config_path)
    else:
        message = f'Expected {conv_config_path} conversion configuration file is not found.'
        if missing_ok:
            logger.warn(message)
        else:
            raise exceptions.ConversionException(message)


def get_dst_dir() -> Path:
    dst_dir_path = Path(config['source2raw']['raw_data_root_dir']).resolve()
    dst_dir_path.mkdir(exist_ok=True)
    return dst_dir_path


def get_log_dst(source_dataset):
    log_dst = None
    project_path = get_project_path(source_dataset)
    if project_path:
        log_dst = get_project_path(source_dataset) / 'logs'
        log_dst.mkdir(exist_ok=True)
    return log_dst


def source2raw(celery_task: WorkflowTask,
               dataset_id,
               register: bool = True,
               launch_wf: bool = False,
               **kwargs):
    """

    - Launches source2raw external program
        Conversion configuration files are dynamically read from disk at /opt/sca/cfndap/workers/dicom2bids_configs
        The conversion filename is constructed using the associated protocol's domain id:
        'dcm2bids_config_{protocol_domain_id}.json'
        source2raw task is marked failed (source data is still archived) if
        no protocol is associated with this session or the configuration file is not found
    - creates a raw dataset
    - associates rawdata with session
    - associates rawdata as dependent of source data
    - launches a workflow to archive and stage the raw dataset
    """
    source_dataset = api.get_dataset(dataset_id=dataset_id, session=True)
    if source_dataset['staged_path'] is None or not source_dataset['is_staged']:
        raise exceptions.ConversionException(f'Source data is not staged')

    source_data = Path(source_dataset['staged_path']).resolve()
    if not source_data.exists():
        raise exceptions.ConversionException(f'Source data is not found at the staged path: {source_data}')
    session = source_dataset['session']

    # check if a protocol is assigned to this session
    protocol_id = glom(session, 'protocol.domain_id', default=None)
    if not protocol_id:
        raise exceptions.ConversionException('A protocol is not assigned to this session')

    subject_id = get_subject_id(session)
    if subject_id is None:
        subject_id_key = glom(session, 'protocol.subject_id_key', default=None)
        raise exceptions.ConversionException(f'The {subject_id_key} identifier is empty in session.subject')
    subject_id = remove_non_alphanumeric(subject_id)

    # if protocol is disabled, then exit task with success status without running dcm2bids
    is_protocol_disabled = not glom(session, 'protocol.enabled', default=False)
    conv_config_path = get_config_path(session, missing_ok=is_protocol_disabled)
    if not conv_config_path:
        # exit task (with success status) as a conversion configuration file is not found
        return dataset_id,

    dst_dir_path = get_dst_dir()
    log_dst = get_log_dst(source_dataset)
    raw_data = run_dicom2bids(celery_task,
                              source_data,
                              dst_dir_path,
                              subject_id=subject_id,
                              session_name=make_session_name(session),
                              conv_config_path=conv_config_path,
                              log_dst=log_dst)

    if register:
        # create dataset and associate with the session
        # can throw DatasetAlreadyExistsError, in that case, stop the workflow
        raw_dataset = api.create_dataset({
            'name': raw_data.name,
            'type': 'RAW_DATA',
            'origin_path': str(raw_data),
            'session_id': session['id']
        })
        raw_dataset_id = raw_dataset['id']

        # create association between source and raw data
        associations = [
            {
                'source_id': source_dataset['id'],
                'derived_id': raw_dataset_id
            }
        ]
        api.add_associations(associations=associations)

        # add this raw dataset to projects which contain the protocol of this session
        # ignore failures
        try:
            api.add_dataset_to_projects(dataset_id=raw_dataset_id, protocol_domain_id=protocol_id)
        except Exception as e:
            logger.warn(f'Failed to add dataset to projects', exc_info=e)

        if launch_wf:
            integrated_wf_body = wf_utils.get_wf_body(wf_name='integrated')
            int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
            api.add_workflow_to_dataset(dataset_id=raw_dataset_id, workflow_id=int_wf.workflow['_id'])
            int_wf.start(raw_dataset_id)

        send_notification(dataset_name=raw_dataset['name'], dataset_id=raw_dataset['id'])

    return dataset_id,
