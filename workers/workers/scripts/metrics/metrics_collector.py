from abc import ABC, abstractmethod


class MetricsCollector(ABC):
    @abstractmethod
    def get_hostname(self):
        pass

    # @abstractmethod
    # def get_disk_usages(self):
    #     pass

    @abstractmethod
    def get_staging_space_usage(self):
        pass

    @abstractmethod
    def get_registration_spaces_usage(self):
        pass

    @abstractmethod
    def get_storage_spaces_usage(self):
        pass
