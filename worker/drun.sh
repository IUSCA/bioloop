PORT=5001
sudo docker run --rm -it \
  --add-host=host.docker.internal:host-gateway \
  -v `pwd`/scaworkers:/opt/sca/app/scaworkers \
  -v `pwd`/.env:/opt/sca/app/.env
  -e PORT=$PORT -p 127.0.0.1:$PORT:$PORT/tcp dgl_worker_api_test bash