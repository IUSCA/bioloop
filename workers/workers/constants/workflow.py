WORKFLOWS = {
    'INTEGRATED': 'integrated',
    'STAGE': 'stage',
    'PROCESS_DATASET_UPLOAD': 'process_dataset_upload',
    'CANCEL_DATASET_UPLOAD': 'cancel_dataset_upload'
}

WORKFLOW_FINISHED_STATUSES = {
    'REVOKED': 'REVOKED',
    'FAILURE': 'FAILURE',
    'SUCCESS': 'SUCCESS'
}

WORKFLOW_STATUSES = {
    'PENDING': 'PENDING',
    'STARTED': 'STARTED',
    **WORKFLOW_FINISHED_STATUSES
}
