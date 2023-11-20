import logging
import shutil
from pathlib import Path
import hashlib

from workers import api
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    print("CALLING PENDING RESUME SCRIPT")

    pending_uploads = api.filter_upload_logs('PROCESSING')
    # if none being written to
    #   but all have expected checksums
    #   some don't have expected checksums
    print(f'pending_uploads : {len(pending_uploads)}')
    for upload in pending_uploads:
        for file in upload['files']:
            if file['status'] != 'COMPLETE':
                path = Path(file['destination_path'])
                print(f'name: {file["name"]}')
                with open(path, 'rb') as pending_file:
                    data = pending_file.read()
                    md5 = hashlib.md5(data).hexdigest()
                    print(f'md5: ', md5)



if __name__ == "__main__":
    main()
