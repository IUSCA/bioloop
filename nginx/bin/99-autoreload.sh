# 99-autoreload.sh

#!/bin/sh
while :; do
    # Optional: Instead of sleep, detect config changes and only reload if necessary.
    nginx -s reload
    sleep 10m
done &