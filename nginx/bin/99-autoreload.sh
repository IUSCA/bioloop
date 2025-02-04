# 99-autoreload.sh

APP_DOMAIN=${APP_DOMAIN:-demo.bioloop.io}

#!/bin/sh
while :; do
    # Detect cert changes and reload if necessary.
    inotifywait -e close_write,moved_to,create /etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem
    nginx -s reload
done &