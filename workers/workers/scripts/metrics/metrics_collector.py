from abc import ABC, abstractmethod
import socket


class MetricsCollector(ABC):
    def get_hostname(self):
        return socket.getfqdn()

    @abstractmethod
    def get_registration_metrics(self) -> List[Dict]:
        pass
