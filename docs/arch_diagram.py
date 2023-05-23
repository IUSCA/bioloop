from diagrams import Diagram, Cluster
from diagrams.generic.storage import Storage
from diagrams.onprem.compute import Server
from diagrams.onprem.database import Mongodb, Postgresql
from diagrams.onprem.network import Nginx
from diagrams.onprem.queue import Rabbitmq, Celery
from diagrams.programming.framework import Vue, Fastapi
from diagrams.programming.language import Javascript, Python

with Diagram("Architecture", show=False) as diag:
  with Cluster("Main"):
    app_reverse_proxy = Nginx("Ingress")
    ui = Vue("UI")
    app_api = Javascript("ExpressJS")
    ui - app_api
    app_reverse_proxy - ui

  with Cluster("colo carbonate"):
    celery = Celery("Celery")
    workers = Python("Workers")
    file_server = Nginx("File Server")

    celery >> workers

    with Cluster("HPFS"):
      sda = Storage("SDA")
      scratch = Storage("Slate Scratch")
      celery - sda
      celery - scratch
      file_server >> scratch

  with Cluster("commons"):
    app_db = Postgresql("App DB")
    celery_db = Mongodb("Result Backend")
    celery_queue = Rabbitmq("queue")

  with Cluster("core"):
    core_reverse_proxy = Nginx("Proxy")
    rhythm_api = Fastapi("Rhythm")
    core_reverse_proxy - rhythm_api
    auth = Server("auth")
    core_reverse_proxy - auth

  app_api - app_db
  app_api >> core_reverse_proxy
  app_api << celery
  celery - celery_queue
  celery - celery_db
  rhythm_api - celery_queue
  rhythm_api - celery_db
