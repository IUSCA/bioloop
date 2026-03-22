class RetryableException(Exception):
    pass


class ValidationFailed(Exception):
    pass


class InspectionFailed(Exception):
    pass


class DuplicateDetected(InspectionFailed):
    """
    Raised inside inspect_dataset when the incoming dataset is determined to be
    a duplicate of an existing INSPECTED dataset.  Catching this exception in
    declarations.py prevents celery from retrying the task; the integrated
    workflow terminates without error retries.
    """
    pass


class ProcessingFailed(Exception):
    pass
