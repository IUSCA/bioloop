import workers.api as api

datasets = api.get_all_datasets()

print(len(datasets))
