class RetryableException(Exception):
    pass


class ValidationFailed(Exception):
    pass


class InspectionFailed(Exception):
    pass


class DatasetNotFound(Exception):
    pass

class UploadLogNotFound(Exception):
    pass
