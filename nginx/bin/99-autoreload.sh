#!/bin/bash

# 99-autoreload.sh


APP_DOMAIN=${APP_DOMAIN:-demo.bioloop.io}
CERT_FILE="/etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem"
LAST_MOD_TIME=$(stat -c %Y "$CERT_FILE")

while :; do
    CURRENT_MOD_TIME=$(stat -c %Y "$CERT_FILE")
    if [ "$CURRENT_MOD_TIME" != "$LAST_MOD_TIME" ]; then
        LAST_MOD_TIME=$CURRENT_MOD_TIME
        nginx -t && nginx -s reload
    fi
    sleep 10
done &