import os
import sys
import time
import tarfile
import shutil
import tempfile

import workers.sda as sda
from workers.config import config
from pathlib import Path

# Config variables
src_dir = config['import_from_sda']['src_dir']
dest= config['import_from_sda']['dest_dir']
size_limit = int(config['import_from_sda']['size_limit'])
creds = config['import_from_sda']['creds']
script_dir = config['import_from_sda']['script_dir']

# Custom exception
class ContinueException(Exception): pass

def main():
  try:

    # Starting vars
    total_size = 0
    directory_list = None
    copied_files = {}
    still_copying = True

    while still_copying:
      try:
        # DEBUG PRINTS
        print("DIRECTORY_LIST", directory_list)

        # Don't copy new files if total size of copied files exceeds size limit
        total_size = get_directory_size(dest)
        if total_size > size_limit:
            print(f"Total size of copied files: {total_size} exceeds size limit: {size_limit}. Sleeping for 5 min ...")
            time.sleep(300)
            raise ContinueException
        
        # Get directory list if empty
        if directory_list == None:
          directory_list = sda.list_directory_recursively(src_dir, creds=creds)
          directory_list = parse_output(directory_list)

        # DEBUG PRINTS
        print("DIRECTORY_LIST", directory_list)

        # Break out of loop if all files have been copied
        if not directory_list:
            still_copying = False
            return
        
        
        # Download files from SDA
        for directory, files in list(directory_list.items()):
            
            # Create landing directory
            curr_dest_dir = os.path.join(dest, os.path.basename(directory))
            os.makedirs(curr_dest_dir, exist_ok=True)
            print("Created landing directory... ", curr_dest_dir)

            
            # DEBUG PRINTS
            print("DIRECTORY", directory)
            print("FILES", files)

            for file in files:
                # Recreate landing directory if it was deleted by unzipping process
                if not os.path.exists(curr_dest_dir):
                  curr_dest_dir = os.path.join(dest, os.path.basename(directory))
                  os.makedirs(curr_dest_dir, exist_ok=True)
                  print("Re-created landing directory... ", curr_dest_dir)

                # DEBUG PRINTS
                print("FILE", file)

                # Create full file path
                file_path = os.path.join(directory, file)

                # Pause if total size of copied files exceeds size limit
                file_size = sda.get_size(file_path, creds=creds)
                total_size = get_directory_size(dest)
                if total_size + file_size > size_limit:
                    print(f"Total size of current file: {file_size} exceeds size limit: {size_limit}. Sleeping for 10...")
                    time.sleep(300)
                    raise ContinueException
                
                # Create full destination file path
                dest_file_path = os.path.join(curr_dest_dir, file)

                # Download file
                print("Downloading file... ", file_path)
                sda.get(file_path, dest_file_path, creds=creds)

                # Add file to copied_files
                if directory not in copied_files:
                    copied_files[directory] = []
                    copied_files[directory].append(file)

                # Remove file from directory_list
                directory_list[directory].remove(file)

                # Remove directory from directory_list if empty
                if directory_list[directory] == []:
                    del directory_list[directory]
          
                # Unzip compressed files
                if tarfile.is_tarfile(dest_file_path):
                  print("Extracting tar file... ", dest_file_path)
                  print("Extracting to... ", curr_dest_dir)
                  extract_tarfile(Path(dest_file_path), Path(curr_dest_dir))

                # Update total size
                total_size += file_size
      except ContinueException:
        continue

  # Handle keyboard interrupt
  except KeyboardInterrupt:
    print("\nInterrupted by user. Exiting...")
    sys.exit(0)

# Parse output from sda.list_directory_recursively
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


def extract_tarfile(tar_path: Path, target_dir: Path, override_arcname=False):
    """
    tar_path: path to the tar file to extract
    target_dir: path to the top level directory after extraction

    extracts the tar file to  target_dir.

    The directory created here after extraction will have the same name as the top level directory inside the archive.

    If that is not desired and the name of the directory created needs to be the same as target_dir.name,
    then set override_arcname = True

    If a directory with the same name as extracted dir already exists, it will be deleted.
    @param tar_path:
    @param target_dir:
    @param override_arcname:
    """
    with tarfile.open(tar_path, mode='r') as archive:
        # find the top-level directory in the extracted archive
        archive_name = os.path.basename(os.path.commonprefix(archive.getnames()))
        print("archive_name", archive_name)
        extraction_dir = Path(os.path.join(target_dir, archive_name))



        # if extraction_dir exists then delete it
        if extraction_dir.exists():
            shutil.rmtree(extraction_dir)

        # create parent directories if missing
        extraction_dir.mkdir(parents=True, exist_ok=True)

        archive.extractall(path=extraction_dir)




# Get size of directory
def get_directory_size(directory):
    total = 0
    for path, dirs, files in os.walk(directory):
        for f in files:
            fp = os.path.join(path, f)
            total += os.path.getsize(fp)
    return total


if __name__ == "__main__":
    main()