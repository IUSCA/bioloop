import logging
import shutil
from pathlib import Path
import hashlib
from datetime import datetime

from workers import api
from workers.config import config
import workers.utils as utils

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    print("CALLING PENDING RESUME SCRIPT")

    # test_str = "someString"
    # encoded = test_str.encode(encoding='UTF-8')
    # test_hash = hashlib.md5(encoded).hexdigest()
    # print(f'hash: {test_hash}')
    # print(utils.checksum(Path('/opt/sca/uploads/dataProductUploads/dp7/test_file')))

    pending_uploads = api.filter_upload_logs('PROCESSING')
    # if none being written to
    #   but all have expected checksums
    #   some don't have expected checksums
    print(f'pending_uploads : {len(pending_uploads)}')
    for upload in pending_uploads:
        print(f'upload: {upload}')
        print(f'upload["last_updated"]: {upload["last_updated"]}')
        last_updated_time = datetime.fromisoformat(upload['last_updated'][:-1])
        print('last_updated_time')
        print(str(last_updated_time))
        current_time = datetime.now()
        print('current_time')
        print(str(current_time))

        difference = (current_time - last_updated_time).total_seconds() / 3600
        print(difference)

        if difference > 24:
            print(f"Upload id {upload['id']} has been in state PROCESSING for more than 24 hours, and will be cleaned up")
            try:
                api.post_upload_log(upload['id'], {
                    'status': 'FAILED'
                })
                shutil.rmtree(upload['dataset']['origin_path'])
            except Exception as e:
                print(f"Encountered exception processing upload log with id {upload['id']}")
                print(e)




if __name__ == "__main__":
    main()
