import datetime

YEAR = datetime.datetime.now().year

# Production overrides

config = {
    'app_id': 'cfndap-test.sca.iu.edu',
    'api': {
        'base_url': 'https://cfndap-test.sca.iu.edu/api/',  # trailing slash is required
    },
    'celery': {
        'queue': {
            'url': 'commons3.sca.iu.edu:5672/celery_api',
            'username': 'celery_api',
        },
        'mongo': {
            'url': 'commons3.sca.iu.edu:27017/celery_api?authSource=celery_api',
            'username': 'celery_api',
        }
    }
}
