from abc import ABC, abstractmethod
import socket


class MetricsCollector(ABC):
    def __init__(self):
        self.hostname = self.get_hostname()
    
    def get_hostname(self):
        return socket.getfqdn()

    @abstractmethod
    def get_registration_metrics(self) -> list[dict]:
        pass
