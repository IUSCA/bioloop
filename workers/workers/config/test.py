config = {
  'app_id': 'dgl-test.sca.iu.edu',
   'api': {
        'base_url': 'http://localhost:3130',
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