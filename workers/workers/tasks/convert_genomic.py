import shutil
import tempfile
from pathlib import Path
from pprint import pprint

from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers import cmd
from workers.exceptions import ConversionException
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


def get_sample_sheet_content(arguments: list) -> str:
    """Extract sample sheet content from flattened arguments list."""
    for i, arg in enumerate(arguments):
        if arg == '--sample-sheet' and i + 1 < len(arguments):
            return arguments[i + 1]
    return None


def has_sample_sheet(arguments: list) -> bool:
    """Check if sample sheet argument exists in flattened arguments list."""
    return '--sample-sheet' in arguments


def write_sample_sheet(arguments: list, dataset: dict) -> None:
    dataset_staged_path = Path(dataset['staged_path'])
    sample_sheet_path = dataset_staged_path / f'{dataset["id"]}_samplesheet.csv'
    with open(sample_sheet_path, 'w') as f:
        f.write(get_sample_sheet_content(arguments=arguments))


def get_program_args(arguments: list,
                     dataset: dict,
                     conversion_output_dir: Path) -> list:
    processed_args = []
    
    i = 0
    while i < len(arguments):
        arg = arguments[i]
        
        # Only process sample sheets for genomic conversions
        if (arg == '--sample-sheet' and i + 1 < len(arguments)):
            processed_args.append(arg)        

            # Replace the sample sheet content with the path to the written sample sheet file
            dataset_staged_path = Path(dataset['staged_path'])
            sample_sheet_path = dataset_staged_path / f'{dataset["id"]}_samplesheet.csv'
            processed_args.append(str(sample_sheet_path))            
            i += 2  # +2 to skip next element, which is the sample sheet content
        else:
            processed_args.append(arg)
            i += 1
    
    # Add required arguments for genomic conversions
    processed_args.extend([
        '--runfolder-dir', str(dataset['staged_path']),
        '--output-dir', str(conversion_output_dir)
    ])

    return processed_args


def run_conversion(celery_task, conversion_id, **kwargs):
    conversion = api.get_conversion(conversion_id=conversion_id, include_dataset=True)
    dataset_id = conversion['dataset_id']
    argsList = conversion['argsList']
    definition = conversion['definition']
    program = definition['program']
    
    # Get full dataset information to access staged_path
    dataset = api.get_dataset(dataset_id=dataset_id)
    
    if not dataset['is_staged']:
        raise ConversionException(f"Dataset {dataset_id} is not staged")

    # print(f"argsList:")
    # pprint(argsList)
    # print("type of argsList: ", type(argsList))
    # print(f"length of argsList: {len(argsList)}")
    # for i, arg in enumerate(argsList):
    #     print(f"arg {i}: {arg}")
    #     print(f"type of arg {i}: {type(arg)}")
    # print("--------------------------------")

    all_conversions_output_dir = Path(conversion['definition']['output_directory'])
    conversion_run_dir = all_conversions_output_dir / f'{conversion["id"]}'
    if conversion_run_dir.exists():
        shutil.rmtree(conversion_run_dir)
    conversion_output_dir = conversion_run_dir / f'{dataset["name"]}'
    conversion_output_dir.mkdir(parents=True, exist_ok=True)

    # If Dataset being converted has a sample sheet, write it to the Dataset's staged directory
    if has_sample_sheet(arguments=argsList):
        write_sample_sheet(arguments=argsList, dataset=dataset)

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
        
    args = [program['executable_path']] + get_program_args(
        arguments=argsList,
        dataset=dataset,
        conversion_output_dir=conversion_output_dir
    )
    
    print(f"args: {args}")
    print("args (joined): " + " ".join(str(a) for a in args))
    
    if definition.get('capture_logs', False):
        cmd.execute_with_log_tracking(cmd=args, celery_task=celery_task, cwd=str(cwd) if cwd else None)
    else:
        cmd.execute(cmd=args, cwd=str(cwd) if cwd else None)
        
    
    print(f"task convert returned dataset_id, conversion_id")
    print(f"dataset_id: {dataset_id}")
    print(f"conversion_id: {conversion_id}")
    return {'dataset_id': dataset_id, 'conversion_id': conversion_id},

