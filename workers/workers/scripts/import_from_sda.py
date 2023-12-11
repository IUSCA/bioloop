import os
import shutil
import sys
import time

import workers.sda as sda
from workers.config import config
import workers.cmd as cmd


# Config variables
src_dir = config['import_from_sda']['src_dir']
dest= config['import_from_sda']['dest_dir']
size_limit = int(config['import_from_sda']['size_limit'])
creds = config['import_from_sda']['creds']
script_dir = config['import_from_sda']['script_dir']


def main():
  try:

    # Starting vars
    total_size = 0
    directory_list = {}
    copied_files = {}
    still_copying = True

    while still_copying:

      # Don't copy new files if total size of copied files exceeds size limit
      if total_size > size_limit:
          print(f"Total size of copied files: {total_size} exceeds size limit: {size_limit}. Sleeping for 5 minutes...")
          time.sleep(300)
          return
      
      # Get directory list if empty
      if directory_list == {}:
        directory_list = sda.list_directory_recursively(src_dir, creds=creds)
        directory_list = parse_output(directory_list)

        # DEBUG PRINTS
        print("DIRECTORY_LIST", directory_list)

      # Break out of loop if all files have been copied
      if copied_files == directory_list:
          still_copying = False
          return
      
      
      # Download files from SDA
      for directory, files in directory_list.items():
          
          # Create landing directory
          curr_dest_dir = os.path.join(dest, os.path.basename(directory))
          os.makedirs(curr_dest_dir, exist_ok=True)
          print("Created landing directory... ", curr_dest_dir)

          
          # DEBUG PRINTS
          print("DIRECTORY", directory)
          print("FILES", files)

          for file in files:
              # DEBUG PRINTS
              print("FILE", file)

              # Create full file path
              file_path = os.path.join(directory, file)

              # Pause if total size of copied files exceeds size limit
              file_size = sda.get_size(file_path, creds=creds)
              if total_size + file_size > size_limit:
                  print(f"Total size of current file: {file_size} exceeds size limit: {size_limit}. Sleeping for 5 minutes...")
                  time.sleep(300)
                  return
              
              # Create full destination file path
              dest_file_path = os.path.join(curr_dest_dir, file)

              # Download file
              print("Downloading file... ", file_path)
              sda.get(file_path, dest_file_path, creds=creds)

              # Add file to copied_files
              if directory not in copied_files:
                  copied_files[directory] = []
                  copied_files[directory].append(file)
        
              # Unzip compressed files
              unzip_file(dest_file_path)

              # Update total size
              total_size += file_size

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


def unzip_file(file_path):
    command = [f'{script_dir}extract.sh', file_path]

    stdout, stderr = cmd.execute(command)

    # DEBUG PRINTS
    print("STDOUT", stdout)
    print("STDERR", stderr)


    copy_folders_with_files(file_path, dest)



def copy_folders_with_files(src_dir, dest_dir):
    for root, dirs, files in os.walk(src_dir):
        if files:  # if the directory contains any files
            # construct the destination path
            dest_path = os.path.join(dest_dir, os.path.relpath(root, src_dir))
            # copy the directory to the destination path
            shutil.copytree(root, dest_path)

# usage
copy_folders_with_files('/path/to/source', '/path/to/destination')



if __name__ == "__main__":
    main()