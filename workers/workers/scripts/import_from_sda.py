import os
import zipfile

import workers.sda as sda
import workers.api as api
from workers.config import config

# Config variables
src_dir = config['import_from_sda']['src_dir']
dest= config['import_from_sda']['dest_dir']
size_limit = int(config['import_from_sda']['size_limit'])
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
      directory_list = sda.list_directory_recursively(src_dir, creds=creds)
      directory_list = parse_output(directory_list)
      print("DIRECTORY_LIST", directory_list)

    # Break out of loop if all files have been copied
    if copied_files == directory_list:
        still_copying = False
        return
    
    
    # Download files from SDA
    for directory, files in directory_list.items():
        print("DIRECTORY", directory)
        print("FILES", files)
        for file in files:
            print("FILE", file)
            file_path = os.path.join(directory, file)

            file_size = sda.get_size(file_path, creds=creds)
            if total_size + file_size > size_limit:
                break
            
            dest_file_path = os.path.join(dest_dir, file)

            sda.get(file_path, dest_file_path, verify_checksum=False, creds=creds)
            copied_files.append(file)
            total_size += file_size

def parse_output(input_string):
    directory_structure = {}
    lines = input_string.split('\n')
    current_directory = None

    for line in lines:
        if line.endswith(':'):
            # Remove directory only list
            if current_directory is not None and directory_structure[current_directory] == []:
                del directory_structure[current_directory]

            # Add new directory
            current_directory = line[:-1]
            directory_structure[current_directory] = []

        elif line.strip() and current_directory is not None:  
            # Split each line by whitespace and add to directory list if file and not directory
            for file in line.split():
              if not file.endswith('/'):
                directory_structure[current_directory].append(file)

    return directory_structure


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