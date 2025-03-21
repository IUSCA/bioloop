import sys
import os

print("Python version:", sys.version)
print("Python executable:", sys.executable)
print("PYTHONPATH:", os.environ.get('PYTHONPATH', ''))
print("Current working directory:", os.getcwd())
print("Contents of current directory:")
for item in os.listdir('.'):
    print(f"  {item}")

print("\nTrying to import modules:")
for module in ['cmd', 'workers.cmd', 'workers.api', 'celery']:
    try:
        __import__(module)
        print(f"  Successfully imported {module}")
    except ImportError as e:
        print(f"  Failed to import {module}: {e}")

print("\nDetailed sys.path:")
for path in sys.path:
    print(f"  {path}")
