import datetime

# archiving directory name has year in its path to
# make it easier to purge data based on the year it was archived
YEAR = datetime.datetime.now().year
config = {
    'genome_file_types': ['.cbcl', '.bcl', '.bcl.gz', '.bgzf', '.fastq.gz', '.bam', '.bam.bai', '.vcf.gz',
                          '.vcf.gz.tbi', '.vcf'],
    'api': {
        'username': 'user',
        'password': 'pass',
        'base_url': 'https://dgl.sca.iu.edu/api/'
    },
    'paths': {
        'scratch': '/N/scratch/dgluser/dgl/production/scratch',
        'archive': f'archive/{YEAR}',
        'stage': '/N/scratch/dgluser/dgl/production/stage',
        'illumina_download': '/N/scratch/dgluser/dgl/production/scratch',
        'qc': '/N/scratch/dgluser/dgl/production/qc',
        'qc_public': '/N/u/dgluser/Carbonate/DGL/qc'
    },
    'registration': {
        'source_dirs': ['/N/project/DG_Multiple_Myeloma/share'],
        'rejects': ['.snapshots'],
        'wait_between_scans': 5 * 60,
        'recency_threshold': 60 * 60,
    },
    'illumina': {
        'registration': {
            'rejects': [],
            'recency_threshold': 60 * 60,  # 1 hour
            'minimum_project_size': 1024 * 1024 * 1024  # 1 GB
        },
    },

}
