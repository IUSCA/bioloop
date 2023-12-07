import os
import zipfile

import workers.sda as sda
import workers.api as api
from workers.config import config

# Config variables
src_dir = config['import_from_sda']['src_dir']
dest= config['import_from_sda']['dest_dir']
size_limit = config['import_from_sda']['size_limit']
creds = config['import_from_sda']['creds']

# Global variables
total_size = 0

# List of files to copy
directory_list = {}

# List of files that have been copied
copied_files = {}

# Flag to indicate if all files have been copied
still_copying = True


def copy_files(src_dir, dest_dir): 
    global total_size
    global directory_list
    global copied_files
    global still_copying

    # Don't copy new files if total size of copied files exceeds size limit
    if total_size > size_limit:
        return
    
    if directory_list == {}:
      directory_list = sda.list_directory_recursively(src_dir)
      directory_list = parse_output(directory_list)

    # Break out of loop if all files have been copied
    if copied_files == directory_list:
        still_copying = False
        return
    
    
    # Download files from SDA
    for files in directory_list:
        for file in files:
            file_size = sda.get_size(file)
            if total_size + file_size > size_limit:
                break
            
            sda.get(file, dest_dir, creds=creds)
            copied_files.append(file)
            total_size += file_size



def parse_output(output):
    lines = output.split('\n')
    dir = {}
    current_dir = None

    for i in range(len(lines)):
        line = lines[i]
        if line.endswith(':'):
            # Check if this directory is the deepest level
            if i + 1 < len(lines) and not lines[i + 1].endswith(':'):
                current_dir = line[:-1]
                dir[current_dir] = []
        elif current_dir is not None:
            dir[current_dir].append(line.strip())

    return dir

def process_files(dest_dir):
    for root, _dirs, files in os.walk(dest_dir):
        for file in files:
            if file.endswith('.zip') or not '.' in file:
                # Unzip file
                with zipfile.ZipFile(os.path.join(root, file), 'r') as zip_ref:
                    zip_ref.extractall(dest_dir)
                # Delete zip file
                os.remove(os.path.join(root, file))

def main():
  while still_copying:
    copy_files(src_dir, dest)
    process_files(dest)

if __name__ == "__main__":
    main()