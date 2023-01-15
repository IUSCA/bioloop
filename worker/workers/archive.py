from pathlib import Path
import tarfile

from config import config
import sda
import utils

def make_tarfile(tarfile_name, source_dir, source_size):
    tar_path = Path(f'{config["paths"]["scratch"]}/{tarfile_name}.tar')
    
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()
    
    with utils.track_progress_parallel( progress_fn=tar_progress, 
                                        progress_fn_args=(tar_path, source_size)):
        with tarfile.open(tar_path, 'w') as tar:
            tar.add(str(source_dir), arcname=tarfile_name, recursive=True)
    return tar_path


def archive(batch):
    # Tar the batch directory and compute checksum
    scratch_tar_path = make_tarfile(tarfile_name=batch['name'], 
                                    source_dir=batch['paths']['origin'],
                                    source_size=batch['du_size'])
    scratch_tar_path = Path(scratch_tar_path)
    scratch_digest = utils.checksum(scratch_tar_path)

    sda_tar_path = f'{config["paths"]["archive"]}/{batch["name"]}.tar'
    batch['paths']['archive'] = sda_tar_path
    
    print('sda put', str(scratch_tar_path), sda_tar_path)
    with utils.track_progress_parallel( progress_fn=hsi_put_progress, 
                                        progress_fn_args=(sda_path, batch['du_size'])):
        sda.put(source=scratch_tar_path, target=sda_tar_path)
    
    # validate whether the md5 checksums of local and SDA copies match
    sda_digest = sda.get_hash(sda_path)
    if sda_digest == scratch_digest:
        # file successfully uploaded to SDA, delete the local copy
        scratch_tar_path.unlink()
    else:
        raise Exception(f'Archive failed: Checksums of local {scratch_tar_path} ({scratch_digest}) and SDA {sda_tar_path} ({sda_digest}) do not match')
    return batch

def tar_progress(tar_path, total_size):
    size = Path(tar_path).stat().st_size
    return utils.progress(done=size, total=total_size)

def hsi_put_progress(sda_path, total_size):
    size = sda.get_size(sda_path)
    return utils.progress(done=size, total=total_size)

if __name__=='__main__':
    # print(config)
    # batch = {
    #     'name': 'sentieon_val_7',
    #     'paths': {
    #         'origin': '/N/project/DG_Multiple_Myeloma/share/sentieon_val_7'
    #     }
    # }
    # batch = {
    #     'name': 'worker',
    #     'paths': {
    #         'origin': '/N/u/dgluser/Carbonate/DGL/worker'
    #     }
    # }
    make_tarfile(tarfile_name='sentieon_val_7_bam', 
                source_dir='/N/project/DG_Multiple_Myeloma/share/sentieon_val_7/bam', 
                source_size=371544389559)
    # archive(batch, '/N/scratch/dgluser/test/sentieon_val_7.tar')
    # print(batch)


