from pathlib import Path

from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers import cmd
from workers.exceptions import ConversionException

app = Celery("tasks")
app.config_from_object(celeryconfig)


def run_conversion(celery_task, conversion_id, **kwargs):
    conversion = api.get_conversion(conversion_id=conversion_id, include_dataset=True)
    dataset_id = conversion['dataset_id']
    argsList = conversion['argsList']
    definition = conversion['definition']
    program = definition['program']

    cwd_str = program['executable_directory']
    if cwd_str:
        cwd = Path(cwd_str).resolve()
        if not cwd.exists():
            raise ConversionException(f"Executable directory {cwd} does not exist")
        executable_path = cwd / program['executable_path']
    else:
        cwd = None
        executable_path = Path(program['executable_path']).resolve()

    if not executable_path.exists():
        raise ConversionException(f"Executable {executable_path} does not exist")
    if not executable_path.is_file():
        raise ConversionException(f"Executable {executable_path} is not a file")

    args = [program['executable_path']] + argsList
    if definition.get('capture_logs', False):
        cmd.execute_with_log_tracking(cmd=args, celery_task=celery_task, cwd=(str(cwd) if cwd else None))
    else:
        cmd.execute(cmd=args, cwd=(str(cwd) if cwd else None))

    return dataset_id,
