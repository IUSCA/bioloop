import os
import sys
import shutil


# Copy to root of destination directory
def main():
  try:
    src_dir = "/N/scratch/scadev/Landing/Eclipse"
    dest = '/N/scratch/scadev/Landing'
    for root, dirs, files in os.walk(src_dir):
        # if the directory contains any files
        if files:

            # construct the destination path
            dest_path = os.path.join(dest, os.path.relpath(root, src_dir))

            # DEBUG PRINTS
            print("DEST_PATH", dest_path)
            print("ROOT", root)

            # Move the directory to the destination path
            shutil.move(root, dest_path)

  # Handle keyboard interrupt
  except KeyboardInterrupt:
    print("\nInterrupted by user. Exiting...")
    sys.exit(0)



if __name__ == "__main__":
    main()
