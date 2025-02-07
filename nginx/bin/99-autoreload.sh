# 99-autoreload.sh


APP_DOMAIN=${APP_DOMAIN:-demo.bioloop.io}

#!/bin/bash
while :; do
    # Detect cert changes and reload if necessary.
    inotifywait /etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem && \
    nginx -s reload
done &