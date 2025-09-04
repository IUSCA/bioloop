from pathlib import Path

logs_dir = Path('/opt/sca/tests/register_ondemand/logs')
logs_dir.mkdir(parents=True, exist_ok=True)

data_dir = Path('/opt/sca/tests/register_ondemand/data')
data_dir.mkdir(parents=True, exist_ok=True)
