import datetime

 # archiving directory name has year in its path to
 # make it easier to purge data based on the year it was archived
YEAR = datetime.datetime.now().year
config = {
    'api': {
        'username': 'user',
        'password': 'pass',
        'base_url': ''
    },
    'paths': {
        'scratch': '/N/scratch/dgluser/test',
        'archive': f'archive/{YEAR}',
        'stage': '/N/project/DG_Multiple_Myeloma/share/test/staging',
    }
}